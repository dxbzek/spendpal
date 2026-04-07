-- Add notification preference columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_number TEXT,
  ADD COLUMN IF NOT EXISTS notify_email BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_sms BOOLEAN NOT NULL DEFAULT false;
