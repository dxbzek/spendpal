

## Transfer Type: Account-to-Account with No Category

### Problem
When "Transfer" is selected as the transaction type, the form still shows the category picker and merchant field, which don't apply. Transfers should only require a "From" account and a "To" account.

### Changes

**`src/components/transactions/AddTransactionSheet.tsx`**:

1. **Add a `toAccountId` state** for the destination account.
2. **Hide category picker** when `type === 'transfer'` — auto-set category to "Transfer" / icon "🔁".
3. **Hide merchant field** when `type === 'transfer'`.
4. **Hide recurring/installment section** when `type === 'transfer'`.
5. **Rename the existing "Account" select to "From Account"** when transfer is selected, and **add a "To Account" select** (filtered to exclude the selected "From" account).
6. **Update `handleSubmit`**: when type is transfer, auto-assign `category: 'Transfer'`, `categoryIcon: '🔁'`, `merchant: 'Transfer'`, and use the from-account as `accountId`.
7. **Validation**: require both `accountId` and `toAccountId` for transfers; require `category` and `accountId` for other types.

