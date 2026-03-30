-- LINE chat turns for Gemini context (non-scan text path). Service role writes only.

CREATE TABLE IF NOT EXISTS line_conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'bot')),
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_line_conversation_messages_user_created
  ON line_conversation_messages (line_user_id, created_at DESC);

COMMENT ON TABLE line_conversation_messages IS
  'Recent user/bot text bubbles for conversation context (e.g. Gemini planner/phrasing).';
