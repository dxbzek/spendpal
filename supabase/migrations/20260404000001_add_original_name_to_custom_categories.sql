-- Allow custom category records to track which default category they rename/override
ALTER TABLE public.custom_categories
  ADD COLUMN IF NOT EXISTS original_name TEXT NULL;
