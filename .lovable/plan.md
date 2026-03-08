

## Problem

When you import bank statement transactions, the system adjusts your account balance for each imported transaction (as if they're new). But these are **historical** transactions -- the balance is already reflected in your real bank account. This causes the balance to drift from reality (showing 135 AED instead of your actual 146.65 AED).

## Fix

### 1. Don't adjust balance on imported transactions
In `ImportStatementSheet.tsx`, bypass the balance-adjustment logic in `addTransaction` by inserting transactions directly to the database (without the balance update step), or add a flag to skip balance adjustment.

The cleanest approach: add an optional `skipBalanceUpdate` parameter to `addTransaction` in `FinanceContext.tsx`. When importing, pass `skipBalanceUpdate: true`.

### 2. Add a "Set Balance" option after import
After importing transactions, prompt the user to confirm/update their account balance. Show a small dialog asking "What is your current account balance?" pre-filled with the existing value, so you can correct it to 146.65.

### 3. Allow editing account balance from Dashboard
The edit account dialog already supports changing balance. No change needed here -- it already works.

### Files

| File | Change |
|------|--------|
| `src/context/FinanceContext.tsx` | Add `skipBalanceUpdate` option to `addTransaction` |
| `src/components/transactions/ImportStatementSheet.tsx` | Pass `skipBalanceUpdate: true` during import; show balance confirmation dialog after import |

