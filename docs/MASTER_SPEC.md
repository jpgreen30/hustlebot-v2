# HustleBot v2 - Master Specification

**Version**: 0.1 (Phase 0 Audit, 2026-08-14)  
**Status**: Audit baseline established; Phase 1 preparation underway

---

## Executive Summary

HustleBot v2 is an AI-powered business automation platform designed to help solopreneurs and small teams build landing pages, generate leads, create content, and produce video—all coordinated by 17 specialized agents orchestrated through a central LLM router.

**Current**: A minimalist, production-ready server with graceful fallback behavior, live Telegram integration, and two complete tool factories.

**Target**: Enterprise-grade agent platform with typed registries, persistent state management, job queues, and policy-driven execution—reusing existing agent implementations as raw material for hardening.

---

## §1: Platform Scope

### 1.1 Three-Layer Responsibility Boundary

```
HUSTLEBOT-V2 CORE (Reusable Platform)
├── Agent Framework (registry, execution, lifecycle)
├── Tool Registry (capability catalog & routing)
├── Provider Abstraction (LLM, media, storage)
├── Job/Task Queue (durable execution, retry)
├── Agent Mailbox (coordination, state handoff)
├── Audit & Policy (logging, approval gates)
└── Plan DAG (multi-step workflows)

BABY-TO-BLOOM (Business Logic)
├── Domain-specific agents & tools
├── Workflow orchestrations
├── Lead scoring rules
├── Content templates
└── Compliance rules (if B2C SaaS)
```

**Rule**: No Baby-to-Bloom business logic in hustlebot-v2 core (§2.1).

### 1.2 External Integrations (Not Owned)

- **LLM Providers**: OpenRouter, Anthropic Claude API, OpenAI, Google, etc.
- **Media/Content**: Replicate (images), Deepgram (speech-to-text), ElevenLabs (TTS)
- **Storage**: AWS S3, Supabase storage
- **Deployment**: Vercel, Render, Fly.io
- **Messaging**: Telegram, WhatsApp (Twilio), Email (Brevo)
- **Data Enrichment**: Clearbit, Apollo
- **Social/CMS**: Shopify, Webflow, YouTube, LinkedIn

---

## §2: Architecture Decisions

### 2.1 Agent Reuse, Not Refactor

Existing 17 specialized agents (`src/agents/*.js`) are working implementations with stable prompts and tool bindings. Phase 1 **does not** refactor them; instead, it:
1. Registers them in a **new capability registry** (not edit old code)
2. Wraps execution in **new mailbox/queue** (non-breaking)
3. Adds **new audit/policy** layers around them (middleware)
4. Provides **new provider abstraction** they can opt into

This preserves working code while hardening the platform beneath it.

### 2.2 Phase 0: Audit & Spec Scaffold

**Dates**: 2026-08-14 (this session)

**Deliverable**: 8 documentation files in `/docs/`:
- `MASTER_SPEC.md` (this file)
- `ARCHITECTURE.md` (layer-by-layer component map)
- `DECISIONS.md` (append-only decision log)
- `AGENTS.md` (catalog of 17 agents + roles)
- `WORKFLOWS.md` (multi-step recipes & DAG format)
- `INTEGRATIONS.md` (external APIs, credentials, rate limits)
- `ENVIRONMENT.md` (config, secrets, deployment contexts)
- `DATA_MODEL.md` (Supabase schema, audit tables, state)

**Commit**: Single PR onto main (not merged—for your review).

### 2.3 Phase 1: Platform Hardening (30–50 hours)

**Scope**: Foundational infrastructure to support 5+ concurrent agents without data loss or missed events.

#### 1a. Capability Registry
- **Typed registry** of agent capabilities (tools, models, constraints)
- JSON schema introspection (input/output shapes)
- Versioning (agents can update capabilities per version)
- Discovery endpoint for UI builders

#### 1b. Tool Registry
- **Central catalog** of all tools (agent-provided + external)
- Tool cost metadata (API calls, token usage, $$ per invocation)
- Rate limit tracking per tool/provider
- Provider abstraction layer (swap LLM, storage, media backends)

#### 1c. Provider Abstraction
- **LLM abstraction** (swap OpenRouter ↔ Claude API ↔ local inference)
- **Media abstraction** (Replicate ↔ Midjourney ↔ Stable Diffusion)
- **Storage abstraction** (S3 ↔ GCS ↔ R2)
- Fallback chains (route to backup if primary fails)

