# HustleBot v2 - Architecture

**Version**: 0.1 (Current State, 2026-08-14)

---

## Overview: Three-Layer Stack

```
┌─────────────────────────────────────────────────────────┐
│ PRESENTATION LAYER                                       │
│  • Telegram Bot (voice + text)                          │
│  • Future: Web UI, WhatsApp, email                      │
└──────────────┬──────────────────────────────────────────┘
               │
┌──────────────┴──────────────────────────────────────────┐
│ ORCHESTRATION LAYER (Phase 0–1)                         │
│  • Command Router (routes to agent)                     │
│  • Agent Orchestrator (discovery, registration)        │
│  • (Phase 1) Job Queue (Bull/Redis)                    │
│  • (Phase 1) Agent Mailbox (coordination)               │
│  • (Phase 1) Planning DAG (workflow execution)          │
│  • (Phase 1) Policy Engine (budget, approvals)          │
└──────────────┬──────────────────────────────────────────┘
               │
┌──────────────┴──────────────────────────────────────────┐
│ AGENT EXECUTION LAYER (Phase 0 ✅)                      │
│  • BaseAgent (foundation class)                         │
│  • 8 Developer Agents (code + ops)                      │
│  • 9 Strategy Agents (marketing, sales, etc.)           │
│  • Tool Factories (landing pages, lead gen)             │
└──────────────┬──────────────────────────────────────────┘
               │
┌──────────────┴──────────────────────────────────────────┐
│ PROVIDER ABSTRACTION LAYER (Phase 1)                    │
│  • LLM Backend (OpenRouter, Claude API, local)          │
│  • Media Backend (Replicate, Midjourney, DALL-E)       │
│  • Storage Backend (S3, GCS, R2)                        │
│  • Messaging Backend (Telegram, WhatsApp, email)        │
└──────────────┬──────────────────────────────────────────┘
               │
┌──────────────┴──────────────────────────────────────────┐
│ PERSISTENCE LAYER (Phase 0–1)                           │
│  • Supabase PostgreSQL (users, projects, costs)        │
│  • (Phase 1) Audit table (immutable logs)              │
│  • (Phase 1) Job state table (queue status)            │
│  • Redis (queue backing, cache)                         │
└─────────────────────────────────────────────────────────┘
```

---

## Layer 1: Presentation (Current)

### Telegram Bot Gateway

**File**: `src/server.js` lines 295–350

**Responsibilities**:
- Listen for Telegram webhooks at `POST /api/telegram/webhook`
- Route text messages → Command Router
- Route voice messages → Deepgram STT → LLM → Reply
- Send bot commands (`/start`, `/help`, `/status`) to Telegram UI

**Current Behavior**:
```
User sends message
    ↓
Telegram server → Webhook → Express server
    ↓
Telegraf bot.on('message', ...) handler
    ↓
If LLM ready: call OpenRouter → reply
Else: fallback "AI loading" message
```

**Status**: ✅ Tested and live

---

## Layer 2: Orchestration (Current + Phase 1)

### Current (Phase 0)

#### 2.1 Command Router
**File**: `src/core/command-router.js`

Parses user input, identifies intent, routes to agent. Example:
```javascript
input: "Generate 5 headlines for my SaaS"
  → intent: "copywriting"
  → agent: CopywriterAgent
  → execute()
```

**Status**: ✅ Basic version works; Phase 1 upgrades to registry-driven discovery

#### 2.2 Agent Orchestrator
**File**: `src/agents/orchestrator.js`

Registers all 17 agents, tracks execution stats. Current:
```javascript
// Pseudo-code
agents = [CopywriterAgent, ContentWriterAgent, FrontendDeveloper, ...]
execute(taskType, input) {
  agent = agents.find(a => a.canHandle(taskType))
  return agent.execute(input)
}
```

**Status**: ✅ In-memory registry; Phase 1 moves to durable registry with schema

---

### Phase 1 Additions (Not Yet Implemented)

#### 2.3 Job Queue (Bull)
**New file**: `src/queue/job-queue.js`

- Queue all agent tasks to Redis-backed Bull queue
- Persist job state (queued, running, completed, failed)
- Retry failed jobs with exponential backoff
- Track job lifetime for resume/audit

