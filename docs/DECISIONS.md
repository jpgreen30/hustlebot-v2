# HustleBot v2 - Decision Log

**Format**: Append-only log. Never edit prior entries. Newest entry on top.

---

## Entry 002: Phase 1 Hardening - Foundation Layer (Capability Registry, Tool Registry, Provider Abstraction)

**Date**: 2026-08-14  
**Decision**: Begin Phase 1 platform hardening with foundational abstraction layers.

### Scope

Per MASTER_SPEC §57, Phase 1 requires 10 hardening items:
1. Capability Registry (STARTED)
2. Tool Registry (STARTED)
3. Provider Abstraction (STARTED)
4. Media Abstraction (PLANNED)
5. Job Queue with Redis/Bull.js (PLANNED)
6. Agent Mailbox for coordination (PLANNED)
7. Planning DAG executor (PLANNED)
8. Agent identities and versioning (PLANNED)
9. Shared audit logs (PLANNED)
10. Policy/approval layer (PLANNED)

### Work Completed (This Entry)

**1. Capability Registry** (`src/core/capability-registry.js`)
- ✅ Dynamic agent capability registry with in-memory cache
- ✅ Capability registration API with DB persistence
- ✅ Discovery queries (by agent, by tool, by filter)
- ✅ Status management (active | deprecated | beta)
- ✅ Cost estimation per capability
- ✅ Rate limit tracking metadata
- ✅ Registry stats and health checks
- 🔧 Database methods stub: `db.getAllCapabilities()`, `db.registerCapability()`, `db.updateCapabilityStatus()`

**2. Tool Registry** (`src/core/tool-registry.js`)
- ✅ Tool definition management with versioning
- ✅ JSON Schema validation for inputs/outputs (simplified; production should use ajv)
- ✅ Tool implementation binding (decouple definition from implementation)
- ✅ Tool invocation with full validation pipeline
- ✅ Category-based tool discovery
- ✅ Status management and version resolution (latest, specific)
- ✅ Registry stats and health checks
- 🔧 Database methods stub: `db.getAllTools()`, `db.registerTool()`, `db.updateToolStatus()`

**3. Provider Abstraction** (`src/core/provider-abstraction.js`)
- ✅ LLM provider abstraction (OpenRouter, Anthropic, OpenAI, Grok, DeepSeek, Gemini)
- ✅ Media provider abstraction (Replicate, Midjourney)
- ✅ Storage provider abstraction (S3, Local, In-Memory)
- ✅ Fallback chain logic for each provider type
- ✅ Runtime provider switching
- ✅ Provider health status and config reporting
- ✅ Credential detection via environment variables
- ⚠️ Mock implementations (real provider client initialization needed in Phase 2)

### Key Design Decisions

**1. Capability Registry vs. Tool Registry Separation**
- **Why**: Capabilities describe WHAT an agent can do (agent + tool + metadata), while tools describe HOW tools are used (schema, validation, invocation).
- **Benefit**: Enables independent evolution of agent capabilities and tool definitions. A single tool (e.g., "email_send") can be used by multiple agents with different costs/rate limits.

**2. In-Memory Cache with DB Backing**
- **Why**: All three registries cache in memory and persist to Supabase.
- **Benefit**: Fast lookups at runtime; durability across restarts.
- **Trade-off**: Consistency window (new registrations visible after next initialization).

**3. Simplified JSON Schema Validation**
- **Current**: Hand-coded type checking (strings, required fields).
- **Production**: Should integrate `ajv` (Another JSON Schema Validator) for full JSON Schema support.
- **Why**: Defer to Phase 2 to avoid blocking Phase 1 progress.

**4. Provider Fallback Chains**
- **Why**: Enable graceful degradation when primary provider unavailable.
- **Example**: LLM fallback chain = [openrouter, anthropic, openai]. If OpenRouter down, try Anthropic next.
- **Config**: Hardcoded defaults; should move to environment variables (Phase 2).

