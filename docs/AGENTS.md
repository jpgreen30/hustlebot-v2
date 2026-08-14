# HustleBot v2 - Agent Catalog

**Version**: 0.1 (Phase 0 Audit, 2026-08-14)

The platform coordinates 17 specialized AI agents, each with distinct prompts, model routing, and tool bindings. This catalog describes their current capabilities and Phase 1 registry format.

---

## I. Developer Agents (8)

These agents handle technical build tasks: coding, infrastructure, design.

### 1. Copywriter Agent

**File**: `src/agents/copywriter.js`  
**LLM**: Claude 3.5 Sonnet (complex reasoning)  
**Role**: Headlines, sales copy, email sequences, CTAs

**Capabilities**:
- Generate attention-grabbing headlines (5–10 variants)
- Write sales copy for landing pages, emails, ads
- Create email sequences (welcome, nurture, re-engagement)
- Optimize for conversion (A/B test variants)

**Tool Bindings** (Phase 1):
- `copywriter_generate_headlines` — Input: `{ topic, target_audience, count }` → Output: `[headline_1, ...]`
- `copywriter_write_sales_copy` — Input: `{ product, benefits, tone }` → Output: `{ headline, body, cta }`
- `copywriter_email_sequence` — Input: `{ type, product, count }` → Output: `[email_1, ...]`

**Cost**: ~$0.15–0.50 per task (1–2K output tokens)  
**Speed**: ~5–10s per task  
**Reliability**: ✅ Stable prompts, high quality

---

### 2. Content Writer Agent

**File**: `src/agents/content-writer.js`  
**LLM**: Grok 2 (fast, cheap)  
**Role**: Blog posts, social media, scripts, articles

**Capabilities**:
- Write SEO-optimized blog posts (long-form)
- Create social media posts (platform-specific)
- Write video scripts and presentations
- Repurpose content across formats

**Tool Bindings** (Phase 1):
- `content_write_blog` — Input: `{ topic, keyword, word_count, seo_focus }` → Output: `{ title, body, meta_desc }`
- `content_write_social` — Input: `{ content, platform, tone }` → Output: `{ post_1, post_2, ... }`
- `content_write_script` — Input: `{ topic, length, style }` → Output: `{ script, speaker_notes }`

**Cost**: ~$0.05–0.15 per task (cheaper than Sonnet)  
**Speed**: ~3–5s per task  
**Reliability**: ✅ Good quality, occasional rambling (check output)

---

### 3. Frontend Developer Agent

**File**: `src/agents/frontend-developer.js`  
**LLM**: Claude 3.5 Sonnet  
**Role**: React components, landing pages, responsive UI

**Capabilities**:
- Generate React components (buttons, forms, layouts)
- Build responsive landing pages
- CSS styling (Tailwind, custom)
- UI optimization for mobile/desktop

**Tool Bindings** (Phase 1):
- `frontend_generate_component` — Input: `{ description, framework, style }` → Output: `{ code, preview_url }`
- `frontend_build_landing` — Input: `{ copy, images, layout_style }` → Output: `{ react_code, deploy_url }`
- `frontend_responsive_optimize` — Input: `{ html, devices }` → Output: `{ optimized_html }`

**Cost**: ~$0.30–0.80 per task (2–5K output tokens)  
**Speed**: ~10–15s per task  
**Reliability**: ✅ Stable, handles complex layouts

---

### 4. Backend Developer Agent

**File**: `src/agents/backend-developer.js`  
**LLM**: Claude 3.5 Sonnet  
**Role**: APIs, middleware, authentication, databases

**Capabilities**:
- Design and implement REST/GraphQL APIs
- Middleware and authentication logic
- Database schema design
- Error handling and logging

**Tool Bindings** (Phase 1):
- `backend_design_api` — Input: `{ spec, models }` → Output: `{ api_spec, sample_code }`
- `backend_auth_logic` — Input: `{ strategy, requirements }` → Output: `{ auth_code, middleware }`
- `backend_db_schema` — Input: `{ entities, relationships }` → Output: `{ sql, migration }`

**Cost**: ~$0.30–0.80 per task  
**Speed**: ~10–15s per task  
**Reliability**: ✅ Excellent for schema design

---

### 5. Database Agent

**File**: `src/agents/database-agent.js`  
**LLM**: Claude 3.5 Sonnet  
**Role**: SQL, schema optimization, migrations

**Capabilities**:
- Write complex SQL queries
- Design normalized schemas
- Optimize queries for performance
- Generate migrations