**API**:
```javascript
await queue.add('agent_task', {
  agentName: 'copywriter',
  input: 'Generate 5 headlines',
  userId: 'user123',
  projectId: 'proj456'
}, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 }
})
```

#### 2.4 Agent Mailbox
**New file**: `src/mailbox/agent-mailbox.js`

- Per-agent inbox (typed messages, time-ordered)
- Message: `{ from, to, type, payload, timestamp }`
- Types: `request`, `response`, `state_update`, `error`
- Supabase-backed persistence

**Example**:
```javascript
// Agent A schedules Agent B
await mailbox.sendMessage({
  from: 'copywriter_agent',
  to: 'frontend_developer_agent',
  type: 'request',
  payload: { copy: '...', target: 'react_component' }
})

// Agent B polls inbox
const msg = await mailbox.nextMessage('frontend_developer_agent')
await mailbox.reply(msg, { result: '<React>...</React>' })
```

#### 2.5 Planning DAG Executor
**New file**: `src/dagger/dag-executor.js`

- Define workflows as directed acyclic graphs
- Nodes = agent tasks
- Edges = data flow
- Executor traverses, handles failures, routes to agents

**Example DAG** (landing page build):
```javascript
dag = {
  nodes: [
    { id: 'copywriter', agent: 'copywriter', input: { topic: '...' } },
    { id: 'frontend', agent: 'frontend_developer', input_from: 'copywriter.output' },
    { id: 'deploy', agent: 'devops', input_from: 'frontend.output' }
  ],
  edges: [
    { from: 'copywriter', to: 'frontend' },
    { from: 'frontend', to: 'deploy' }
  ]
}

await executor.run(dag)  // Traverses: copywriter → frontend → deploy
```

#### 2.6 Policy Engine
**New file**: `src/policy/policy-engine.js`

- Hard spend cap ($100/month)
- Per-operation cost limits ($10 approval gate)
- Rate limits (5 reqs/min per user)
- Feature flags (enable/disable capabilities)

**Example**:
```javascript
await policy.check({
  userId: 'user123',
  operation: 'generate_landing_page',
  estimatedCost: 12.50
})
// Returns: { allowed: false, reason: 'exceeds_per_op_limit' }
// → Requires manual approval via webhook
```

---

## Layer 3: Agent Execution (Current ✅)

### 3.1 BaseAgent Class
**File**: `src/agents/base-agent.js` (218 lines)

All agents inherit from BaseAgent. Provides:

| Method | Purpose |
|--------|---------|
| `execute(input)` | Main entry point, wraps executeLogic + cost tracking |
| `executeLogic(input)` | Override in subclass |
| `callLLM(prompt, options)` | Route to LLM, track cost |
| `streamLLM(prompt, options)` | Stream response (real-time) |
| `registerTool(name, desc, schema, fn)` | Add tool capability |
| `getTools()` | Export tools as MCP schema |
| `retryWithBackoff(fn, maxRetries)` | Retry logic for transient errors |
| `getStats()` | Execution count, total cost, avg cost |

**Cost Tracking**:
```javascript
llmResponse = await this.llm.complete(prompt, options)
this.totalCost += llmResponse.cost  // Accumulate
return { output, cost: llmResponse.cost }
```

### 3.2 The 17 Specialized Agents

#### Developer Agents (8)
| Agent | File | LLM | Best For |
|-------|------|-----|----------|
| Copywriter | `copywriter.js` | Claude 3.5 | Headlines, sales copy, email |
| Content Writer | `content-writer.js` | Grok 2 | Blogs, social posts, scripts |
| Frontend Developer | `frontend-developer.js` | Claude 3.5 | React, UI, responsive design |
| Backend Developer | `backend-developer.js` | Claude 3.5 | APIs, auth, middleware |
| Database Agent | `database-agent.js` | Claude 3.5 | SQL, schema, migrations |
| DevOps Agent | `devops-agent.js` | Claude 3.5 | Docker, deployment, infra |
| Landing Page Agent | `src/tools/landing-page-factory.js` | Claude 3.5 | Full landing page pipeline |
| Product Agent | `specialized-agents.js` | Claude 3.5 | Features, roadmap, strategy |

