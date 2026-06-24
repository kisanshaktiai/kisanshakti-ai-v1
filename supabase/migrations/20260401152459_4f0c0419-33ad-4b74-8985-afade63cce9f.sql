-- Drop the partial unique index that breaks ON CONFLICT upsert
DROP INDEX IF EXISTS idx_proactive_alerts_dedup;

-- Create a proper unique constraint that PostgreSQL ON CONFLICT can use
ALTER TABLE proactive_alerts 
  ADD CONSTRAINT uq_proactive_alerts_dedup_key UNIQUE (dedup_key);