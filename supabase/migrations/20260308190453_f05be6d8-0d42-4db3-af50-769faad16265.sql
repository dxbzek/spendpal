ALTER TABLE public.transactions
ADD COLUMN total_installments integer DEFAULT NULL,
ADD COLUMN current_installment integer DEFAULT NULL;