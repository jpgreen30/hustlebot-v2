# HustleBot v2 - Decision Log

**Format**: Append-only log. Never edit prior entries. Newest entry on top.

---

## Entry 00D10: Day-10 research quality engine + knowledge consolidation

**Date**: 2026-08-20  
**Decision**: Compose a research-quality evaluator, adaptive query strategy, and knowledge consolidation over the Day-9 evidence graph. Do not introduce a graph database, vector DB, LangGraph, CrewAI, or a competitor list.

### Persistence

- **Supabase** is the durable SoT for intelligence JSONB tables (Day-9 002 + Day-10 003: runs, adaptations, query/source observations, playbooks, metrics).
- Production writes that fail mark intel health **DEGRADED**. Fail-open is no longer silent.
- **Redis** remains the hot replica/cache. Redis-only survival does not satisfy Day-10.
- **Mem0** is still not the source of truth.

### Quality

Evaluate against the objective (entity-type fit, quantity coverage, noise, first-party, diversity). Classifications: STRONG / ACCEPTABLE / WEAK / FAILED. Listicles, directories, APK mirrors, and clinical orgs do not occupy product-landscape candidate slots.

### Adaptation

Weak/failed research proposes novel queries and source-type changes within budget. LLM suggestions are validated. Poisoned operational memory (e.g. "use Wikipedia for all product discovery") is not authoritative.

### Outbound

Unchanged. Discovery is not permission to contact.

---

## Entry 00D9: Day-9 persistent intelligence fabric + evidence graph

**Date**: 2026-08-20  
**Decision**: Compose intelligence primitives over existing MacGyver + Tool Fabric + Redis + filesystem + ApprovalGate. Do not introduce Neo4j/Memgraph/Weaviate/Pinecone/LangGraph/CrewAI. Mem0 is not the source of truth. n8n records, does not own research.

### Persistence

- **Supabase** (preferred durable SoT): JSONB payload tables `operational_memories`, `intelligence_entities`, `intelligence_aliases`, `intelligence_sources`, `intelligence_claims`, `intelligence_evidence`, `intelligence_relations`. Fail open if tables/RLS are missing.
- **Redis**: hot entity/source cache, `hustlebot:intel:{kind}:{id}` replica, operational memory replica `hustlebot:memory:{id}`. Survives Render disk reset. Not the only copy of durable evidence when Supabase is present.
- **Filesystem** (`HUSTLEBOT_DATA_DIR/intel`, `/memory`): local tests and process-death recovery. Insufficient alone on Render.
- **Mem0**: still a historical stub. Never jobs, evidence, or factual records.

### Evidence graph

Relational records (entity / alias / claim / evidence / relation / source) in Maps + JSONB. Strong keys merge (canonical domain, provider ID, normalized legal/trade name without conflicting domain, acronym expansion without conflicting domain). Same name + different domains refuse merge.

### Source selection

SourceRegistry + Tool Fabric policy. Live health overlay wins over operational memory. DISCOVERED sources are not auto-trusted. intelligence.research is planner-visible and is **not** a mega-capability; org.discover remains the discovery primitive.

### Outbound

Unchanged. Discovery is not permission to contact. ApprovalGate remains the gate.

---

## Entry 00D8: Day-8 durable runtime, scheduler, operational memory

**Date**: 2026-08-20  
**Decision**: Extend existing JobQueue + filesystem JSON stores. Do not introduce Celery/BullMQ/Temporal/Airflow. Do not install Mem0. Do not make n8n the orchestration brain.

### Redis vs filesystem vs Supabase

- **Redis**: leases, pending/delayed/active coordination, scheduler leader lock (`SET NX EX`), mailbox. Authoritative for multi-instance claim races.
- **Filesystem** (`src/.data`, gitignored; `HUSTLEBOT_DATA_DIR`): job records when Redis is absent (real process-death tests), event journal JSONL, schedules, operational memory, approval records, n8n effect log. Authoritative for local restart recovery.
- **Supabase**: unchanged. Users/projects/leads. Not required for Day-8 job/schedule/memory state. No invented schema.

### Mem0

Mem0 remains a historical in-memory stub (`src/features/memory-system.js`). It is **not** the operational source of truth. Day-8 operational memory is file-backed with provenance, confidence, expiry, and an untrusted-write refusal. Mem0 may later be useful for semantic *user* memory, never for jobs, objectives, or schedules.

### n8n

n8n remains a workflow provider/recorder. Scheduler creates MacGyver objectives. MacGyver plans and executes. n8n `execute` honors `idempotencyKey` to avoid duplicate side effects.

### Queue

Existing `JobQueue` gained: file store, leases/heartbeat, delayed `availableAt`, pause/resume, dead-letter, idempotency keys, retry classification, graceful `stopClaiming`.

---

## Entry 001: Phase 0 Audit Completed

**Date**: 2026-08-14  
**Decision**: Conducted comprehensive Phase 0 audit. Established baseline documentation.

### What Was Audited

