-- Session-scoped persona assignment + daily funnel rollup for rolling-window recompute.

-- 1) Composite key: one assignment per LINE user per payment session (or __idle__).
ALTER TABLE persona_ab_assignments
  ADD COLUMN IF NOT EXISTS payment_session_key text NOT NULL DEFAULT '__idle__';

-- Upgrade single-column PK → composite (run once; safe to re-run if already composite).
DO $$
DECLARE
  col_count int;
BEGIN
  SELECT count(*) INTO col_count
  FROM information_schema.key_column_usage k
  JOIN information_schema.table_constraints t
    ON t.constraint_name = k.constraint_name AND t.table_schema = k.table_schema
  WHERE t.table_schema = 'public'
    AND t.table_name = 'persona_ab_assignments'
    AND t.constraint_type = 'PRIMARY KEY';

  IF col_count = 1 THEN
    ALTER TABLE persona_ab_assignments DROP CONSTRAINT persona_ab_assignments_pkey;
    ALTER TABLE persona_ab_assignments
      ADD PRIMARY KEY (line_user_id, payment_session_key);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_persona_ab_assignments_session
  ON persona_ab_assignments (payment_session_key);

COMMENT ON COLUMN persona_ab_assignments.payment_session_key IS
  'payments.id while awaiting_payment/pending_verify; __idle__ when no active payment row.';

-- 2) Daily aggregates (server local calendar date in app code via getLocalDateKey).
CREATE TABLE IF NOT EXISTS persona_ab_funnel_daily (
  variant text NOT NULL,
  bucket_date date NOT NULL,
  paywall_shown bigint NOT NULL DEFAULT 0,
  payment_intent bigint NOT NULL DEFAULT 0,
  payment_success bigint NOT NULL DEFAULT 0,
  paywall_shown_deduped bigint NOT NULL DEFAULT 0,
  payment_intent_deduped bigint NOT NULL DEFAULT 0,
  slip_uploaded_raw bigint NOT NULL DEFAULT 0,
  slip_uploaded_deduped bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (variant, bucket_date)
);

CREATE INDEX IF NOT EXISTS idx_persona_ab_funnel_daily_date
  ON persona_ab_funnel_daily (bucket_date);

COMMENT ON TABLE persona_ab_funnel_daily IS
  'Per-variant funnel counts per calendar day for rolling-window + recency-weighted recompute.';