#### Strategy Agents (9)
| Agent | Purpose |
|-------|---------|
| Marketing Agent | Growth strategies, campaigns, positioning |
| Sales Agent | Sales tactics, closing scripts, objection handling |
| Finance Agent | Unit economics, pricing, burn rate |
| Analytics Agent | Metrics, attribution, forecasting |
| Ideation Agent | Brainstorming, market research, competitor analysis |
| Video Agent | Scripts, production strategy, editing |
| Social Media Agent | Platform-specific content, posting strategies |
| Security/QA Agent | Testing, security audit, quality gates |
| E-commerce Agent | Store setup, product import, upsell sequences |

**Status**: ✅ All 17 defined and executable; Phase 1 adds registry/schema

### 3.3 Tool Factories (2 of 6 Complete)

#### Landing Page Factory
**File**: `src/tools/landing-page-factory.js`

End-to-end pipeline:
1. Copywriter Agent → Generate headlines, copy, CTAs
2. Frontend Developer Agent → Build React component
3. Stripe integration → Add payment button
4. Brevo integration → Email capture + welcome sequence
5. Vercel deployment → Deploy live

**Cost**: ~$2–5 per landing page (depends on complexity)

#### Lead Generation Factory
**File**: `src/tools/lead-gen-factory.js`

End-to-end pipeline:
1. Web scraping (Firecrawl/Playwright) → Target list
2. Email validation (Hunter/Clearbit) → Verify emails
3. Enrichment (Clearbit API) → Add company, title, social
4. ICP scoring → Rank by fit
5. Deduplication → Remove duplicates
6. Delivery → Webhook, email, CSV

**Cost**: ~$1–3 per 100 qualified leads

**Status**: ✅ Both factories working; Phase 2 adds Content, Image, E-commerce

---

## Layer 4: Provider Abstraction (Phase 1)

### Current State: Hard-Coded OpenRouter

`src/llm/openrouter.js` has all LLM logic:
- Model selection by task type
- Cost calculation
- Streaming support

**Problem**: Can't swap backends without refactoring.

### Phase 1 Solution: Abstract Interface

**New file**: `src/providers/llm-provider.js`

```javascript
class LLMProvider {
  async complete(prompt, options) {
    throw new Error('implement in subclass')
  }
  async stream(prompt, options) {
    throw new Error('implement in subclass')
  }
  selectModel(taskType) {
    throw new Error('implement in subclass')
  }
}

// Implementations
class OpenRouterProvider extends LLMProvider { /* ... */ }
class ClaudeAPIProvider extends LLMProvider { /* ... */ }
class LocalInferenceProvider extends LLMProvider { /* ... */ }
```

**Registry**:
```javascript
providers.set('openrouter', new OpenRouterProvider())
providers.set('claude-api', new ClaudeAPIProvider())

// Runtime swap
currentProvider = process.env.LLM_PROVIDER === 'claude-api' 
  ? providers.get('claude-api')
  : providers.get('openrouter')
```

Similar abstractions for:
- **Media** (Replicate, Midjourney, local Stable Diffusion)
- **Storage** (S3, GCS, R2)
- **Messaging** (Telegram, WhatsApp, email)

---

## Layer 5: Persistence (Current + Phase 1)

### Current (Phase 0)

#### Supabase PostgreSQL
**File**: `src/db/supabase.js`

**Tables** (in `scripts/migrate.js`):
1. `users` — User identity, budget
2. `projects` — Project metadata
3. `leads` — Generated leads
4. `transactions` — Cost tracking (per-operation)
5. `agent_logs` — Agent execution logs

**Status**: ✅ Optional (graceful fail if keys missing)

### Phase 1 Additions

#### Audit Table
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  agent_name TEXT NOT NULL,
  user_id UUID,
  project_id UUID,
  operation TEXT,
  input JSONB,
  output JSONB,
  cost DECIMAL,
  execution_time_ms INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_agent ON audit_logs(agent_name);