**Tool Bindings** (Phase 1):
- `database_write_query` — Input: `{ requirement, schema }` → Output: `{ sql, explanation }`
- `database_design_schema` — Input: `{ entities, relationships, constraints }` → Output: `{ normalized_schema, sql }`
- `database_optimize_query` — Input: `{ slow_query, schema }` → Output: `{ optimized_query, indexes }`

**Cost**: ~$0.25–0.60 per task  
**Speed**: ~8–12s per task  
**Reliability**: ✅ Accurate SQL generation

---

### 6. DevOps Agent

**File**: `src/agents/devops-agent.js`  
**LLM**: Claude 3.5 Sonnet  
**Role**: Docker, deployment, infrastructure, CI/CD

**Capabilities**:
- Write Dockerfiles and docker-compose configs
- Deploy to Render, Vercel, AWS
- Set up CI/CD pipelines
- Monitor and scale infrastructure

**Tool Bindings** (Phase 1):
- `devops_generate_docker` — Input: `{ app_type, runtime }` → Output: `{ dockerfile, docker_compose }`
- `devops_deploy_to_render` — Input: `{ repo_url, env_vars }` → Output: `{ deploy_url, logs }`
- `devops_ci_pipeline` — Input: `{ repo_type, tests, deploy_target }` → Output: `{ workflow_yaml }`

**Cost**: ~$0.25–0.60 per task  
**Speed**: ~8–12s per task  
**Reliability**: ✅ Good for Docker/infrastructure

---

### 7. Landing Page Agent (Tool Factory)

**File**: `src/tools/landing-page-factory.js`  
**LLM**: Orchestrates Copywriter + Frontend Developer  
**Role**: End-to-end landing page pipeline

**Capabilities**:
- Copy generation (headline + body + CTA)
- React component generation
- Stripe payment integration
- Email capture with Brevo
- Deploy to Vercel

**Tool Bindings** (Phase 1):
- `landing_page_build` — Input: `{ topic, target_audience }` → Output: `{ live_url, copy, metrics }`

**Cost**: ~$2–5 per page (Copywriter + Frontend + Stripe + Brevo + Deploy)  
**Speed**: ~30–60s end-to-end  
**Reliability**: ✅ Multi-service orchestration

---

### 8. Product Agent

**File**: `src/agents/specialized-agents.js` (part of)  
**LLM**: Claude 3.5 Sonnet  
**Role**: Feature strategy, roadmap, product positioning

**Capabilities**:
- Define features and priorities
- Write product specifications
- Design customer journey
- Analyze competitive landscape

**Tool Bindings** (Phase 1):
- `product_spec` — Input: `{ idea, target_market }` → Output: `{ spec, roadmap }`
- `product_positioning` — Input: `{ features, competitors }` → Output: `{ positioning, messaging }`

**Cost**: ~$0.30–0.80 per task  
**Speed**: ~10–15s per task  
**Reliability**: ✅ Strategic thinking

---

## II. Strategy Agents (9)

These agents handle business-level decisions: marketing, sales, finance, operations.

### 9. Marketing Agent

**File**: `src/agents/specialized-agents.js`  
**LLM**: Claude 3.5 Sonnet (or Grok 2 for speed)  
**Role**: Growth strategies, campaigns, positioning

**Capabilities**:
- Design marketing campaigns
- Create content calendars
- Position products in market
- Analyze target audiences

**Tool Bindings** (Phase 1):
- `marketing_campaign_plan` — Input: `{ product, audience, budget, timeline }` → Output: `{ campaign_plan, channels }`
- `marketing_content_calendar` — Input: `{ niche, weeks, channels }` → Output: `{ calendar, content_ideas }`

**Cost**: ~$0.30–0.80 per task  
**Speed**: ~10–15s per task  
**Reliability**: ✅ Good strategic thinking

---

### 10. Sales Agent

**File**: `src/agents/specialized-agents.js`  
**LLM**: Grok 2  
**Role**: Sales tactics, closing scripts, objection handling

**Capabilities**:
- Write sales pitches and scripts
- Handle objections
- Design sales funnels
- Create proposal templates

**Tool Bindings** (Phase 1):
- `sales_pitch_script` — Input: `{ product, prospect_type }` → Output: `{ pitch_script, talking_points }`
- `sales_objection_handling` — Input: `{ objection }` → Output: `{ response, strategy }`

**Cost**: ~$0.05–0.15 per task (Grok 2 is cheap)  
**Speed**: ~3–5s per task  
**Reliability**: ✅ Fast and practical

---

### 11. Finance Agent

**File**: `src/agents/specialized-agents.js`  
**LLM**: Claude 3.5 Sonnet  
**Role**: Unit economics, pricing, burn rate analysis

