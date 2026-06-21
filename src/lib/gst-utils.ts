import { z } from 'zod';

// Zod Schema for validation of Gemini output
export const RawLineItemSchema = z.object({
  description: z.string().describe("Description or name of the item. If not clear, use a generic name like 'Line Item'"),
  quantity: z.number().default(1).describe("Quantity of items. Default to 1 if not clear or not specified."),
  taxableValue: z.number().describe("The total taxable value or amount before tax. If only unit price is given, this should be unit price * quantity."),
  gstPercent: z.number().default(0).describe("The GST percentage rate applied to this item (e.g. 5, 12, 18, 28, or 0)"),
});

export const RawInvoiceSchema = z.object({
  vendorName: z.string().nullable().describe("The name of the issuing company/vendor. Mark as null if missing or low confidence."),
  gstNumber: z.string().nullable().describe("The 15-character GSTIN / GST Number of the vendor. Mark as null if missing or low confidence."),
  customerName: z.string().nullable().describe("The customer or billed-to name. Mark as null if missing or low confidence."),
  lineItems: z.array(RawLineItemSchema).describe("List of all individual items listed in the invoice"),
});

export type RawLineItem = z.infer<typeof RawLineItemSchema>;
export type RawInvoice = z.infer<typeof RawInvoiceSchema>;

export interface GstGroup {
  gstPercent: number;
  taxableValue: number;
  gstAmount: number;
}

export interface Invoice {
  id: string;
  fileName: string;
  vendorName: string | null;
  gstNumber: string | null;
  customerName: string | null;
  lineItems: RawLineItem[];
  gstBreakdown: GstGroup[];
  totalGst: number;
  total: number;
  confidenceStatus: 'confident' | 'low_confidence' | 'failed';
  errorDetail?: string;
  createdAt: string;
}

/**
 * Utility to round number to 2 decimal places securely.
 */
export function roundTo2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Processes raw invoice data, groups line items by GST percentage, and calculates all subtotals and grand totals.
 */
export function compileInvoice(
  rawInvoice: RawInvoice,
  fileName: string,
  id: string = Math.random().toString(36).substring(2, 9),
  confidenceStatus: 'confident' | 'low_confidence' | 'failed' = 'confident'
): Invoice {
  const lineItems = rawInvoice.lineItems || [];
  
  // Group line items by GST percentage
  const groupsMap: { [percent: number]: { taxableValue: number; gstAmount: number } } = {};
  
  lineItems.forEach((item) => {
    const percent = roundTo2(Number(item.gstPercent) || 0);
    const taxable = roundTo2(Number(item.taxableValue) || 0);
    const itemGst = roundTo2(taxable * (percent / 100));
    
    if (!groupsMap[percent]) {
      groupsMap[percent] = { taxableValue: 0, gstAmount: 0 };
    }
    
    groupsMap[percent].taxableValue += taxable;
    groupsMap[percent].gstAmount += itemGst;
  });
  
  // Convert groups map to array of GstGroup
  const gstBreakdown: GstGroup[] = Object.keys(groupsMap)
    .map((key) => {
      const percent = parseFloat(key);
      return {
        gstPercent: percent,
        taxableValue: roundTo2(groupsMap[percent].taxableValue),
        gstAmount: roundTo2(groupsMap[percent].gstAmount),
      };
    })
    .sort((a, b) => a.gstPercent - b.gstPercent); // Sort by percentage ascending
  
  // Sum across groups
  const totalGst = roundTo2(gstBreakdown.reduce((sum, g) => sum + g.gstAmount, 0));
  const totalTaxable = roundTo2(gstBreakdown.reduce((sum, g) => sum + g.taxableValue, 0));
  const total = roundTo2(totalTaxable + totalGst);
  
  // Determine confidence status based on missing key fields
  let finalStatus = confidenceStatus;
  if (finalStatus === 'confident') {
    const isMissingKeyField = !rawInvoice.vendorName || !rawInvoice.gstNumber || lineItems.length === 0;
    if (isMissingKeyField) {
      finalStatus = 'low_confidence';
    }
  }

  return {
    id,
    fileName,
    vendorName: rawInvoice.vendorName,
    gstNumber: rawInvoice.gstNumber,
    customerName: rawInvoice.customerName,
    lineItems,
    gstBreakdown,
    totalGst,
    total,
    confidenceStatus: finalStatus,
    createdAt: new Date().toISOString(),
  };
}
