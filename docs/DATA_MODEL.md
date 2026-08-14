# HustleBot v2 - Data Model

**Version**: 0.1 (Phase 0, 2026-08-14)

Database schema, relationships, and audit structures.

---

## I. Current Schema (Phase 0)

Defined in `scripts/migrate.js`. Deployed to Supabase PostgreSQL.

### Table: `users`

**Purpose**: User identity, settings, budget

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  monthly_budget DECIMAL DEFAULT 100,
  total_spend DECIMAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `email` | TEXT | Unique identifier |
| `name` | TEXT | Display name |
| `monthly_budget` | DECIMAL | Hard cap (USD) |
| `total_spend` | DECIMAL | Running total this month |
| `created_at` | TIMESTAMPTZ | Account creation |
| `updated_at` | TIMESTAMPTZ | Last modified |

**Indexes**:
```sql
CREATE INDEX idx_users_email ON users(email);
```

---

### Table: `projects`

**Purpose**: User's projects (landing pages, lead gen campaigns, etc.)

```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',  -- active | archived | deleted
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK to users |
| `name` | TEXT | Project name |
| `description` | TEXT | Optional description |
| `status` | TEXT | Lifecycle state |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Indexes**:
```sql
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_status ON projects(status);
```

---

### Table: `leads`

**Purpose**: Generated leads from lead gen factory

```sql
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  company TEXT,
  title TEXT,
  country TEXT,
  industry TEXT,
  company_size TEXT,
  revenue TEXT,
  website TEXT,
  icp_score DECIMAL,  -- 0-100
  source TEXT,  -- 'linkedin', 'hunter', 'clearbit', etc.
  status TEXT DEFAULT 'new',  -- new | emailed | replied | converted | rejected
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `project_id` | UUID | FK to projects |
| `email` | TEXT | Lead email |
| `first_name`, `last_name` | TEXT | Name |
| `company` | TEXT | Company name |
| `title` | TEXT | Job title |
| `country`, `industry` | TEXT | Location, vertical |
| `company_size`, `revenue` | TEXT | Company metrics |
| `website` | TEXT | Company website |
| `icp_score` | DECIMAL | Fit score (0-100) |
| `source` | TEXT | Data source |
| `status` | TEXT | Pipeline state |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

**Indexes**:
```sql
CREATE INDEX idx_leads_project_id ON leads(project_id);
CREATE INDEX idx_leads_email ON leads(email);
CREATE INDEX idx_leads_icp_score ON leads(icp_score DESC);
CREATE INDEX idx_leads_status ON leads(status);
```

---

### Table: `transactions`

**Purpose**: Cost tracking per operation

```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  project_id UUID REFERENCES projects(id),
  agent_name TEXT,  -- 'copywriter', 'landing_page_factory', etc.
  operation TEXT,  -- e.g., 'generate_headlines'
  cost DECIMAL NOT NULL,  -- USD
  tokens_in INT,
  tokens_out INT,
  model TEXT,  -- 'claude-3.5-sonnet', 'grok-2', etc.
  status TEXT DEFAULT 'completed',  -- pending | completed | failed
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK to users |
| `project_id` | UUID | FK to projects (nullable) |
| `agent_name` | TEXT | Which agent ran |
| `operation` | TEXT | Specific tool/operation |
| `cost` | DECIMAL | $ amount |
| `tokens_in`, `tokens_out` | INT | Token usage |
| `model` | TEXT | LLM model used |
| `status` | TEXT | Outcome |
| `created_at` | TIMESTAMPTZ | When it happened |

**Indexes**:
```sql
CREATE INDEX idx_transactions_user_id ON transactions(user_id, created_at DESC);
CREATE INDEX idx_transactions_project_id ON transactions(project_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);
```

---

### Table: `agent_logs`

**Purpose**: Detailed execution logs per agent

```sql
CREATE TABLE agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  project_id UUID REFERENCES projects(id),
  agent_name TEXT NOT NULL,
  agent_id UUID,  -- Phase 1: Agent identity
  input JSONB,
  output JSONB,
  error TEXT,
  execution_time_ms INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK to users |
| `project_id` | UUID | FK to projects |
| `agent_name` | TEXT | Agent class name |
| `agent_id` | UUID | Phase 1: Unique agent instance ID |
| `input` | JSONB | Input JSON |
| `output` | JSONB | Output JSON |
| `error` | TEXT | Error message if failed |
| `execution_time_ms` | INT | Wall-clock time |
| `created_at` | TIMESTAMPTZ | When it ran |

