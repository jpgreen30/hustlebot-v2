# HustleBot v2 - Workflows & Multi-Step Recipes

**Version**: 0.1 (Phase 0, 2026-08-14)

This document describes multi-step workflows and the DAG (Directed Acyclic Graph) format for Phase 1 implementation.

---

## I. Current Workflows (Phase 0)

These workflows exist today, implemented as sequential agent chains in tool factories.

### 1. Landing Page Build

**Current Implementation**: `src/tools/landing-page-factory.js`

**Steps**:
1. **Copywriter** → Generate headline, body copy, CTA
2. **Frontend Developer** → Build React component
3. **Stripe Setup** → Add payment button
4. **Brevo Setup** → Add email capture form
5. **Vercel Deploy** → Deploy live

**Flow**:
```
Input: { topic, target_audience, features }
  ↓
Copywriter.execute()
  → { headline, body, cta, images }
  ↓
FrontendDeveloper.execute()
  → { react_code, preview_url }
  ↓
StripeSetup.execute()
  → { payment_button_code, stripe_product_id }
  ↓
BrevoSetup.execute()
  → { email_form_code, list_id }
  ↓
VercelDeploy.execute()
  → { live_url, deploy_id }
  ↓
Output: { live_url, metrics }
```

**Cost**: ~$2–5 total  
**Time**: ~30–60 seconds  
**Failure Modes**:
- Copywriter timeout → fallback to template copy
- Frontend build error → fallback to basic HTML
- Vercel deploy fails → return preview URL instead

**Current Reliability**: ✅ Tested, handles most cases

---

### 2. Lead Generation Pipeline

**Current Implementation**: `src/tools/lead-gen-factory.js`

**Steps**:
1. **Web Scraping** → Identify target companies/contacts
2. **Email Validation** → Verify email addresses (Hunter/Clearbit)
3. **Enrichment** → Add company info, title, social (Clearbit)
4. **ICP Scoring** → Rank by ideal customer profile fit
5. **Deduplication** → Remove duplicates
6. **Delivery** → Send via webhook, email, or CSV

**Flow**:
```
Input: { domain, industry, location, keywords, count }
  ↓
WebScraper.execute()
  → { raw_leads: [name, email, company, ...] }
  ↓
EmailValidator.execute()
  → { valid_leads: [...] }
  ↓
Enrichment.execute()
  → { enriched_leads: [company_size, revenue, growth, ...] }
  ↓
ICPScorer.execute()
  → { scored_leads: [score 0–100 per lead] }
  ↓
Deduplicator.execute()
  → { final_leads: [...] }
  ↓
Delivery.execute()
  → { sent_count, delivery_status }
  ↓
Output: { leads: [...], metrics: { total, qualified, cost } }
```

**Cost**: ~$1–3 per 100 qualified leads  
**Time**: ~15–45 seconds  
**Failure Modes**:
- No leads found → return empty list + error
- Enrichment API fails → continue with partial data
- Scorer unreachable → skip scoring step

**Current Reliability**: ✅ Robust, handles partial failures

---

## II. Phase 1: DAG Format

Phase 1 introduces the **Planning DAG Executor**, which runs multi-step workflows as acyclic graphs.

### DAG Structure (JSON/YAML)

```json
{
  "name": "landing_page_build",
  "description": "Build and deploy a landing page",
  "version": "1.0.0",
  "nodes": [
    {
      "id": "copywriter",
      "agent": "copywriter",
      "tool": "generate_sales_copy",
      "input": {
        "topic": "{{ input.topic }}",
        "target_audience": "{{ input.audience }}"
      },
      "timeout": 30,
      "retry": { "attempts": 2, "backoff": "exponential" }
    },
    {
      "id": "frontend",
      "agent": "frontend_developer",
      "tool": "build_landing_page",
      "input": {
        "copy": "{{ copywriter.output.body }}",
        "headline": "{{ copywriter.output.headline }}",
        "layout": "{{ input.layout || 'default' }}"
      },
      "timeout": 30,
      "retry": { "attempts": 2 }
    },
    {
      "id": "deploy",
      "agent": "devops",
      "tool": "deploy_to_vercel",
      "input": {
        "code": "{{ frontend.output.code }}",
        "project_name": "{{ input.topic | slugify }}"
      },
      "timeout": 60
    }
  ],
  "edges": [
    { "from": "copywriter", "to": "frontend" },
    { "from": "frontend", "to": "deploy" }
  ],
  "error_handlers": [
    {
      "node": "copywriter",
      "on_error": "fallback",
      "fallback_input": { "copy": "Default sales copy" }
    },
    {
      "node": "frontend",
      "on_error": "fail_fast",
      "message": "Cannot build component"
    }
  ]
}
```

