# HustleBot v2 - Phases 3-5 Implementation Guide

## STATUS: PHASE 2 COMPLETE ✅

### Phase 2: Agent Framework ✅ DONE
- [x] BaseAgent class
- [x] LLMAgent class  
- [x] 15 Specialized agents (copywriter, developer, marketer, etc.)
- [x] Agent orchestrator with registration
- [x] Test suite for all agents

**Cost**: ~$2-5 to build (all LLM calls)

---

## PHASE 3: TOOL FACTORIES (20-25 hours)

### Partially Complete ✅
- [x] **Landing Page Factory** (`src/tools/landing-page-factory.js`)
  - Copy generation via Copywriter Agent
  - React component generation via Frontend Developer Agent
  - Stripe integration
  - Email capture with Brevo
  - Welcome email sequences
  - Vercel deployment
  - Analytics setup

- [x] **Lead Gen Factory** (`src/tools/lead-gen-factory.js`)
  - Web scraping (Firecrawl/Playwright)
  - Email validation
  - Company enrichment (Clearbit API)
  - ICP scoring
  - Deduplication
  - Multi-channel delivery (webhook, email, CRM)

### TO BUILD (Remaining)

#### Content Factory
```javascript
// src/tools/content-factory.js
class ContentFactory {
  async generateBlogPost(topic, keyword, wordCount) {
    // Uses ContentWriterAgent
    // Returns SEO-optimized blog post
  }
  
  async generateSocialPosts(content, platform, quantity) {
    // Multi-platform social media posts
  }
  
  async generateEmailSequence(type, product) {
    // Welcome, nurture, sales, reactivation sequences
  }
  
  async generateContentCalendar(niche, weeks) {
    // 30-day content plan with topics & dates
  }
}
```

#### Image Factory
```javascript
// src/tools/image-factory.js
class ImageFactory {
  async generateProductPhotos(description) {
    // Uses Replicate API for Stable Diffusion
  }
  
  async generateSocialImages(dimensions, style) {
    // Generate for each social platform
  }
  
  async generateInfographics(data, topic) {
    // SVG/PNG infographics from data
  }
  
  async optimizeForPlatform(image, platform) {
    // Crop/resize for optimal display
  }
}
```

#### E-commerce Factory
```javascript
// src/tools/ecommerce-factory.js
class EcommerceFactory {
  async createShopifyStore(name, products) {
    // Shopify store setup + product import
  }
  
  async setupPaymentProcessing(stripe_key) {
    // Stripe integration + webhooks
  }
  
  async setupUpsellSequence(product_id) {
    // Post-purchase email automation
  }
}
```

#### Integration Factory
```javascript
// src/tools/integration-factory.js
class IntegrationFactory {
  async sendEmail(to, subject, html) {
    // Brevo API
  }
  
  async chargeCard(email, amount) {
    // Stripe payment
  }
  
  async deployToVercel(code, domain) {
    // Vercel deployment API
  }
  
  async postToSocial(content, platforms) {
    // Postiz API for multi-platform posting
  }
}
```

---

## PHASE 4: EXTERNAL INTEGRATIONS (15-20 hours)

Create integration adapters for all 3rd party APIs:

```javascript
// src/integrations/stripe.js
export async function createCheckoutSession(product, price) { }
export async function handleWebhook(event) { }
export async function createSubscription(customer, plan) { }

// src/integrations/brevo.js
export async function sendEmail(to, subject, html) { }
export async function addContact(email, properties) { }
export async function triggerAutomation(email, trigger) { }

// src/integrations/vercel.js
export async function deployProject(repo, domain) { }
export async function setEnvironmentVariables(vars) { }

// src/integrations/replicate.js
export async function generateImage(prompt, model) { }

// src/integrations/shopify.js
export async function createStore(storeName) { }
export async function importProducts(csv) { }

// src/integrations/postiz.js
export async function schedulePost(content, platforms, date) { }
```

---

## PHASE 5: ADVANCED FEATURES (25-30 hours)

### Scheduling Engine
```javascript
// src/features/scheduling.js
class SchedulingEngine {
  async scheduleCommand(command, cronExpression) {
    // Recurring tasks via n8n webhooks
  }
  
  async pauseSchedule(id) { }
  async resumeSchedule(id) { }
  async listSchedules() { }
}
```

### Analytics & Attribution
```javascript
// src/features/analytics.js
class AnalyticsEngine {
  async trackConversion(userId, event, value) { }
  async attributeRevenue(userId, sources) { }
  async generateReport(startDate, endDate) { }
  async forecastRevenue(historyDays) { }
}
```