**Capabilities**:
- Calculate unit economics
- Design pricing models
- Project burn rate
- Analyze profitability

**Tool Bindings** (Phase 1):
- `finance_unit_economics` — Input: `{ revenue, costs }` → Output: `{ cac, ltv, payback_period }`
- `finance_pricing_model` — Input: `{ costs, market, positioning }` → Output: `{ pricing_tiers, forecast }`

**Cost**: ~$0.30–0.80 per task  
**Speed**: ~10–15s per task  
**Reliability**: ✅ Accurate financial modeling

---

### 12. Analytics Agent

**File**: `src/agents/specialized-agents.js`  
**LLM**: Claude 3.5 Sonnet (or Llama 3.1 for cost)  
**Role**: Metrics definition, attribution, forecasting

**Capabilities**:
- Define KPIs and dashboards
- Attribute revenue to channels
- Forecast growth
- Analyze cohort behavior

**Tool Bindings** (Phase 1):
- `analytics_kpi_definition` — Input: `{ business_model }` → Output: `{ kpis, dashboard_spec }`
- `analytics_attribution_model` — Input: `{ touchpoints, revenue }` → Output: `{ attribution, channel_roi }`

**Cost**: ~$0.30–0.80 per task  
**Speed**: ~10–15s per task  
**Reliability**: ✅ Good quantitative analysis

---

### 13. Ideation Agent

**File**: `src/agents/specialized-agents.js`  
**LLM**: Grok 2 (creative, trendy)  
**Role**: Brainstorming, market research, competitor analysis

**Capabilities**:
- Brainstorm product ideas
- Research markets and trends
- Analyze competitors
- Identify opportunities

**Tool Bindings** (Phase 1):
- `ideation_brainstorm` — Input: `{ problem, constraints }` → Output: `{ ideas, score }`
- `ideation_market_research` — Input: `{ niche }` → Output: `{ market_size, trends, gaps }`

**Cost**: ~$0.05–0.15 per task  
**Speed**: ~3–5s per task  
**Reliability**: ✅ Creative, sometimes wild (filter results)

---

### 14. Video Agent

**File**: `src/agents/specialized-agents.js`  
**LLM**: Grok 2  
**Role**: Video scripts, production strategy, editing

**Capabilities**:
- Write video scripts (YouTube, TikTok, Instagram)
- Plan video series
- Optimize for platform
- Design production workflows

**Tool Bindings** (Phase 1):
- `video_script_write` — Input: `{ topic, platform, length }` → Output: `{ script, shots, cues }`
- `video_series_plan` — Input: `{ theme, episodes }` → Output: `{ episode_plan, production_timeline }`

**Cost**: ~$0.05–0.15 per task  
**Speed**: ~3–5s per task  
**Reliability**: ✅ Good for short-form scripts

---

### 15. Social Media Agent

**File**: `src/agents/specialized-agents.js`  
**LLM**: Grok 2 (trendy, fast)  
**Role**: Platform-specific strategies, posting strategies

**Capabilities**:
- Design platform-specific strategies
- Write posts optimized per platform
- Plan social calendars
- Suggest hashtags and timing

**Tool Bindings** (Phase 1):
- `social_strategy` — Input: `{ audience, platforms }` → Output: `{ strategy, posting_schedule }`
- `social_post_write` — Input: `{ content, platform, tone }` → Output: `{ post, hashtags, timing }`

**Cost**: ~$0.05–0.15 per task  
**Speed**: ~3–5s per task  
**Reliability**: ✅ Fast, trend-aware

---

### 16. Security/QA Agent

**File**: `src/agents/specialized-agents.js`  
**LLM**: Claude 3.5 Sonnet  
**Role**: Testing, security audit, quality gates

**Capabilities**:
- Write test cases and test plans
- Audit code for security vulnerabilities
- Design QA workflows
- Suggest quality improvements

**Tool Bindings** (Phase 1):
- `qa_test_plan` — Input: `{ feature, acceptance_criteria }` → Output: `{ test_cases, scenarios }`
- `security_audit` — Input: `{ code, framework }` → Output: `{ vulnerabilities, severity, fixes }`

**Cost**: ~$0.30–0.80 per task  
**Speed**: ~10–15s per task  
**Reliability**: ✅ Thorough security analysis

---

### 17. E-commerce Agent

**File**: `src/agents/specialized-agents.js`  
**LLM**: Claude 3.5 Sonnet  
**Role**: Store setup, product import, upsell sequences

**Capabilities**:
- Design e-commerce stores (Shopify, WooCommerce)
- Import and optimize product listings
- Create upsell/cross-sell sequences
- Optimize checkout flow

