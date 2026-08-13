# HustleBot v2 Phase 2 - Quick Start

## What's Built ✅

**17 Specialized AI Agents** working in coordinated swarms:

### Core Agents
- **Copywriter** - Headlines, landing pages, sales copy (Claude 3.5)
- **Content Writer** - Blogs, social posts, email sequences (Grok 2)  
- **Frontend Developer** - React components, landing pages (Claude 3.5)
- **Backend Developer** - APIs, auth, middleware (Claude 3.5)
- **Database Agent** - Schema design, migrations, SQL (Claude 3.5)
- **DevOps Agent** - Docker, deployments, infrastructure (Claude 3.5)

### Strategy Agents
- **Landing Page** - Conversion optimization
- **Product** - Feature prioritization, roadmap
- **Marketing** - Growth strategies, campaigns
- **Sales** - Sales tactics, objection handling
- **Finance** - Unit economics, pricing
- **Analytics** - Metrics, attribution, forecasting
- **Ideation** - Market research, brainstorming
- **Video** - Scripts, strategies, production
- **Social Media** - Platform-specific strategies

### Factory Tools (Partially Built)
- **Landing Page Factory** - Complete landing page generation
- **Lead Gen Factory** - Full lead pipeline

---

## Installation

```bash
cd /home/claude/hustlebot-v2

# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Edit .env and add your API keys:
OPENROUTER_API_KEY=xxx
SUPABASE_URL=xxx
SUPABASE_KEY=xxx
TELEGRAM_BOT_TOKEN=xxx
```

---

## Database Setup

```bash
# Create tables in Supabase
npm run db:migrate

# Or manually run SQL from scripts/migrate.js
```

---

## Start the Bot

```bash
# Development
npm run dev

# Production
npm start
```

Bot will start on `localhost:3000` with Telegram webhook polling.

---

## Test Agents via Telegram

Send messages to your Telegram bot:

```
/start

"Help me write a headline for my SaaS product"
→ Copywriter Agent generates 5 headlines

"Build me a React landing page for a fitness app"
→ Frontend Developer Agent generates code

"Generate 50 qualified leads in California"
→ Lead Gen Factory runs full pipeline

"Create a 30-day content calendar for fitness"
→ Content Writer generates blog topics

"Analyze our unit economics: $50 COGS, $300 price"
→ Finance Agent calculates margins & ROI
```

---

## Test Individual Agents

```javascript
// test-agents.js
import { CopywriterAgent } from './src/agents/copywriter.js';
import { initOpenRouter } from './src/llm/openrouter.js';
import { initSupabase } from './src/db/supabase.js';
import { BudgetController } from './src/core/budget-controller.js';

const llm = initOpenRouter();
const db = await initSupabase();
const budget = new BudgetController(db, 100);

const copywriter = new CopywriterAgent(db, llm, budget);

const result = await copywriter.execute({
  topic: 'Fitness App',
  style: 'benefit',
  quantity: 5
});

console.log('Result:', result);
```

```bash
node test-agents.js
```

---

## Command Examples

Try these Telegram commands:

### Copywriting
```
@copywriter Generate headlines for: "Personal finance app for Gen Z"
@copywriter Generate sales page copy for: "AI chatbot for customer service"
```

### Content Creation
```
@content_writer Generate 5 Twitter posts about: "Remote work trends"
@content_writer Generate welcome email sequence for: "SaaS productivity tool"
```

### Development
```
@frontend Generate React component: "Product pricing table with 3 tiers"
@backend Generate API endpoint: "GET /api/users/:id to fetch user profile"
```

### Strategy
```
@product Product strategy for: "Market: B2B SaaS, Problem: Sales team productivity"
@marketing Marketing strategy for: "Budget: $5000, Target: SMB entrepreneurs"
```

### Analytics
```
@finance Unit economics: "COGS: $100, Price: $500, Acquisition cost: $50"
@analytics Analyze metrics: "Visitors: 10k, Conversions: 500, Revenue: $250k"
```

---

## Check Agent Status

```
/status

Shows:
- All agents initialized
- Tools available
- Total cost so far
- Budget remaining
```

---

## Next Phase

Phase 3: Tool Factories

Run this to continue build:

