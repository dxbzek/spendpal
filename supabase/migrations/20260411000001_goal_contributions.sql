-- Migration: Add goal_contributions table to persist goal contribution logs in the DB.
-- Previously stored in localStorage only — this prevents silent data loss on browser
-- storage clear or device switch (audit issue C3).

CREATE TABLE public.goal_contributions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.goal_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own goal contributions"
  ON public.goal_contributions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own goal contributions"
  ON public.goal_contributions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own goal contributions"
  ON public.goal_contributions FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_goal_contributions_goal
  ON public.goal_contributions(goal_id, created_at DESC);

CREATE INDEX idx_goal_contributions_user
  ON public.goal_contributions(user_id, created_at DESC);