### Dashboard
```javascript
// src/features/dashboard.js
// HTML dashboard with:
// - Project overview
// - Spend breakdown  
// - Lead/revenue metrics
// - Real-time updates
```

### Memory/Learning System
```javascript
// src/features/memory.js
// Mem0 integration to store:
// - Learnings from each project
// - Patterns that work
// - Playbooks for future projects
```

### Cost Optimization
```javascript
// src/features/optimization.js
class CostOptimizer {
  async recommendOptimizations() {
    // Analyze spend patterns
    // Suggest cheaper models
    // Batch operations
    // Cache results
  }
}
```

### API Endpoints
```javascript
// src/api-endpoints.js
GET /api/status/:projectId         // Project status
POST /api/projects                 // Create project
GET /api/leads/:projectId          // List leads
POST /api/spend/track              // Track spending
GET /api/dashboard                 // Full dashboard
POST /api/schedule                 // Create schedule
GET /api/reports/:projectId        // Generate report
```

---

## IMPLEMENTATION CHECKLIST

### Phase 3: Tool Factories
- [ ] Content Factory (blog, social, email, calendar)
- [ ] Image Factory (Replicate integration)
- [ ] E-commerce Factory (Shopify integration)
- [ ] Integration Factory (wrapper for all APIs)
- [ ] Test suite for all factories

### Phase 4: External Integrations
- [ ] Stripe payment processing
- [ ] Brevo email API
- [ ] Vercel deployment API
- [ ] Replicate image generation
- [ ] Shopify store API
- [ ] Postiz social scheduling
- [ ] Firecrawl web scraping
- [ ] Clearbit company enrichment

### Phase 5: Advanced Features
- [ ] Scheduling engine (n8n integration)
- [ ] Analytics & attribution tracking
- [ ] Dashboard UI (HTML artifact)
- [ ] Memory system (Mem0 integration)
- [ ] Cost optimization engine
- [ ] API endpoints (Express routes)

---

## COST ESTIMATES

| Operation | Time | Cost |
|-----------|------|------|
| Landing page build | 5 min | $0.15 |
| Lead generation (50) | 10 min | $0.25 |
| Blog post (1) | 3 min | $0.05 |
| E-commerce setup (50 products) | 15 min | $0.35 |
| Social posts (10) | 2 min | $0.02 |

**Total monthly budget**: $100 (hard cap)

---

## DEPLOYMENT

After completing all phases:

```bash
# 1. Set environment variables
cp .env.example .env
# Fill in all API keys

# 2. Run migrations
npm run db:migrate

# 3. Deploy to Render
git push heroku main

# 4. Test via Telegram
/start
"Build me a landing page with Stripe for my product"

# 5. Monitor costs
/status
/budget
```

---

## NEXT STEPS

1. **Complete Phase 3**: Implement remaining factories
2. **Build Phase 4**: Create all integration adapters
3. **Build Phase 5**: Add scheduling, analytics, dashboard
4. **Test end-to-end**: Full workflow testing
5. **Deploy**: Push to Render with all features
6. **Monitor**: Track costs and optimize

---

## FILES TO CREATE

```
src/
├── tools/
│   ├── landing-page-factory.js ✅
│   ├── lead-gen-factory.js ✅
│   ├── content-factory.js
│   ├── image-factory.js
│   ├── ecommerce-factory.js
│   ├── integration-factory.js
│   └── utils/
│       ├── api-caller.js
│       ├── prompt-templates.js
│       └── output-parsers.js
│
├── integrations/
│   ├── stripe.js
│   ├── brevo.js
│   ├── vercel.js
│   ├── replicate.js
│   ├── shopify.js
│   ├── postiz.js
│   ├── firecrawl.js
│   └── clearbit.js
│
└── features/
    ├── scheduling.js
    ├── analytics.js
    ├── dashboard.js
    ├── memory.js
    ├── optimization.js
    └── api-endpoints.js
```

---

## TESTING STRATEGY

Each factory/integration needs:
- Unit tests (mock APIs)
- Integration tests (real APIs in sandbox)
- End-to-end tests (full workflow)
- Cost verification
- Error handling

---

## ESTIMATED COMPLETION

- **Phase 3**: 25-30 hours
- **Phase 4**: 18-22 hours
- **Phase 5**: 30-35 hours
- **Testing & Deployment**: 10-15 hours

**Total remaining**: ~85-100 hours

---

Generated: 2026-08-12
Status: Ready for implementation