**Tool Bindings** (Phase 1):
- `ecom_store_setup` — Input: `{ store_type, products }` → Output: `{ store_url, setup_checklist }`
- `ecom_product_import` — Input: `{ csv_data, store_type }` → Output: `{ imported_count, optimization_suggestions }`
- `ecom_upsell_sequence` — Input: `{ product_id, catalog }` → Output: `{ upsell_rules, email_sequence }`

**Cost**: ~$0.30–0.80 per task  
**Speed**: ~10–15s per task  
**Reliability**: ✅ E-commerce domain knowledge

---

## III. Phase 1: Registry Format (Not Yet Implemented)

Each agent will be registered in a capability registry with this schema:

```json
{
  "id": "copywriter_v1",
  "name": "Copywriter Agent",
  "version": "1.0.0",
  "llm": {
    "provider": "openrouter",
    "model": "anthropic/claude-3.5-sonnet",
    "cost_input": 0.003,
    "cost_output": 0.015,
    "speed": "medium"
  },
  "tools": [
    {
      "name": "copywriter_generate_headlines",
      "description": "Generate attention-grabbing headlines",
      "input_schema": {
        "type": "object",
        "properties": {
          "topic": { "type": "string" },
          "target_audience": { "type": "string" },
          "count": { "type": "integer", "default": 5 }
        },
        "required": ["topic"]
      },
      "output_schema": {
        "type": "array",
        "items": { "type": "string" }
      },
      "cost_per_call": 0.15
    }
  ],
  "constraints": {
    "max_tokens": 2000,
    "temperature": 0.7,
    "rate_limit": "10 calls/min",
    "cost_cap": "$0.50 per call"
  },
  "status": "stable",
  "last_updated": "2026-08-14"
}
```

---

## IV. Scaling & Multi-Agent Workflows

### Multi-Agent Choreography Example: Landing Page Build

```
User Input: "Create a landing page for my fitness app"
     ↓
Command Router: intent = "landing_page_build"
     ↓
LandingPageFactory orchestrates:
  1. CopywriterAgent.execute() → Headline + sales copy
  2. FrontendDeveloperAgent.execute() → React component
  3. StripeSetup.execute() → Payment button
  4. BrevoSetup.execute() → Email capture
  5. VercelDeploy.execute() → Deploy live
     ↓
Result: Live URL + metrics
```

**Phase 1 Upgrade**: This sequence becomes a **Planning DAG**:
```
Nodes: [copywriter, frontend, stripe, brevo, deploy]
Edges: copywriter → frontend → stripe → brevo → deploy
Executor: Traverses DAG, routes each node to agent, passes output to next
Mailbox: Each agent polls inbox for input, pushes result to next agent's inbox
```

---

## V. Cost Summary (Phase 0)

| Agent | LLM Model | Cost/Call | Typical Use |
|-------|-----------|-----------|------------|
| Copywriter | Claude 3.5 Sonnet | ~$0.20 | Headlines, copy |
| Content Writer | Grok 2 | ~$0.08 | Blog, social |
| Frontend Dev | Claude 3.5 Sonnet | ~$0.50 | React component |
| Backend Dev | Claude 3.5 Sonnet | ~$0.50 | API design |
| Database | Claude 3.5 Sonnet | ~$0.40 | SQL, schema |
| DevOps | Claude 3.5 Sonnet | ~$0.40 | Docker, deploy |
| Landing Page (factory) | Mixed | ~$3.00 | Full pipeline |
| Lead Gen (factory) | Mixed | ~$1.00 | Per 100 leads |
| Marketing | Claude 3.5 Sonnet | ~$0.50 | Campaign plan |
| Sales | Grok 2 | ~$0.10 | Sales scripts |
| Finance | Claude 3.5 Sonnet | ~$0.50 | Unit economics |
| Analytics | Claude 3.5 Sonnet | ~$0.50 | KPI, forecast |
| Ideation | Grok 2 | ~$0.10 | Brainstorm |
| Video | Grok 2 | ~$0.10 | Video scripts |
| Social Media | Grok 2 | ~$0.10 | Social posts |
| Security/QA | Claude 3.5 Sonnet | ~$0.50 | Test plans, audit |
| E-commerce | Claude 3.5 Sonnet | ~$0.50 | Store setup |

**Monthly Budget**: $100 (hard cap in budget-controller.js)  
**Typical Cost per Project**: $5–20 (depending on feature depth)

---

**Next**: See WORKFLOWS.md for multi-step recipes, INTEGRATIONS.md for API details, ENVIRONMENT.md for config.
