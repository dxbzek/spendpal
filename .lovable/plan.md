

## Plan: Separate Accounts by Type with Optional Statement/Due Date

### What Changes

**1. Dashboard Accounts Section** (`src/pages/Dashboard.tsx`, lines 134-165)
- Replace the flat account list with three grouped sections: **Cash**, **Debit Cards**, **Credit Cards**
- Each group gets a subtle header label and only renders if accounts of that type exist
- Credit card accounts show statement date and due date inline (if set), along with balance and credit limit info

**2. AddAccountDialog** (`src/components/forms/AddAccountDialog.tsx`)
- Add an optional **Statement Date** field (day of month, 1-31) for credit card accounts, alongside the existing Due Date field
- Both fields only appear when type is "credit" and are optional

**3. FinanceContext** (`src/context/FinanceContext.tsx`)
- Update `addAccount` and `updateAccount` to persist `statement_date` (already exists in the DB schema but not being saved)

**4. Account Type** (`src/types/finance.ts`)
- `statementDate` already exists on the `Account` interface — no changes needed

### Dashboard Layout

```text
┌─────────────────────────────┐
│ 💵 Cash                     │
│  ─────────────────────────  │
│  Cash Wallet      AED 500   │
│                             │
│ 💳 Debit Cards              │
│  ─────────────────────────  │
│  Emirates NBD   AED 12,000  │
│                             │
│ 🏦 Credit Cards             │
│  ─────────────────────────  │
│  ADCB Visa      AED -3,200  │
│  Stmt: 15th · Due: 25th    │
│  Limit: AED 20,000         │
└─────────────────────────────┘
```

### File Changes Summary

| File | Change |
|------|--------|
| `src/pages/Dashboard.tsx` | Group accounts by type into 3 sections with headers; show statement/due date and credit limit for credit cards |
| `src/components/forms/AddAccountDialog.tsx` | Add optional statement date input for credit type |
| `src/context/FinanceContext.tsx` | Include `statement_date` in `addAccount` and `updateAccount` calls |

No database changes needed — `statement_date` column already exists on the `accounts` table.

