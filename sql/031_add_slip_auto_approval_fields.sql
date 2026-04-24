-- Internal PromptPay slip OCR + auto-approval metadata (safe additive migration)

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS slip_ref text,
ADD COLUMN IF NOT EXISTS slip_amount numeric,
ADD COLUMN IF NOT EXISTS slip_transferred_at timestamptz,
ADD COLUMN IF NOT EXISTS slip_receiver_name text,
ADD COLUMN IF NOT EXISTS slip_receiver_account_last4 text,
ADD COLUMN IF NOT EXISTS slip_receiver_promptpay text,
ADD COLUMN IF NOT EXISTS slip_sender_name text,
ADD COLUMN IF NOT EXISTS slip_bank_name text,
ADD COLUMN IF NOT EXISTS slip_ocr_confidence numeric,
ADD COLUMN IF NOT EXISTS slip_ocr_raw_text text,
ADD COLUMN IF NOT EXISTS slip_verify_status text,
ADD COLUMN IF NOT EXISTS slip_review_reason text,
ADD COLUMN IF NOT EXISTS auto_approved_at timestamptz,
ADD COLUMN IF NOT EXISTS manual_review_at timestamptz,
ADD COLUMN IF NOT EXISTS slip_verify_provider text DEFAULT 'internal_vision';

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_slip_ref_unique
ON payments(slip_ref)
WHERE slip_ref IS NOT NULL;
