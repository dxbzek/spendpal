ALTER TABLE public.custom_categories
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'both'
  CHECK (type IN ('expense', 'income', 'both'));