### Node Specification

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | Yes | Unique node identifier |
| `agent` | string | Yes | Agent name (from registry) |
| `tool` | string | Yes | Tool name on agent |
| `input` | object | Yes | Input to tool (supports templating: `{{ ref.output.field }}`) |
| `timeout` | integer | No | Max seconds to wait (default: 30) |
| `retry` | object | No | Retry policy (attempts, backoff) |
| `cache` | boolean | No | Cache result (default: false) |
| `condition` | string | No | Execute if condition true (Phase 2) |

### Edge Specification

| Field | Type | Notes |
|-------|------|-------|
| `from` | string | Source node ID |
| `to` | string | Destination node ID |
| `weight` | number | Execution priority (Phase 2) |

### Error Handlers

| Strategy | Behavior |
|----------|----------|
| `fallback` | Use fallback input; continue DAG |
| `fail_fast` | Stop DAG immediately; return error |
| `skip` | Skip node; continue to next (Phase 2) |
| `manual_approval` | Pause; wait for approval (Phase 2) |

---

### DAG Execution Flow

```javascript
// Pseudo-code for DAG executor
async function executeDag(dag, inputs) {
  const results = {}
  const queue = getStartNodes(dag)

  while (queue.length > 0) {
    const node = queue.shift()
    
    try {
      // Substitute variables in input
      const resolvedInput = substituteVariables(node.input, results)
      
      // Get agent and execute tool
      const agent = registry.get(node.agent)
      const result = await agent.execute(node.tool, resolvedInput)
      
      // Store result
      results[node.id] = result
      
      // Enqueue downstream nodes
      const downstreamNodes = dag.edges
        .filter(e => e.from === node.id)
        .map(e => findNode(dag, e.to))
      queue.push(...downstreamNodes)
      
    } catch (error) {
      // Handle error per error_handlers config
      const handler = dag.error_handlers.find(h => h.node === node.id)
      if (handler.on_error === 'fail_fast') {
        throw error
      } else if (handler.on_error === 'fallback') {
        results[node.id] = await executeWithFallback(node, handler.fallback_input)
      }
    }
  }
  
  return results
}
```

---

## III. Planned Workflows (Phase 1+)

### 3. Content Calendar Generator

**Goal**: Generate 30-day content plan for a niche

**DAG**:
```
Node 1: Ideation Agent
  → Brainstorm 30 topics for fitness niche

Node 2: Content Writer (parallel)
  → Write blog posts (8/month)
  → Write social posts (20/month)
  → Write email sequences (2/month)

Node 3: Analytics Agent
  → Estimate engagement per piece
  → Rank by priority

Output: { calendar, estimated_reach, effort_hours }
```

**Phase 1 Feature**: Parallelism (Node 2 tasks run concurrently)

---

### 4. E-commerce Store Launch

**Goal**: Launch a Shopify store with products, email sequences, and ads

**DAG**:
```
Node 1: E-commerce Agent
  → Create Shopify store
  → Import products from CSV

Node 2: Copywriter (parallel)
  → Write product descriptions
  → Create email sequences

Node 3: Marketing Agent (parallel)
  → Design ad creatives
  → Write ad copy

Node 4: DevOps Agent
  → Set up domain, SSL
  → Configure webhooks

Node 5: Analytics Agent
  → Set up tracking (GA4, Segment)
  → Create dashboards

Output: { store_url, product_count, email_sequences, ads }
```

**Phase 1 Feature**: Parallelism + conditional logic (e.g., skip if already exists)

---

### 5. Lead-to-Customer Pipeline

**Goal**: Find leads, nurture, and track conversion

