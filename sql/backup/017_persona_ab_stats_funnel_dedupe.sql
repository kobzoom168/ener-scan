-- Funnel analytics: raw vs deduped counters (paywall_shown, payment_intent, slip_uploaded).
-- payment_success remains a single raw counter.

ALTER TABLE persona_ab_stats
  ADD COLUMN IF NOT EXISTS paywall_shown_deduped bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_intent_deduped bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS slip_uploaded_raw bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS slip_uploaded_deduped bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN persona_ab_stats.paywall_shown IS 'Raw paywall_shown events (one per log line).';
COMMENT ON COLUMN persona_ab_stats.paywall_shown_deduped IS 'Deduped paywall_shown (first per funnel key in window / payment scope).';
COMMENT ON COLUMN persona_ab_stats.payment_intent IS 'Raw payment_intent events.';
COMMENT ON COLUMN persona_ab_stats.payment_intent_deduped IS 'Deduped payment_intent.';
COMMENT ON COLUMN persona_ab_stats.slip_uploaded_raw IS 'Raw slip_uploaded events.';
COMMENT ON COLUMN persona_ab_stats.slip_uploaded_deduped IS 'Deduped slip_uploaded.';
COMMENT ON COLUMN persona_ab_stats.payment_success IS 'Raw payment_success only (no dedupe variant).';
