import * as XLSX from 'xlsx';
import { Invoice } from './gst-utils';

/**
 * Compiles a list of processed invoices and triggers a download of a formatted multi-sheet .xlsx file.
 */
export function exportInvoicesToExcel(invoices: Invoice[]) {
  if (invoices.length === 0) return;

  // Create workbook
  const wb = XLSX.utils.book_new();

  // Sheet 1: Summary of Invoices
  const summaryHeaders = [
    'File Name',
    'Vendor Name',
    'Vendor GSTIN',
    'Customer Name',
    'Taxable Subtotal',
    'Total GST Amount',
    'Grand Total (Incl. Tax)',
    'Confidence Status',
    'Date Scanned'
  ];

  const summaryRows = invoices.map((inv) => {
    const taxableSubtotal = inv.gstBreakdown.reduce((sum, g) => sum + g.taxableValue, 0);
    return [
      inv.fileName,
      inv.vendorName || 'Review Required',
      inv.gstNumber || 'Review Required',
      inv.customerName || 'Review Required',
      taxableSubtotal,
      inv.totalGst,
      inv.total,
      inv.confidenceStatus === 'confident' ? 'High' : 'Low Confidence (Review)',
      new Date(inv.createdAt).toLocaleString()
    ];
  });

  const summarySheetData = [summaryHeaders, ...summaryRows];
  const wsSummary = XLSX.utils.aoa_to_sheet(summarySheetData);

  // Set column widths for summary sheet
  const summaryCols = [
    { wch: 25 }, // File Name
    { wch: 25 }, // Vendor Name
    { wch: 20 }, // GSTIN
    { wch: 25 }, // Customer Name
    { wch: 18 }, // Taxable Subtotal
    { wch: 18 }, // Total GST Amount
    { wch: 22 }, // Grand Total
    { wch: 25 }, // Confidence Status
    { wch: 22 }  // Date Scanned
  ];
  wsSummary['!cols'] = summaryCols;

  XLSX.utils.book_append_sheet(wb, wsSummary, 'Invoices Summary');

  // Sheet 2: GST Breakdown Details
  const breakdownHeaders = [
    'Invoice File Name',
    'Vendor Name',
    'Vendor GSTIN',
    'GST Rate (%)',
    'Taxable Value',
    'GST Amount',
    'Group Total (Taxable + GST)'
  ];

  const breakdownRows: any[] = [];
  invoices.forEach((inv) => {
    if (inv.gstBreakdown.length === 0) {
      // Handle cases where no GST items were parsed
      breakdownRows.push([
        inv.fileName,
        inv.vendorName || 'Review Required',
        inv.gstNumber || 'Review Required',
        '0%',
        inv.total,
        0,
        inv.total
      ]);
    } else {
      inv.gstBreakdown.forEach((group) => {
        breakdownRows.push([
          inv.fileName,
          inv.vendorName || 'Review Required',
          inv.gstNumber || 'Review Required',
          `${group.gstPercent}%`,
          group.taxableValue,
          group.gstAmount,
          group.taxableValue + group.gstAmount
        ]);
      });
    }
  });

  const breakdownSheetData = [breakdownHeaders, ...breakdownRows];
  const wsBreakdown = XLSX.utils.aoa_to_sheet(breakdownSheetData);

  // Set column widths for breakdown sheet
  const breakdownCols = [
    { wch: 25 }, // Invoice File Name
    { wch: 25 }, // Vendor Name
    { wch: 20 }, // GSTIN
    { wch: 15 }, // GST Rate
    { wch: 18 }, // Taxable Value
    { wch: 18 }, // GST Amount
    { wch: 25 }  // Group Total
  ];
  wsBreakdown['!cols'] = breakdownCols;

  XLSX.utils.book_append_sheet(wb, wsBreakdown, 'GST Rate Breakdown');

  // Generate binary and trigger browser download
  const dateString = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `PutUp_Invoices_GST_Report_${dateString}.xlsx`);
}
