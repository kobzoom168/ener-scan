-- Persona A/B auto-optimization: sticky assignments, rolling weights, funnel stats.
-- Apply via Supabase SQL editor or migration runner.

CREATE TABLE IF NOT EXISTS persona_ab_weights (
  id smallint PRIMARY KEY DEFAULT 1,
  CONSTRAINT persona_ab_weights_singleton CHECK (id = 1),
  weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS persona_ab_assignments (
  line_user_id text PRIMARY KEY,
  persona_variant text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_persona_ab_assignments_variant
  ON persona_ab_assignments (persona_variant);

CREATE TABLE IF NOT EXISTS persona_ab_stats (
  variant text PRIMARY KEY,
  paywall_shown bigint NOT NULL DEFAULT 0,
  payment_intent bigint NOT NULL DEFAULT 0,
  payment_success bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE persona_ab_weights IS 'Single row (id=1): current traffic weights per variant letter.';
COMMENT ON TABLE persona_ab_assignments IS 'Sticky LINE user -> persona variant (never rotated by optimizer).';
COMMENT ON TABLE persona_ab_stats IS 'Aggregated funnel counts per variant for recomputeWeights.';

INSERT INTO persona_ab_weights (id, weights)
VALUES (1, '{"A":0.34,"B":0.33,"C":0.33}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO persona_ab_stats (variant, paywall_shown, payment_intent, payment_success)
VALUES
  ('A', 0, 0, 0),
  ('B', 0, 0, 0),
  ('C', 0, 0, 0)
ON CONFLICT (variant) DO NOTHING;
