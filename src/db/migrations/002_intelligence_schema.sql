-- Day-9 intelligence + durable operational memory.
-- JSONB payload tables. Fail-open if this migration has not run.
-- Redis remains the hot replica so Render disk reset does not wipe evidence.

CREATE TABLE IF NOT EXISTS operational_memories (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_operational_memories_updated ON operational_memories (updated_at DESC);

CREATE TABLE IF NOT EXISTS intelligence_entities (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_intel_entities_updated ON intelligence_entities (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_intel_entities_domain ON intelligence_entities ((payload->>'domain'));

CREATE TABLE IF NOT EXISTS intelligence_aliases (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_intel_aliases_norm ON intelligence_aliases ((payload->>'normalized'));
CREATE INDEX IF NOT EXISTS idx_intel_aliases_entity ON intelligence_aliases ((payload->>'entityId'));

CREATE TABLE IF NOT EXISTS intelligence_sources (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intelligence_claims (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_intel_claims_subject ON intelligence_claims ((payload->>'subjectEntityId'));
CREATE INDEX IF NOT EXISTS idx_intel_claims_status ON intelligence_claims ((payload->>'status'));

CREATE TABLE IF NOT EXISTS intelligence_evidence (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_intel_evidence_entity ON intelligence_evidence ((payload->>'entityId'));

CREATE TABLE IF NOT EXISTS intelligence_relations (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_intel_relations_from ON intelligence_relations ((payload->>'fromId'));