#### 1d. Job Queue & Durable Execution
- **Bull.js** queue (Redis backed, already in package.json)
- Job persistence (retryable, resumable)
- Status tracking (queued → started → completed/failed)
- Async task lifecycle hooks

#### 1e. Agent Mailbox & Handoff State
- **Per-agent inbox** (typed messages, time-ordered)
- **Handoff protocol** (agent A → mailbox → agent B with state)
- Memory integration (retain context across tasks)
- Execution context (project, user, budget scope)

#### 1f. Shared Audit Logs & Compliance
- **Structured logging** (JSON, indexed by agent/user/project)
- **Immutable audit trail** (append-only, never edit)
- **Compliance hooks** (GDPR delete, data retention)
- **Cost tracking** (per-agent, per-user, per-project roll-ups)

#### 1g. Policy & Approval Layer
- **Hard spend caps** (monthly budget, per-operation limits)
- **Approval gates** (manual review for >$X operations)
- **Feature flags** (enable/disable capabilities per user)
- **Rate limits** (per-user, per-tool, per-LLM)

#### 1h. Planning DAG & Multi-Step Workflows
- **Acyclic task graphs** (define sequences, parallelism, conditionals)
- **Executor** (traverse DAG, handle failures, route to agents)
- **Visualization** (export DAG for debugging/UI)
- **State snapshots** (pause/resume workflows)

---

## §3: Current Codebase Baseline

### 3.1 Verified Working Components

| Component | Status | Evidence |
|-----------|--------|----------|
| **Express server** | ✅ Live | `src/server.js` lines 1–50, graceful init |
| **Telegram bot** | ✅ Live | Telegraf 4.14.1, `/start`, `/help`, `/status`, webhook route |
| **BaseAgent class** | ✅ Core | `src/agents/base-agent.js`, 218 lines, LLM calls + retry logic |
| **17 specialized agents** | ✅ Listed | `src/agents/*.js`, each inherits BaseAgent |
| **OpenRouter LLM** | ✅ Live | 6 models, smart routing by task type |
| **Supabase DB** | ✅ Optional | Gracefully fails if keys missing; tables in `scripts/migrate.js` |
| **Voice (Deepgram)** | ✅ Optional | STT only, graceful disable if key missing |
| **Cost tracking** | ✅ Core | `src/core/budget-controller.js` + Supabase transactions table |
| **Tool factories** | ✅ 2 of 6 | Landing page (`src/tools/landing-page-factory.js`) + Lead Gen |

### 3.2 Known Gaps (to address in Phase 1)

| Gap | Current | Phase 1 Solution |
|-----|---------|------------------|
| **No type system** | String-based tool names | JSON schema introspection in registry |
| **No job queue** | Inline execution only | Bull.js queue + Redis |
| **No agent identities** | Anonymous, namespaced only | UUID + auth identity in mailbox |
| **No transaction handling** | Fire-and-forget LLM calls | Job state snapshots, idempotent retries |
| **No approval layer** | No spend gates | Policy engine + manual approval hooks |
| **No provider swap** | Hard-coded OpenRouter | Abstract backend layer |
| **No workflow DAG** | Single-agent tasks only | Planning DAG executor |
| **No state persistence** | In-memory execution context | Mailbox + persistent job state |

### 3.3 Dependencies Review

**Production**:
- `express@4.18.2`, `cors`, `helmet`: HTTP server ✅
- `telegraf@4.14.1`: Telegram bot ✅
- `@deepgram/sdk@3.4.0`: Speech-to-text ✅
- `openrouter-ai@1.0.0`: LLM routing ✅
- `@supabase/supabase-js@2.38.0`: Database ✅
- `bull@4.11.5`: Job queue (ready to use in Phase 1) ✅
- `ioredis@5.3.2`: Redis client (queue backing) ✅
- `winston@3.11.0`: Logging ✅
- `stripe@13.11.0`, `axios`, `uuid`, `dotenv`: Utilities ✅

**Media** (optional, graceful fallback):
- `@sharp`: Image resizing (ready)
- `playwright@1.40.0`: Web scraping (ready)
- `cheerio@1.0.0-rc.12`: HTML parsing (ready)

**Dev**:
- `eslint`, `prettier`, `nodemon`: Standard ✅

---

## §4: Phase 1 Priorities

### 4.1 Must-Have (Blocking downstream work)

1. **Capability Registry** — agents can't be discovered, scaled, or composed without it
2. **Job Queue** — no durable execution, no retry, no resumable workflows
3. **Agent Mailbox** — no coordination between agents, no state handoff
4. **Provider Abstraction** — no flexibility to swap LLMs mid-project

