-- Persist job completion time for dedup-hit and other paths that set completed_at from the app.
ALTER TABLE scan_jobs
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;
