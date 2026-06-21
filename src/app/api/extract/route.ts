import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { RawInvoiceSchema } from '@/lib/gst-utils';

export const maxDuration = 60; // Allow longer execution time for Gemini PDF processing if needed

const responseSchema: any = {
  type: "OBJECT",
  properties: {
    vendorName: {
      type: "STRING",
      description: "The name of the issuing company/vendor. Mark as null if missing or low confidence.",
      nullable: true
    },
    gstNumber: {
      type: "STRING",
      description: "The 15-character GSTIN (GST identification number) of the vendor. Format is typically 2 numbers, 10 alphanumeric characters, 1 number, 1 character, 1 number. Mark as null if missing or low confidence.",
      nullable: true
    },
    customerName: {
      type: "STRING",
      description: "The name of the customer / billed-to party. Mark as null if missing or low confidence.",
      nullable: true
    },
    lineItems: {
      type: "ARRAY",
      description: "List of all individual items, products, or services listed in the invoice.",
      items: {
        type: "OBJECT",
        properties: {
          description: {
            type: "STRING",
            description: "Description or name of the item. If not clear, use a generic name like 'Line Item'."
          },
          quantity: {
            type: "NUMBER",
            description: "Quantity of items. Default to 1 if not specified."
          },
          taxableValue: {
            type: "NUMBER",
            description: "The total taxable value or amount before tax. If only unit price is given, this should be unit price * quantity. Exclude tax."
          },
          gstPercent: {
            type: "NUMBER",
            description: "The GST percentage rate applied to this item (e.g. 5, 12, 18, 28, or 0)."
          }
        },
        required: ["description", "quantity", "taxableValue", "gstPercent"]
      }
    }
  },
  required: ["lineItems"]
};

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;
  const isConfigured = !!apiKey && apiKey !== 'your_gemini_api_key_here';
  return NextResponse.json({ configured: isConfigured });
}

export async function POST(req: Request) {
  try {
    // Extract API key from headers (client-side override) or fallback to environment variables
    const headerKey = req.headers.get('x-gemini-key');
    const apiKey = (headerKey && headerKey !== 'your_gemini_api_key_here') 
      ? headerKey 
      : process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
      return NextResponse.json(
        { error: 'Gemini API Key is not configured. Please set GEMINI_API_KEY in .env.local or enter it in the web dashboard settings.' },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Supported file types check
    const supportedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!supportedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Only JPG, PNG, and PDF files are supported.` },
        { status: 400 }
      );
    }

    // Read the file as buffer and convert to base64
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Data = buffer.toString('base64');

    // Initialize Gemini API
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Using gemini-3.5-flash which supports multimodal input and structured JSON response
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
      },
    });

    const filePart = {
      inlineData: {
        data: base64Data,
        mimeType: file.type,
      },
    };

    const prompt = `Analyze this invoice and extract:
1. Vendor / Company Name (the issuer of the invoice)
2. GSTIN / GST Number of the vendor (look for a 15-character code starting with state code, e.g. 29ABCDE1234F1Z5)
3. Customer name (the person or business the invoice is billed/consigned to)
4. List of all line items. For each item, extract:
   - Description or name of the item
   - Quantity (default to 1 if not specified)
   - Taxable value (total amount for this item before tax/GST)
   - GST percentage rate (e.g. 5, 12, 18, 28, or 0 if exempt/no tax). If multiple tax rates are present, match each item with its corresponding tax rate.

If a field is missing, illegible, or you are unsure, return null for vendorName, gstNumber, or customerName. Do not guess.`;

    const result = await model.generateContent([prompt, filePart]);
    const responseText = result.response.text();

    if (!responseText) {
      return NextResponse.json({ error: 'Empty response from Gemini API' }, { status: 500 });
    }

    // Parse and validate with Zod schema
    const parsedData = JSON.parse(responseText);
    const validatedData = RawInvoiceSchema.safeParse(parsedData);

    if (!validatedData.success) {
      console.error('Zod Validation Error:', validatedData.error);
      return NextResponse.json(
        { error: 'Failed to validate extracted invoice structure.', details: validatedData.error },
        { status: 500 }
      );
    }

    return NextResponse.json(validatedData.data);
  } catch (error: any) {
    console.error('API Error during extraction:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred during invoice extraction.' },
      { status: 500 }
    );
  }
}
