-- Day-10 research quality + strategy memory. JSONB payload tables.
-- Supabase is the durable SoT. Redis remains the hot replica.

CREATE TABLE IF NOT EXISTS intelligence_runs (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_intel_runs_updated ON intelligence_runs (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_intel_runs_objective ON intelligence_runs ((payload->>'objectiveId'));

CREATE TABLE IF NOT EXISTS intelligence_adaptations (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_intel_adapt_updated ON intelligence_adaptations (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_intel_adapt_objective ON intelligence_adaptations ((payload->>'objectiveId'));

CREATE TABLE IF NOT EXISTS intelligence_query_obs (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_intel_qobs_pattern ON intelligence_query_obs ((payload->>'queryPattern'));

CREATE TABLE IF NOT EXISTS intelligence_source_obs (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_intel_sobs_source ON intelligence_source_obs ((payload->>'source'));

CREATE TABLE IF NOT EXISTS intelligence_playbooks (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intelligence_metrics (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
