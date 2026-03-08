

## Plan: Support PDF, Excel, and CSV Import

### Current State
The import sheet only accepts `.csv/.txt` files and reads them as text. The AI edge function already handles free-form text (not just CSV format), so we only need to extract text client-side from PDF/Excel before sending to the same AI endpoint.

### Approach
Extract text from all file types on the client side, then feed it through the existing `categorizeCSV` AI flow (which already handles unstructured bank statement text).

### Changes

**1. Add dependencies**
- `pdfjs-dist` - extract text from PDF files in browser
- `xlsx` - parse Excel files (.xlsx, .xls) to CSV text

**2. Update `ImportStatementSheet.tsx`**
- Change file accept to `.csv,.txt,.pdf,.xlsx,.xls`
- Update upload label text to "Upload CSV, PDF, or Excel statement"
- Add file type detection in `handleFile`:
  - `.csv/.txt` → read as text (current behavior)
  - `.pdf` → use `pdfjs-dist` to extract all page text, concatenate
  - `.xlsx/.xls` → use `xlsx` to read workbook, convert first sheet to CSV text
- Store extracted text in the existing `csvText` state (rename to `statementText` for clarity)
- Show a loading indicator while parsing PDF/Excel files

**3. Update edge function prompt** (`supabase/functions/ai-finance/index.ts`)
- Minor tweak to the `categorize-csv` system prompt: change "Given CSV transaction data" to "Given bank statement data (may be CSV, PDF text, or tabular text)" so the AI handles all formats correctly
- Increase payload limit from 100KB to 500KB to accommodate larger PDF text extractions

**4. Update `useAI.ts`**
- Rename `categorizeCSV` to `categorizeStatement` (keep backward compat alias)

### File Summary

| File | Change |
|------|--------|
| `package.json` | Add `pdfjs-dist`, `xlsx` |
| `src/components/transactions/ImportStatementSheet.tsx` | Accept PDF/Excel, extract text client-side |
| `supabase/functions/ai-finance/index.ts` | Update prompt wording, increase payload limit |
| `src/hooks/useAI.ts` | Rename function for clarity |