**5. Lazy Provider Initialization**
- **Current**: All providers initialized in order; first successful one becomes active.
- **Benefit**: Handles missing credentials gracefully (e.g., no REPLICATE_API_TOKEN → media provider disabled but system continues).
- **Fallback Chain Order**: Respects user preference but tries available options.

### Database Stubs

All three modules define methods they need from `db` layer:

**CapabilityRegistry**:
- `db.getAllCapabilities()` → List all capabilities
- `db.registerCapability(metadata)` → Insert and return new capability
- `db.updateCapabilityStatus(agentName, agentVersion, toolName, status)` → Update status

**ToolRegistry**:
- `db.getAllTools()` → List all tool definitions
- `db.registerTool(metadata)` → Insert and return new tool
- `db.updateToolStatus(toolName, version, status)` → Update status

**ProviderAbstraction**:
- No database calls (only env var checks)

### Integration Points

1. **Server Init** (`src/server.js`): Should initialize registries after DB connection
2. **Agent Orchestrator** (Phase 1.8): Will query capability registry to discover available agents
3. **Budget Controller**: Will use capability registry to get cost_per_call per capability
4. **Job Queue** (Phase 1.5): Will use tool registry for tool invocation
5. **Agent Mailbox** (Phase 1.6): Will check capabilities before routing inter-agent messages

### Next Steps (Phase 1)

1. **Database Layer**: Create capabilities and tools tables in Supabase schema
2. **Server Integration**: Wire registries into server.js initialization
3. **Bootstrap Data**: Seed registries with existing 17 agents + tools (from AGENTS.md catalog)
4. **Media Abstraction** (Phase 1.4): Abstract image generation, speech synthesis
5. **Job Queue** (Phase 1.5): Bull.js queue with persistent state
6. **Agent Mailbox** (Phase 1.6): Bidirectional inter-agent messaging
7. **Planning DAG** (Phase 1.7): Multi-step workflow executor
8. **Agent Identities** (Phase 1.8): Versioned agent objects and deployment tracking
9. **Audit Logs** (Phase 1.9): Immutable append-only compliance table
10. **Policy Layer** (Phase 1.10): Budget gates, approval thresholds, feature flags

### Testing Strategy

- Unit tests for registry query APIs (in-memory correctness)
- Integration tests for DB round-trip (persist → load → query)
- Provider fallback simulation (mock missing credentials)
- Cost estimation accuracy vs. budget controller

### Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Schema validation too permissive (security) | Upgrade to ajv in Phase 2; add stricter rules |
| Registry initialization fails silently | Add comprehensive logging; require explicit initialization check before use |
| Provider fallback chain too long (latency) | Monitor switch-over speed; pre-warm primary providers |
| Missing credentials for optional providers | Log warnings but continue (graceful degradation already implemented) |

### Authority

- This entry documents Phase 1 work per MASTER_SPEC §57 (Platform Hardening).
- Capability registry design from §1 of hardening requirements.
- Tool registry design from §2 of hardening requirements.
- Provider abstraction design from §3-4 of hardening requirements.
- Any deviation from this entry requires new DECISIONS.md entry (never amend this entry).

---

**Status**: Phase 1.1-1.3 foundation layers implemented. Ready for DB schema + server integration.

**Next Entry**: Will document Phase 1.4 (Media Abstraction) and 1.5 (Job Queue) when those layers complete.

---

## Entry 001: Phase 0 Audit Completed

**Date**: 2026-08-14  
**Decision**: Conducted comprehensive Phase 0 audit. Established baseline documentation.

[See Phase 0 audit branch (claude/hustlebot-docs-audit-5jlyry) for full Entry 001 details]

### Summary

- ✅ 8 documentation files created (MASTER_SPEC, ARCHITECTURE, AGENTS, WORKFLOWS, INTEGRATIONS, ENVIRONMENT, DATA_MODEL, DECISIONS)
- ✅ 8 accuracy issues identified and corrected (schema, hard-cap claim, SQL order, env vars, GDPR deletion, integration mocks, orchestrator status)
- ✅ Phase 0 baseline established; ready for Phase 1 hardening

---
