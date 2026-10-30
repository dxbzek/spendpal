-- Migration: convert_currency(from, to, rate)
--
-- Changing "Preferred currency" only changes the symbol: every stored amount
-- stays in the old currency. This rewrites the caller's money into the new
-- one in a single transaction.
--
-- Accounts and transactions carry their own currency, so only rows in
-- p_from move. Budgets, goals and contributions have no currency column and
-- are in the profile's currency, so they all move.
--
-- The balance trigger adjusts balances as each transaction amount changes,
-- so balances are snapshotted first and set to snapshot * rate at the end.
--
-- SECURITY INVOKER: RLS still scopes every statement to the caller.
CREATE OR REPLACE FUNCTION public.convert_currency(p_from TEXT, p_to TEXT, p_rate NUMERIC)
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF p_rate IS NULL OR p_rate <= 0 THEN RAISE EXCEPTION 'rate must be positive'; END IF;
  IF p_from = p_to THEN RAISE EXCEPTION 'currencies are the same'; END IF;

  CREATE TEMP TABLE _cc_balances ON COMMIT DROP AS
    SELECT id, balance FROM accounts WHERE user_id = uid AND currency = p_from;

  UPDATE transactions SET
    amount = round(amount * p_rate, 2),
    loan_total_amount = round(loan_total_amount * p_rate, 2),
    remaining_principal = round(remaining_principal * p_rate, 2),
    currency = p_to
  WHERE user_id = uid AND currency = p_from;

  UPDATE accounts a SET
    balance = round(b.balance * p_rate, 2),
    credit_limit = round(a.credit_limit * p_rate, 2),
    statement_total_due = round(a.statement_total_due * p_rate, 2),
    statement_min_due = round(a.statement_min_due * p_rate, 2),
    currency = p_to
  FROM _cc_balances b
  WHERE a.id = b.id;

  UPDATE budgets SET amount = round(amount * p_rate, 2) WHERE user_id = uid;
  UPDATE goals SET
    target_amount = round(target_amount * p_rate, 2),
    saved_amount = round(saved_amount * p_rate, 2)
  WHERE user_id = uid;
  UPDATE goal_contributions SET amount = round(amount * p_rate, 2) WHERE user_id = uid;

  UPDATE profiles SET currency = p_to WHERE user_id = uid;
END;
$$;

REVOKE ALL ON FUNCTION public.convert_currency(TEXT, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_currency(TEXT, TEXT, NUMERIC) TO authenticated;
