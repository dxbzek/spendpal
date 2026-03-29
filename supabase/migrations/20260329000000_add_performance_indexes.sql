-- Performance indexes for SpendPal
-- These speed up the most common query patterns:
--   - Fetching all accounts/budgets/goals for a user
--   - Filtering transactions by account (balance recalculation)
--   - Filtering transactions by category (budget spent computation)

-- accounts: user_id lookups
CREATE INDEX IF NOT EXISTS idx_accounts_user_id
  ON public.accounts(user_id);

-- transactions: filter by account_id (balance updates, account-specific views)
CREATE INDEX IF NOT EXISTS idx_transactions_account_id
  ON public.transactions(account_id);

-- transactions: user + category (budget spent aggregation)
CREATE INDEX IF NOT EXISTS idx_transactions_user_category
  ON public.transactions(user_id, category);

-- budgets: user_id lookups
CREATE INDEX IF NOT EXISTS idx_budgets_user_id
  ON public.budgets(user_id);

-- goals: user_id lookups
CREATE INDEX IF NOT EXISTS idx_goals_user_id
  ON public.goals(user_id);
