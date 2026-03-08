

## Problem

When a credit card statement is imported, credits/payments to the card are categorized as `type: 'income'`. These are **not real income** — they're just card payments or refunds. However, the dashboard, MoneySavedWidget, and MonthlyTrendChart all count them as income because they simply filter by `t.type === 'income'`.

## Fix

Exclude transactions linked to credit card accounts from income calculations across all affected components. A transaction is on a credit card if its `accountId` matches an account with `type === 'credit'`.

### Files to change

1. **`src/pages/Dashboard.tsx`** (line 68)
   - Filter income calculation: exclude transactions where the account is a credit card.
   - `const creditAccountIds = new Set(accounts.filter(a => a.type === 'credit').map(a => a.id));`
   - Income = `filtered.filter(t => t.type === 'income' && !creditAccountIds.has(t.accountId))`

2. **`src/components/dashboard/MoneySavedWidget.tsx`** (lines 6, 14, 20)
   - Accept `accounts` as a prop (or `creditAccountIds` set).
   - Exclude credit card transactions from income calculation.

3. **`src/components/charts/MonthlyTrendChart.tsx`** (line 25)
   - Accept `accounts` (or creditAccountIds) as a prop.
   - Exclude credit card account transactions from the income line.

4. **`src/components/dashboard/MonthlyReportCard.tsx`** — pass correct income data so the AI report also reflects accurate numbers.

This is a lightweight, surgical fix — just filtering out credit-card-linked "income" transactions from all income aggregations.