**Indexes**:
```sql
CREATE INDEX idx_agent_logs_agent_name ON agent_logs(agent_name);
CREATE INDEX idx_agent_logs_user_id ON agent_logs(user_id, created_at DESC);
CREATE INDEX idx_agent_logs_created_at ON agent_logs(created_at DESC);
```

---

## II. Phase 1: New Tables

These tables are **planned** for Phase 1. Not yet created.

### Table: `audit_logs` (Immutable)

**Purpose**: Append-only compliance trail

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_type TEXT,  -- 'user', 'agent', 'system'
  actor_id UUID,
  action TEXT,  -- 'agent_executed', 'policy_check', 'approval_required'
  resource_type TEXT,  -- 'agent', 'job', 'project'
  resource_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Immutable: no updates/deletes allowed
CREATE TRIGGER audit_logs_immutable
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION raise_immutable_error();

-- Function
CREATE FUNCTION raise_immutable_error() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs table is immutable';
END;
$$ LANGUAGE plpgsql;
```

**Indexes**:
```sql
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
```

---

### Table: `job_state` (Phase 1: Queue State)

**Purpose**: Durable job queue state (Bull.js backing)

```sql
CREATE TABLE job_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name TEXT NOT NULL,  -- 'agent_tasks', etc.
  job_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,  -- queued | started | completed | failed | retrying
  payload JSONB,
  result JSONB,
  error TEXT,
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key |
| `queue_name` | TEXT | Queue identifier |
| `job_id` | TEXT | Unique job reference |
| `status` | TEXT | Current state |
| `payload` | JSONB | Input to job |
| `result` | JSONB | Output from job |
| `error` | TEXT | Error message if failed |
| `attempts` | INT | Retry count |
| `max_attempts` | INT | Max retries allowed |
| `created_at`, `updated_at` | TIMESTAMPTZ | Timestamps |
| `completed_at` | TIMESTAMPTZ | When finished |

**Indexes**:
```sql
CREATE INDEX idx_job_state_status ON job_state(status);
CREATE INDEX idx_job_state_job_id ON job_state(job_id);
CREATE INDEX idx_job_state_updated_at ON job_state(updated_at DESC);
```

---

### Table: `capabilities` (Phase 1: Registry)

**Purpose**: Agent capability registry

```sql
CREATE TABLE capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT NOT NULL,
  agent_version TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  description TEXT,
  input_schema JSONB,
  output_schema JSONB,
  cost_per_call DECIMAL,
  rate_limit TEXT,
  status TEXT DEFAULT 'active',  -- active | deprecated | beta
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Composite unique constraint
ALTER TABLE capabilities
ADD CONSTRAINT uq_capabilities_agent_tool
UNIQUE (agent_name, agent_version, tool_name);
```

---

### Table: `mailbox` (Phase 1: Agent Coordination)

**Purpose**: Inter-agent message queue

```sql
CREATE TABLE mailbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_agent_id UUID,
  to_agent_id UUID NOT NULL,
  message_type TEXT,  -- 'request', 'response', 'state_update', 'error'
  payload JSONB,
  status TEXT DEFAULT 'unread',  -- unread | read | processed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);
```

**Indexes**:
```sql
CREATE INDEX idx_mailbox_to_agent_id ON mailbox(to_agent_id, status);
CREATE INDEX idx_mailbox_created_at ON mailbox(created_at DESC);
```

---

### Table: `policies` (Phase 1: Budget & Gates)

**Purpose**: User-level policies and limits

```sql
CREATE TABLE policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id),
  monthly_budget DECIMAL DEFAULT 100,
  per_operation_limit DECIMAL DEFAULT 10,
  approval_required_above DECIMAL DEFAULT 10,
  rate_limit_per_minute INT DEFAULT 60,
  enabled_features JSONB DEFAULT '{}',  -- { "voice": true, "images": false }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## III. Relationships

```
users (1) ──→ (many) projects
users (1) ──→ (many) transactions
users (1) ──→ (many) agent_logs
users (1) ──→ (many) policies
users (1) ──→ (1) audit_logs (via actor_id)

projects (1) ──→ (many) leads
projects (1) ──→ (many) transactions
projects (1) ──→ (many) agent_logs

