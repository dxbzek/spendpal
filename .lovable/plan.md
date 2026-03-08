

## End-to-End Review Findings

After reviewing the full codebase, here is a summary of issues found and their fixes:

### Issues Found

**1. Pie chart ResponsiveContainer warning (minor)**
The `SpendingPieChart` uses `<ResponsiveContainer width={140} height={140}>` with fixed dimensions, which triggers a console warning. Should use a plain `<div>` wrapper instead since dimensions are fixed.

**2. Missing `aria-describedby` on dialogs (minor)**
The "Add Progress" dialog in `Goals.tsx` (line 120) uses `DialogContent` without a `DialogDescription`, causing an accessibility warning. Same issue may exist in other dialogs.

**3. Transaction delete doesn't reverse balance**
When deleting a transaction via `removeTransaction`, the account balance is NOT adjusted back. If a user added a manual transaction (which adjusted balance), deleting it leaves the balance wrong. This is a real bug.

**4. Transactions query limited to 1000 rows**
The default Supabase limit is 1000 rows. If a user imports large statements over time, they'll silently lose older transactions from the query. Should add `.limit()` or pagination.

**5. "Transfer" transactions show as expense color**
In `Transactions.tsx` line 106, transfers fall into the `else` branch and display as `text-expense` (red). Transfers should have a neutral color.

**6. Missing categories in color map**
Categories like `Coffee`, `Telecom`, `Metro/Taxi`, `Charity`, `Delivery`, `DEWA`, `Salary`, `Freelance` are defined in `CATEGORIES` but missing from `categoryColors.ts`, so they get random fallback colors that change based on index position (inconsistent).

### Plan

| File | Change |
|------|--------|
| `src/context/FinanceContext.tsx` | Reverse balance on transaction delete |
| `src/pages/Transactions.tsx` | Show transfers in neutral color instead of expense red |
| `src/utils/categoryColors.ts` | Add all missing category colors from CATEGORIES list |
| `src/components/charts/SpendingPieChart.tsx` | Remove ResponsiveContainer, use plain div with fixed size |
| `src/pages/Goals.tsx` | Add `DialogDescription` to the progress dialog for accessibility |

### Priority
Fix #3 (balance not reversed on delete) is the most impactful bug. The rest are visual polish and warnings.