**DAG**:
```
Node 1: Lead Gen Factory
  → Generate 100 qualified leads

Node 2: Brevo Setup
  → Create email list
  → Add leads to Brevo

Node 3: Copywriter (parallel with Node 4)
  → Write welcome email
  → Write nurture sequences (5 emails)

Node 4: Marketing Agent
  → Design email templates
  → Plan send schedule

Node 5: Analytics Agent
  → Track opens, clicks, conversions
  → Report on pipeline

Output: { leads_generated, emails_sent, conversions, roi }
```

---

## IV. Conditional & Loop Logic (Phase 2)

### Conditional Execution

```json
{
  "id": "check_leads",
  "condition": "{{ lead_gen.output.count > 0 }}",
  "on_false": "skip",
  "message": "No leads found; skipping nurture"
}
```

### Loop / Batch Processing

```json
{
  "id": "email_per_lead",
  "agent": "copywriter",
  "input": { "lead": "{{ item }}" },
  "loop": {
    "over": "{{ lead_gen.output.leads }}",
    "parallel": true,
    "max_workers": 5
  }
}
```

---

## V. State Management & Resumption (Phase 1)

DAG execution is resumable: if a node fails, the DAG can be paused, reviewed, and resumed.

```javascript
// Save checkpoint
checkpoint = {
  dag_id: 'landing_page_build_v1',
  execution_id: 'exec_12345',
  nodes_completed: ['copywriter'],
  nodes_pending: ['frontend', 'deploy'],
  results: { copywriter: {...} },
  timestamp: '2026-08-14T10:30:00Z'
}

// On resume:
dag.resume(execution_id)
  // Skips completed nodes
  // Re-runs pending nodes with saved inputs
  // Continues to completion
```

---

## VI. Cost Tracking Per Workflow

```javascript
workflow_cost = {
  landing_page_build: {
    copywriter: $0.20,
    frontend_developer: $0.50,
    stripe_setup: $0.10,
    brevo_setup: $0.05,
    deploy: $0.00,
    total: $0.85
  },
  lead_gen_100_leads: {
    scraping: $0.20,
    validation: $0.15,
    enrichment: $0.40,
    scoring: $0.10,
    delivery: $0.05,
    total: $0.90
  }
}
```

Each step logs cost to Supabase `transactions` table. DAG executor rolls up total and checks against budget cap.

---

## VII. Integration with Telegram

**Trigger**: User sends message via Telegram  
**Router**: Command Router identifies workflow  
**Execution**: DAG executor runs workflow  
**Callback**: Result sent back to user  
**Monitoring**: User can query status of DAG execution

**Example**:
```
User: "Create a landing page for my fitness app"
Bot: "Starting landing page build... (this may take 30s)"
[DAG executes: copywriter → frontend → deploy]
Bot: "✅ Done! Your page is live: https://fitness-landing-page.vercel.app"
```

---

## VIII. Testing Workflows

### Unit Test (Phase 1)

```javascript
describe('DAG Executor', () => {
  it('should execute linear DAG (A → B → C)', async () => {
    const dag = { nodes, edges }
    const result = await executor.run(dag, inputs)
    assert(result.deploy.live_url)
  })

  it('should handle node failure with fallback', async () => {
    const dag = { nodes, edges, error_handlers }
    const result = await executor.run(dag, inputs)
    assert(result.copywriter.fallback_used)
  })

  it('should execute parallel nodes concurrently', async () => {
    const start = Date.now()
    const result = await executor.run(dag, inputs)
    const elapsed = Date.now() - start
    // Should be faster than sequential
    assert(elapsed < 45000)
  })
})
```

### Integration Test (Phase 1)

```javascript
// Spin up Docker containers for Supabase, Redis
// Execute real landing page build
// Verify: output file, Supabase logs, cost tracking
```

---

## IX. Failure Scenarios & Recovery

| Scenario | Current | Phase 1 |
|----------|---------|---------|
| LLM timeout | Retry 3x, then fail | Retry 3x, fallback, or manual approval |
| Mid-DAG failure | Entire DAG fails | Save checkpoint, allow resume |
| Cost overrun | Block operation | Trigger approval gate |
| Network error | Immediate fail | Retry with exponential backoff |
| Rate limit (API) | Fail silently | Backoff, queue retry |

---

**Next**: See INTEGRATIONS.md for external API details, ENVIRONMENT.md for deployment configs, DATA_MODEL.md for database schema.
