import { describe, it, expect } from 'vitest';
import { compileInvoice, RawInvoice } from './gst-utils';

describe('GST Grouping & Compilation Logic', () => {
  it('should compile an invoice with a single GST rate correctly', () => {
    const raw: RawInvoice = {
      vendorName: 'Single Vendor',
      gstNumber: '29ABCDE1234F1Z5',
      customerName: 'Vikas Hegde',
      lineItems: [
        { description: 'Item 1', quantity: 2, taxableValue: 1000, gstPercent: 18 },
        { description: 'Item 2', quantity: 1, taxableValue: 2000, gstPercent: 18 },
      ],
    };

    const compiled = compileInvoice(raw, 'invoice1.pdf');

    expect(compiled.vendorName).toBe('Single Vendor');
    expect(compiled.gstNumber).toBe('29ABCDE1234F1Z5');
    expect(compiled.customerName).toBe('Vikas Hegde');
    expect(compiled.confidenceStatus).toBe('confident');

    // Total taxable value = 1000 + 2000 = 3000
    // GST at 18% = 3000 * 0.18 = 540
    // Grand Total = 3540
    expect(compiled.totalGst).toBe(540);
    expect(compiled.total).toBe(3540);

    expect(compiled.gstBreakdown).toHaveLength(1);
    expect(compiled.gstBreakdown[0]).toEqual({
      gstPercent: 18,
      taxableValue: 3000,
      gstAmount: 540,
    });
  });

  it('should compile an invoice with multiple GST rates correctly', () => {
    const raw: RawInvoice = {
      vendorName: 'Multi Vendor',
      gstNumber: '29ABCDE1234F1Z5',
      customerName: 'Vikas Hegde',
      lineItems: [
        { description: 'Item 5%', quantity: 1, taxableValue: 2000, gstPercent: 5 },
        { description: 'Item 18%', quantity: 1, taxableValue: 8220, gstPercent: 18 },
      ],
    };

    const compiled = compileInvoice(raw, 'invoice2.jpg');

    // Group 1: 5% of 2000 = 100
    // Group 2: 18% of 8220 = 1479.6
    // Total GST = 1579.6
    // Total Taxable = 10220
    // Grand Total = 11799.6
    expect(compiled.totalGst).toBe(1579.6);
    expect(compiled.total).toBe(11799.6);

    expect(compiled.gstBreakdown).toHaveLength(2);
    expect(compiled.gstBreakdown[0]).toEqual({
      gstPercent: 5,
      taxableValue: 2000,
      gstAmount: 100,
    });
    expect(compiled.gstBreakdown[1]).toEqual({
      gstPercent: 18,
      taxableValue: 8220,
      gstAmount: 1479.6,
    });
  });

  it('should compile an invoice with zero GST items or no GST rate specified', () => {
    const raw: RawInvoice = {
      vendorName: 'Zero Vendor',
      gstNumber: '29ABCDE1234F1Z5',
      customerName: 'Vikas Hegde',
      lineItems: [
        { description: 'Item Exempt', quantity: 3, taxableValue: 500, gstPercent: 0 },
        { description: 'Item No Tax', quantity: 1, taxableValue: 1000, gstPercent: 0 },
      ],
    };

    const compiled = compileInvoice(raw, 'exempt_invoice.png');

    expect(compiled.totalGst).toBe(0);
    expect(compiled.total).toBe(1500);
    expect(compiled.gstBreakdown).toHaveLength(1);
    expect(compiled.gstBreakdown[0]).toEqual({
      gstPercent: 0,
      taxableValue: 1500,
      gstAmount: 0,
    });
  });

  it('should flag low confidence if key fields are missing or there are no line items', () => {
    const rawMissingGst: RawInvoice = {
      vendorName: 'Acme Inc',
      gstNumber: null,
      customerName: 'Vikas Hegde',
      lineItems: [
        { description: 'Item 1', quantity: 1, taxableValue: 100, gstPercent: 18 },
      ],
    };

    const compiledMissingGst = compileInvoice(rawMissingGst, 'invoice3.pdf');
    expect(compiledMissingGst.confidenceStatus).toBe('low_confidence');

    const rawNoLines: RawInvoice = {
      vendorName: 'Acme Inc',
      gstNumber: '29ABCDE1234F1Z5',
      customerName: 'Vikas Hegde',
      lineItems: [],
    };

    const compiledNoLines = compileInvoice(rawNoLines, 'empty_invoice.pdf');
    expect(compiledNoLines.confidenceStatus).toBe('low_confidence');
  });

  it('should handle floating point rounding issues correctly', () => {
    const raw: RawInvoice = {
      vendorName: 'Rounding Vendor',
      gstNumber: '29ABCDE1234F1Z5',
      customerName: 'Vikas Hegde',
      lineItems: [
        // 18% of 10.05 = 1.809 -> rounds to 1.81
        { description: 'Item A', quantity: 1, taxableValue: 10.05, gstPercent: 18 },
        // 18% of 20.03 = 3.6054 -> rounds to 3.61
        { description: 'Item B', quantity: 1, taxableValue: 20.03, gstPercent: 18 },
      ],
    };

    const compiled = compileInvoice(raw, 'rounding.pdf');
    // Total taxable: 30.08
    // GST: 1.81 + 3.61 = 5.42
    // Grand Total: 35.50
    expect(compiled.totalGst).toBe(5.42);
    expect(compiled.total).toBe(35.5);
  });
});
