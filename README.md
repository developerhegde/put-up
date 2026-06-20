# PutUp — AI Invoice Scanner & GST Compiler

**PutUp** is a Next.js web application that parses uploaded invoices (PDFs, JPEGs, PNGs) using Gemini 3.5 Flash, extracts metadata, groups individual line items by their GST rate subtotal breakdowns, and compiles them into a ledger view. It allows manual editing in the UI (with live tax recalculation) and exports the data to a multi-sheet Excel file (.xlsx) using SheetJS.

## Features
- **Multimodal AI Extraction:** Drag-and-drop batch upload files to process concurrently using Gemini 3.5 Flash.
- **GST Grouping:** Line items are grouped and subtotaled by their GST percentage rate (0%, 5%, 12%, 18%, 28%) and aggregated.
- **In-App Spreadsheet Ledger:** Rendered as an expandable table showing subtotal, tax amount, and grand totals.
- **Editable Detail Panel:** Adjust names, GSTINs, and individual item parameters directly, which automatically triggers real-time tax recalculations.
- **Excel Export:** Download report as formatted `.xlsx` containing an "Invoices Summary" sheet and a "GST Rate Breakdown" detail sheet.
- **Mock Demo Mode:** Load sample invoices immediately to test features without any configuration.
- **Fail-safe API Keys:** Set keys via `.env.local` or override them securely via the in-app settings modal.

---

## Quick Start

### 1. Configure the Gemini API Key
Create a `.env.local` file in the root folder (or modify the template) and enter your API Key:
```env
GEMINI_API_KEY=AIzaSy...
```
*Note: Alternatively, you can click "Configure Gemini Key" on the dashboard to store it locally in your browser's localStorage, keeping your developer environment clean.*

### 2. Install Dependencies
Ensure you have Node.js (v18+) installed. Run:
```bash
npm install
```

### 3. Run the Development Server
Launch the development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser to view the application.

---

## Technical Information

### Run Unit Tests
We use Vitest to run unit tests verifying the GST rounding, subtotaling, and confidence checks:
```bash
npx vitest run
```

### Build for Production
To generate a production-ready compiled Next.js build:
```bash
npm run build
```