### 4.2 Should-Have (Unblocks most use-cases)

5. **Audit Logs** — required for compliance, debugging, cost tracking
6. **Policy Layer** — spend gates are critical to avoid runaway costs
7. **Planning DAG** — multi-step workflows (landing page build, lead pipeline)

### 4.3 Nice-to-Have (Improves ops, not critical)

8. **State Snapshots** — pause/resume workflows (manual intervention workflows)

---

## §5: File Organization

```
hustlebot-v2/
├── docs/                          # Phase 0 audit (this section)
│   ├── MASTER_SPEC.md            # (you are here)
│   ├── ARCHITECTURE.md           # Component layer map
│   ├── DECISIONS.md              # Audit log (append-only)
│   ├── AGENTS.md                 # 17 agent catalog
│   ├── WORKFLOWS.md              # Multi-step recipes
│   ├── INTEGRATIONS.md           # External APIs
│   ├── ENVIRONMENT.md            # Config & deployment
│   └── DATA_MODEL.md             # Supabase schema
├── src/
│   ├── server.js                 # Express + Telegram entry
│   ├── agents/                   # 17 specialized agents + base
│   │   ├── base-agent.js
│   │   ├── llm-agent.js
│   │   ├── orchestrator.js
│   │   └── [13 specialized agents...]
│   ├── core/                     # Foundational services
│   │   ├── budget-controller.js
│   │   └── command-router.js
│   ├── llm/                      # LLM routing & abstraction
│   │   └── openrouter.js
│   ├── db/                       # Database access
│   │   └── supabase.js
│   ├── tools/                    # Tool factories
│   │   ├── landing-page-factory.js
│   │   └── lead-gen-factory.js
│   ├── telegram/                 # Telegram handlers
│   ├── voice/                    # Voice (Deepgram)
│   ├── utils/                    # Logging, helpers
│   └── [tests]
├── scripts/
│   └── migrate.js                # DB schema setup
├── .env.example                  # Credentials template
├── package.json                  # Dependencies
└── [deployment docs]
```

---

## §6: Success Criteria

### Phase 0 (Audit & Spec)
- [ ] 8 docs files merged to main
- [ ] DECISIONS.md has audit entry (dated, never edited again)
- [ ] All 17 agents cataloged in AGENTS.md
- [ ] Current + target state clearly separated

### Phase 1 (Hardening)
- [ ] Capability registry deployed, agents discoverable via `/api/agents`
- [ ] Bull.js queue operational, test job lifecycle (queue → start → complete)
- [ ] Agent mailbox sends/receives typed messages
- [ ] LLM backend abstraction, can swap OpenRouter ↔ Claude API without code change
- [ ] Audit logs immutable in Supabase, 100% of agent executions logged
- [ ] Policy layer enforces $100/month cap, approves >$10 operations
- [ ] Planning DAG executor runs 3-step workflow end-to-end
- [ ] All tests pass, zero agent execution regressions

---

## §7: Standing Rules

1. **Paid or irreversible actions** (domain, production deploy, ad spend, paid API tier) require explicit confirmation each turn.
2. **Missing credentials** (Retell, HeyGen, Shotstack, etc.) are flagged individually; work continues, no silent placeholders.
3. **Real credentials** are never committed; `.env.example` names only.
4. **One source of truth**: Amend MASTER_SPEC.md via DECISIONS.md if implementation diverges—never silently.
5. **BabyToBloom logic stays out** of hustlebot-v2 core (§2.1).

---

## §8: Timeline & Resources

| Phase | Hours | Effort | Cost |
|-------|-------|--------|------|
| **Phase 0** (Audit) | 2–3 | Low | ~$1 (LLM calls) |
| **Phase 1** (Hardening) | 30–50 | High | ~$10–20 (LLM calls) |
| **Phase 2** (Integration) | 20–30 | Medium | ~$5–10 |
| **Phase 3–5** (Features) | Ongoing | Variable | Tracked by budget cap |

---

## §9: Questions for Next Session

1. Is the target **MASTER_SPEC** in a separate file, or embedded in docs you'll share?
2. Does Baby-to-Bloom have its own repo, or should it fork hustlebot-v2?
3. For Phase 1, do you want **vendor lock-in to OpenRouter**, or true provider swap (even local inference)?
4. For approvals: **who** approves >$X operations? A human email, a Slack webhook, or an API call?

---

**Next**: Review ARCHITECTURE.md for component map, DECISIONS.md for audit entry, AGENTS.md for 17-agent catalog.
