

## Code Review: Bugs and Improvements

### Bugs Found

1. **Console warning: `AlertDialog` given refs in Dashboard**
   - The `AlertDialog` component at line 419 in `Dashboard.tsx` is triggering a "Function components cannot be given refs" warning. This is a known Radix UI issue with React 18 strict mode -- not a functional bug, but noisy.

2. **Bulk delete triggers N individual fetches**
   - In `Transactions.tsx` line 298 and `Budgets.tsx` line 178, deleting all items loops through each one calling `removeTransaction`/`removeBudget`, each of which calls `fetchAll()` (4 DB queries). For 50 transactions, that's 200 queries. Should batch deletes and call `fetchAll()` once.

3. **Credit card "balance" semantics are inconsistent**
   - The `balance` field for credit cards stores the **available limit** (e.g., balance=13865 means 13,865 available of 18,000 limit). Dashboard line 234 shows "Available Limit" label correctly.
   - But `NetWorthWidget` and `CreditUtilizationWidget` compute `spent = creditLimit - balance`, which is correct given this meaning.
   - The `addTransaction` logic in `FinanceContext.tsx` line 197-199: for credit cards, expenses **increase** balance and income **decreases** it -- this is **backwards** if balance = available limit. An expense should **decrease** available limit. This is a real bug causing balance drift over time.

4. **`now` memoized with empty deps never updates**
   - In `Dashboard.tsx` line 60 and `AIAdvisor.tsx` line 88, `useMemo(() => new Date(), [])` means `now` never updates if the app stays open across midnight or month boundaries. For a finance app, this could show stale month filters. Minor but worth fixing with a stable month key approach.

5. **Delete account doesn't cascade transactions in app logic**
   - `removeAccount` (line 169) deletes the account but doesn't delete linked transactions. The DB may not have a cascade either (no FK from transactions to accounts). The dialog says "This will also delete all transactions linked to this account" but doesn't actually do it.

### Improvements

1. **Batch bulk deletes** -- Add a `removeAllTransactions(ids)` and `removeAllBudgets(ids)` method to `FinanceContext` that does a single `.in('id', ids)` delete + one `fetchAll()`.

2. **Fix credit card balance logic** -- In `addTransaction`, for credit cards: expense should **decrease** balance (less available), income should **increase** balance (payment restores available limit). The current logic is inverted.

3. **Account deletion cascade** -- Either add DB foreign key cascade from `transactions.account_id → accounts.id ON DELETE CASCADE`, or delete transactions in app code before deleting the account.

4. **Suppress ref warnings** -- These are Radix UI + React 18 warnings and not actionable in code. No change needed.

5. **Month-stable `now`** -- Replace `useMemo(() => new Date(), [])` with a derived month/year number that naturally stays stable within a session but is semantically correct.

### Plan

**`src/context/FinanceContext.tsx`**:
- Fix credit card balance logic in `addTransaction` and `removeTransaction` (swap the +/- for credit cards)
- Add `bulkRemoveTransactions(ids: string[])` that does `.in('id', ids).delete()` + one `fetchAll()`
- Add `bulkRemoveBudgets(ids: string[])` similarly
- In `removeAccount`, delete linked transactions first

**`src/pages/Transactions.tsx`**:
- Use `bulkRemoveTransactions` for "Delete All" instead of looping

**`src/pages/Budgets.tsx`**:
- Use `bulkRemoveBudgets` for "Delete All" instead of looping

**DB Migration**:
- Add `ON DELETE CASCADE` to `transactions.account_id` referencing `accounts.id` so account deletion properly cleans up transactions