- ✅ `src/server.js` (389 lines) — Express server, Telegram gateway
- ✅ `src/agents/base-agent.js` (218 lines) — Foundation class
- ✅ `src/agents/*.js` (17 specialized agents) — Copywriter, Developer, Strategy roles
- ✅ `src/core/*.js` — Command router, budget controller
- ✅ `src/llm/openrouter.js` — Smart model routing (6+ models)
- ✅ `src/db/supabase.js` — Database abstraction
- ✅ `src/tools/*.js` — Landing page & lead generation factories
- ✅ `package.json` — Dependencies verified
- ✅ `.env.example` — 30+ integrations listed
- ✅ `scripts/migrate.js` — Database schema
- ✅ Existing documentation (`START-HERE.md`, `BUILD-SUMMARY.md`, etc.)

### Findings

**Current State** (evidence-based, verified):
- Express server is live, graceful initialization with fallbacks
- Telegram bot working; `/start`, `/help`, `/status` commands registered
- 17 agents operational in-memory
- OpenRouter integration with cost tracking
- 2 of 6 tool factories complete (landing page, lead gen)
  - ⚠️ Vercel deployment is **mocked** (returns synthetic URL, not real deploy)
  - ⚠️ Clearbit enrichment is **mocked** (returns hard-coded data, not API calls)
- Supabase optional (fails gracefully if keys missing)
- Voice support via Deepgram (optional)
- Budget controller in place, **alerts at 75%/90%, does NOT enforce cap** (recordings happen after operations complete)

**Gaps** (to address in Phase 1):
- No capability registry (agents not discoverable/versioned)
- No job queue (fire-and-forget execution, no retry)
- No agent mailbox (no inter-agent coordination)
- No provider abstraction (LLM/storage hard-coded)
- No approval gates (no spend override control)
- No audit logs (no immutable trail)
- No planning DAG (no multi-step workflows)

### Deliverables

Created 8 documentation files in `/docs/`:

1. **MASTER_SPEC.md** — Platform scope, target architecture, Phase 1 requirements
2. **ARCHITECTURE.md** — Layer-by-layer component map, data flow examples
3. **DECISIONS.md** — This log (append-only, never edit)
4. **AGENTS.md** — 17-agent catalog with capabilities
5. **WORKFLOWS.md** — Multi-step recipes, DAG format examples
6. **INTEGRATIONS.md** — External API details (credentials, rate limits, costs)
7. **ENVIRONMENT.md** — Config, secrets, deployment contexts
8. **DATA_MODEL.md** — Supabase schema, audit tables, state

### Authority

- **MASTER_SPEC.md** is now the single source of truth for platform scope
- Phase 1 work must align with §1–3 of MASTER_SPEC.md
- Any deviation requires new DECISIONS.md entry (never amend MASTER_SPEC.md directly)

### Next Steps

1. Review all 8 docs; suggest corrections via DECISIONS.md entries (not by editing docs)
2. Approve Phase 0 as baseline for Phase 1
3. Begin Phase 1: Hardening (capability registry, job queue, mailbox, provider abstraction)

### Assumptions Made

- **No MASTER_SPEC.md provided** → Inferred from user instructions (Phase 0 audit, Phase 1 hardening, Platform Hardening scope §57)
- **Baby-to-Bloom repo does not exist yet** → Assumed separate repo (per MASTER_SPEC §2.1)
- **Approval workflow** → Assumed manual (email/webhook); to be specified in Phase 1
- **Local development** → Assumed primary target; remote environments (Render, Vercel) optional

### Verified Claims vs. Documentation

- Prior `START-HERE.md` claimed "17 specialized AI agents" → ✅ Verified, all 17 exist
- Prior `BUILD-SUMMARY.md` claimed "Phase 2 complete" → ✅ Verified, agents working
- No claims of "production deployed at hustlebot-v2.onrender.com" → ✅ Correct, not deployed
- No claims of real Supabase/OpenRouter live usage → ✅ Correct, optional/graceful fallback

### Corrections Made (Post-Audit)

Automated review found 8 issues in the audit docs themselves. Corrections applied:

1. **Schema mismatches**: Updated DATA_MODEL.md §I to reflect actual `scripts/migrate.js` (users has `telegram_id`, not `email`; transactions simpler; agent_logs no `user_id`)
2. **Hard-cap claim**: Revised DECISIONS.md & ARCHITECTURE.md to clarify budget controller **alerts only**, does NOT block operations
3. **SQL order**: Fixed DATA_MODEL.md §II trigger migration (function before trigger, PostgreSQL requirement)
4. **Missing credential**: Added `SUPABASE_SERVICE_KEY` to ENVIRONMENT.md §I required-vars (was omitted; `scripts/migrate.js` requires it)
5. **GDPR deletion**: Updated DATA_MODEL.md §V to delete leads before projects (FK constraint without CASCADE)
6. **Vercel mock**: Marked INTEGRATIONS.md §IX Vercel as mocked (returns synthetic URL)
7. **Clearbit mock**: Marked INTEGRATIONS.md §IV Clearbit as mocked (returns hard-coded data)
8. **Orchestrator stub**: Updated ARCHITECTURE.md §2.2 to clarify orchestrator is unwired (always returns success=false)

---

**Status**: ✅ Phase 0 audit complete. Ready for Phase 0 PR review.

**Next Decision Entry**: Will be opened when Phase 1 work begins (capability registry, job queue, etc.)
