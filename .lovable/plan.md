
## Fix: Date format issue on imported transactions

The error `date/time field value out of range: "30/01/2026"` shows the AI is returning dates in `DD/MM/YYYY` format, but the database expects ISO format (`YYYY-MM-DD`).

Two fixes needed:

### 1. Update AI prompt to request ISO dates
In `supabase/functions/ai-finance/index.ts`, update the `categorize-csv` system prompt to explicitly request dates in `YYYY-MM-DD` format.

### 2. Add client-side date normalization as safety net
In `src/components/transactions/ImportStatementSheet.tsx`, after receiving parsed results, normalize any date that isn't already ISO format (detect `DD/MM/YYYY` or `MM/DD/YYYY` patterns and convert to `YYYY-MM-DD`) before saving to the database.

| File | Change |
|------|--------|
| `supabase/functions/ai-finance/index.ts` | Add "Dates MUST be in YYYY-MM-DD format" to prompt |
| `src/components/transactions/ImportStatementSheet.tsx` | Add date normalization on parsed results |
