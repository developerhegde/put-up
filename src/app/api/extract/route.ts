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
    // Extract API key and model selection from headers (client-side override) or fallback to environment variables
    const headerKey = req.headers.get('x-gemini-key');
    const headerModel = req.headers.get('x-gemini-model');
    
    const apiKey = (headerKey && headerKey !== 'your_gemini_api_key_here') 
      ? headerKey 
      : process.env.GEMINI_API_KEY;

    const modelName = headerModel === 'gemini-1.5-pro' ? 'gemini-1.5-pro' : 'gemini-3.5-flash';

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
    
    // Using specified model (Flash for speed, Pro for frontier accuracy)
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
        temperature: 0.0, // Force deterministic output to maximize extraction accuracy
      },
    });

    const filePart = {
      inlineData: {
        data: base64Data,
        mimeType: file.type,
      },
    };

    const prompt = `Analyze this invoice and extract the structured data. Follow these strict rules to ensure high-accuracy extraction:
1. **Vendor Name:** Look at the top-left or header of the invoice. Identify the issuing company/vendor.
2. **GSTIN / GST Number:** Search the header, footer, and tables. Indian GSTIN is a 15-character identifier (e.g. starting with state code like '29', '27', etc. and matching format like 29ABCDE1234F1Z5). If missing or unclear, return null.
3. **Customer Name:** Identify the billed-to or consigned-to party (e.g., 'Bill To', 'Client Name', 'Billed To').
4. **Line Items:** Extract ALL line items. For each item:
   - **description:** Full item description or name.
   - **quantity:** If not specified, default to 1.
   - **taxableValue:** This MUST be the taxable value/subtotal of the item *before* tax/GST. If the invoice only lists the final item total including tax, calculate the taxable value by backing out the tax: taxableValue = Total / (1 + GST% / 100).
   - **gstPercent:** The specific tax rate (e.g. 5, 12, 18, 28, or 0) applied to this specific line item. Check itemized tax tables or notes.
5. **No Guessing:** If a value is unreadable, blurred, or missing, set the field to null instead of inventing values.`;

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