```bash
# Choose next phase
/phase3

This will generate:
- Content Factory (blog, social, email)
- Image Factory (Replicate API)
- E-commerce Factory (Shopify)
- Integration Factory (all APIs)
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Telegram Bot (Telegraf)                            │
│  - Command parsing, voice transcription (Deepgram) │
└────────────────┬────────────────────────────────────┘
                 │
        ┌────────▼─────────┐
        │ Command Router   │
        │ (NLU parsing)    │
        └────────┬─────────┘
                 │
   ┌─────────────▼─────────────┐
   │  Agent Orchestrator       │
   │  (Swarm Coordination)     │
   └─┬───────────────────────┬─┘
     │                       │
  ┌──▼──────┐          ┌────▼──────┐
  │ Agents  │          │ Factories  │
  │ (17)    │          │ (tools)    │
  └──┬──────┘          └────┬──────┘
     │                      │
  ┌──▼───────────────────┬──▼──────────┐
  │   LLM (OpenRouter)   │ External    │
  │   Smart routing      │ APIs        │
  │   Claude/Grok/Llama  │ (Stripe,    │
  │                      │  Brevo,     │
  │                      │  Vercel)    │
  └────────┬─────────────┴────────┬────┘
           │                      │
        ┌──▼──────────────────────▼───┐
        │  Database (Supabase/PG)     │
        │  Users, Projects, Leads,    │
        │  Transactions, Agent Logs   │
        └──────────────────────────────┘
```

---

## Cost Breakdown

Per operation (approximate):

| Operation | Cost |
|-----------|------|
| Copywriting (5 headlines) | $0.02 |
| Blog post generation | $0.05 |
| React component | $0.08 |
| Lead generation (50 leads) | $0.25 |
| Landing page build | $0.15 |
| **Monthly budget** | **$100** |

---

## Files Structure

```
hustlebot-v2/
├── src/
│   ├── agents/
│   │   ├── base-agent.js          (foundation)
│   │   ├── llm-agent.js           (LLM-powered)
│   │   ├── copywriter.js          (copywriting)
│   │   ├── content-writer.js      (volume content)
│   │   ├── frontend-developer.js  (React code)
│   │   ├── backend-developer.js   (APIs)
│   │   ├── database-agent.js      (SQL/schema)
│   │   ├── devops-agent.js        (deployment)
│   │   ├── specialized-agents.js  (9 more agents)
│   │   ├── orchestrator.js        (coordination)
│   │   └── agents.test.js         (tests)
│   │
│   ├── tools/
│   │   ├── landing-page-factory.js   ✅ Complete
│   │   ├── lead-gen-factory.js       ✅ Complete
│   │   └── [TODO: other factories]
│   │
│   ├── server.js                 (main entry)
│   ├── telegram/handler.js       (Telegram commands)
│   ├── core/
│   │   ├── command-router.js    (NLU)
│   │   └── budget-controller.js (spend limits)
│   ├── llm/
│   │   └── openrouter.js        (LLM API)
│   ├── db/
│   │   └── supabase.js          (database)
│   └── utils/
│       └── logger.js            (logging)
│
├── scripts/
│   └── migrate.js               (DB setup)
│
├── .env.example
├── README.md
├── SETUP.md
├── PHASE2-QUICKSTART.md         ← You are here
├── PHASE3-5-IMPLEMENTATION.md
└── package.json
```

---

## Troubleshooting

**"Agent not found"**
- Check orchestrator initialization in server.js
- Verify all agent files imported correctly

**"LLM call failed"**
- Verify OPENROUTER_API_KEY in .env
- Check API key has credits

**"Database error"**
- Verify Supabase connection string
- Run migrations: `npm run db:migrate`

**"Budget exceeded"**
- Set higher limit in .env: `MONTHLY_BUDGET=200`
- Or optimize by using cheaper models (Grok 2, Llama)

---

## Monitor Spending

```
/budget        → Current spend & alerts
/status        → All agent stats
/projects      → Your projects & costs
```

---

## Next: Build Phase 3

When ready to add tool factories and integrations:

1. Edit `PHASE3-5-IMPLEMENTATION.md` for detailed specs
2. Create Content Factory
3. Create Image Factory
4. Add external API integrations
5. Build analytics dashboard
6. Deploy enhanced version

---

## Support

Issues? Check:
- `README.md` - Full documentation
- `SETUP.md` - Deployment guide
- Source code comments
- Agent test files for usage examples

---

**Status**: Phase 2 Complete ✅
**Last Updated**: 2026-08-12
**Next**: Phase 3 Tool Factories (25-30 hours)