```

**Immutable**: No updates/deletes (append-only)

#### Job State Table
```sql
CREATE TABLE job_state (
  id UUID PRIMARY KEY,
  queue_name TEXT NOT NULL,
  job_id TEXT NOT NULL,
  status TEXT NOT NULL, -- queued, started, completed, failed
  payload JSONB,
  result JSONB,
  error TEXT,
  attempts INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_job_status ON job_state(status);
```

#### Policy Table
```sql
CREATE TABLE policies (
  id UUID PRIMARY KEY,
  user_id UUID,
  monthly_budget DECIMAL DEFAULT 100,
  per_operation_limit DECIMAL DEFAULT 10,
  approval_required_above DECIMAL DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Data Flow: End-to-End Example

### Scenario: User requests landing page

```
1. PRESENTATION
   User sends Telegram message:
   "Create a landing page for my fitness app"

2. ORCHESTRATION (Gateway)
   Webhook received → Command Router parses intent
   Intent: "landing_page_build" → Agent: "LandingPageFactory"

3. ORCHESTRATION (Queue - Phase 1)
   Job enqueued: { agent: 'landing_page_factory', input: '...' }
   Job status: "queued"

4. ORCHESTRATION (Mailbox - Phase 1)
   LandingPageFactory mailbox.nextMessage()
   Finds queued job, status → "started"

5. ORCHESTRATION (Policy - Phase 1)
   Policy check: estimated_cost=$3.50, per_op_limit=$10
   Result: allowed=true

6. AGENT EXECUTION
   LandingPageFactory.execute(input):
     a. Copywriter.execute() → "Revolutionary fitness tracking"
     b. FrontendDeveloper.execute() → React component
     c. StripeSetup.execute() → Payment button
     d. BrevoSetup.execute() → Email capture
     e. VercelDeploy.execute() → Live URL

7. PERSISTENCE
   Each agent call logged to audit_logs (immutable)
   Cost tracked: copywriter=$0.40 + frontend=$1.20 + ...
   Job status → "completed", result = { url: 'https://...' }

8. PRESENTATION
   Telegram bot receives result
   Sends reply: "✅ Your landing page is live: https://..."
```

---

## Scaling Considerations (Roadmap)

### Horizontal Scaling (Phase 2+)

- **Agent workers**: Deploy N instances of agent orchestrator
- **Job queue**: Bull supports multi-worker; use Redis Sentinel for HA
- **Database**: Supabase scales read replicas
- **LLM**: OpenRouter already load-balanced

### Monitoring & Observability

- **Winston logs** → Push to CloudWatch/Datadog
- **Audit logs** → Immutable trail for compliance
- **Metrics** → Cost per agent, latency histograms, error rates
- **Alerts** → Budget threshold, failed jobs, LLM errors

### Security

- **Secret management**: Use `.env` for local, env vars in production
- **Rate limiting**: Policy engine enforces per-user limits
- **Data isolation**: Projects scoped to users
- **Audit trail**: Immutable for compliance

---

## Integration Points (External)

| Layer | Service | Purpose | Status |
|-------|---------|---------|--------|
| **Presentation** | Telegram | Bot gateway | ✅ Live |
| **Presentation** | WhatsApp (planned) | Alternative channel | 📋 Phase 2 |
| **Agent Execution** | OpenRouter | LLM routing | ✅ Live |
| **Agent Execution** | Deepgram | Speech-to-text | ✅ Optional |
| **Agent Execution** | ElevenLabs | Text-to-speech | 📋 Phase 2 |
| **Agent Execution** | Replicate | Image generation | 📋 Phase 2 |
| **Agent Execution** | Clearbit | Lead enrichment | ✅ Ready (unused) |
| **Agent Execution** | Firecrawl | Web scraping | ✅ Ready (unused) |
| **Agent Execution** | Stripe | Payments | ✅ Ready (unused) |
| **Agent Execution** | Brevo | Email marketing | ✅ Ready (unused) |
| **Persistence** | Supabase | PostgreSQL | ✅ Optional |
| **Persistence** | Redis | Job queue (Phase 1) | 📋 Phase 1 |
| **Deployment** | Vercel | Frontend hosting | ✅ Ready (unused) |
| **Deployment** | Render | Backend hosting | ✅ Ready (unused) |

---

**Next**: See DECISIONS.md for audit entry, AGENTS.md for 17-agent catalog, INTEGRATIONS.md for API details.