agents (many) ──→ (1) job_state (via job_id)
agents (many) ──→ (1) audit_logs (via actor_id)
agents (many) ──→ (many) mailbox (from/to)
```

---

## IV. Rollup Queries (Analytics)

### Monthly Cost per User

```sql
SELECT
  u.id,
  u.email,
  SUM(t.cost) as monthly_cost
FROM users u
LEFT JOIN transactions t ON u.id = t.user_id
WHERE EXTRACT(MONTH FROM t.created_at) = EXTRACT(MONTH FROM NOW())
  AND EXTRACT(YEAR FROM t.created_at) = EXTRACT(YEAR FROM NOW())
GROUP BY u.id, u.email
ORDER BY monthly_cost DESC;
```

### Cost per Agent

```sql
SELECT
  agent_name,
  COUNT(*) as executions,
  SUM(cost) as total_cost,
  AVG(cost) as avg_cost
FROM transactions
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY agent_name
ORDER BY total_cost DESC;
```

### Leads by Status & Score

```sql
SELECT
  status,
  COUNT(*) as count,
  AVG(icp_score) as avg_score
FROM leads
GROUP BY status
ORDER BY count DESC;
```

### Agent Execution Time (P50, P95, P99)

```sql
SELECT
  agent_name,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY execution_time_ms) as p50,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY execution_time_ms) as p95,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY execution_time_ms) as p99
FROM agent_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY agent_name;
```

---

## V. Data Retention & Compliance

### GDPR: Right to be Forgotten

```sql
-- When user requests deletion:
BEGIN TRANSACTION;

-- Archive data (for legal hold)
INSERT INTO archived_users SELECT * FROM users WHERE id = $1;
INSERT INTO archived_transactions SELECT * FROM transactions WHERE user_id = $1;
INSERT INTO archived_projects SELECT * FROM projects WHERE user_id = $1;

-- Delete from main tables
DELETE FROM transactions WHERE user_id = $1;
DELETE FROM agent_logs WHERE user_id = $1;
DELETE FROM projects WHERE user_id = $1;
DELETE FROM leads WHERE project_id IN (SELECT id FROM projects WHERE user_id = $1);
DELETE FROM users WHERE id = $1;

-- Audit log (immutable)
INSERT INTO audit_logs (action, resource_type, resource_id, details)
VALUES ('user_deleted', 'user', $1, jsonb_build_object('reason', 'gdpr_request'));

COMMIT;
```

### Data Retention

- **Transactions**: Keep 7 years (tax/accounting)
- **Leads**: Keep 30 days or until status = 'converted'
- **Agent Logs**: Keep 90 days (debugging/audit)
- **Audit Logs**: Keep indefinitely (compliance)

---

## VI. Backup & Recovery

### Automated Backups (Supabase)

- Daily backups kept for 30 days
- Point-in-time recovery available
- Manual backup on major schema changes

### Manual Backup

```bash
# Export all data
pg_dump \
  postgresql://user:pass@host/db \
  > hustlebot_backup_$(date +%Y%m%d).sql

# Restore
psql postgresql://user:pass@host/db < hustlebot_backup_20260814.sql
```

---

## VII. Indexing Strategy

### Hot Indexes (Query Performance)

```sql
-- Most-queried columns
CREATE INDEX idx_transactions_user_created ON transactions(user_id, created_at DESC);
CREATE INDEX idx_leads_project_score ON leads(project_id, icp_score DESC);
CREATE INDEX idx_agent_logs_agent_time ON agent_logs(agent_name, created_at DESC);
```

### Sparse Indexes (Filter)

```sql
-- Only active projects
CREATE INDEX idx_projects_active ON projects(user_id) WHERE status = 'active';

-- Only failed jobs
CREATE INDEX idx_job_failed ON job_state(updated_at DESC) WHERE status = 'failed';
```

---

## VIII. Performance Tuning

### Connection Pooling

Supabase provides connection pooling (50 connections default). For high concurrency (Phase 2), upgrade to:
- **Pooling Mode**: Transaction pooling (reuse connections per statement)
- **Max Connections**: Increase to 200+

### Slow Query Log

Enable in Supabase settings:
```sql
SET log_min_duration_statement = 1000;  -- Log queries > 1s
```

Monitor with:
```sql
SELECT * FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 20;
```

---

**Next**: Return to MASTER_SPEC.md for architectural decisions, or ARCHITECTURE.md for component details.
