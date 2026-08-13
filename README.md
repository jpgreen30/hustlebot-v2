# HustleBot v2 🚀

**AI-Powered Business Automation Platform**

Build landing pages, generate leads, create e-commerce stores, and produce content entirely through natural language commands—all with smart cost optimization.

---

## **🎯 What It Does**

### **5 Core Capabilities**

1. **🏗️ Landing Page Builder** - React components, Stripe integration, email capture, deployed to Vercel
2. **🔍 Lead Generation** - Web scraping, enrichment, validation, scoring, delivery to your CRM
3. **🛒 E-Commerce Builder** - Shopify store setup, product import, automation, fulfillment
4. **📝 Content Creation** - Blog posts, social media, email sequences, video scripts
5. **📊 Analytics & Reporting** - Track ROI, conversions, spending by service

### **Key Features**

- ✅ **Natural Language Commands** - Just tell it what you want
- ✅ **Speech-to-Text** - Send voice messages (Deepgram)
- ✅ **Smart LLM Routing** - Uses cheapest model for task (Claude, Grok, Llama, etc)
- ✅ **Budget Controls** - Hard $100/month cap with spending alerts
- ✅ **Multi-Agent Swarms** - 13+ specialized agents work in parallel
- ✅ **Real-time Updates** - Get Telegram alerts + audio responses
- ✅ **Cost Tracking** - See breakdown by service (LLM, images, scraping, APIs)

---

## **📦 Installation & Setup**

### **Prerequisites**

- Node.js 18+
- Render account (free tier works)
- Supabase account (free tier)
- Telegram bot token (free via BotFather)
- API keys: OpenRouter, Deepgram, ElevenLabs, Replicate, Firecrawl

### **Step 1: Clone & Install**

```bash
git clone <repo>
cd hustlebot-v2
npm install
```

### **Step 2: Environment Setup**

```bash
cp .env.example .env
# Fill in all API keys and credentials
```

**Required API Keys:**
- `TELEGRAM_BOT_TOKEN` - Get from @BotFather on Telegram
- `OPENROUTER_API_KEY` - openrouter.ai
- `SUPABASE_URL` & `SUPABASE_KEY` - supabase.com
- `DEEPGRAM_API_KEY` - deepgram.com (voice transcription)
- `ELEVENLABS_API_KEY` - elevenlabs.io (text-to-speech)
- `REPLICATE_API_TOKEN` - replicate.com (image generation)
- `STRIPE_SECRET_KEY` - stripe.com
- `BREVO_API_KEY` - brevo.com (email)

### **Step 3: Database Setup**

Create Supabase tables:

```bash
npm run db:migrate
```

This creates:
- `users` - Telegram users + budgets
- `projects` - Landing pages, lead gen campaigns, etc
- `leads` - Enriched lead data
- `transactions` - Cost tracking
- `agent_logs` - Execution history
- `memory` - Mem0 learnings

### **Step 4: Deploy to Render**

```bash
# Create new Web Service on render.com
# Connect your GitHub repo
# Add environment variables from .env
# Deploy!
```

### **Step 5: Start Local Development**

```bash
npm run dev
```

Server runs on `http://localhost:3000`

---

## **🤖 How to Use**

### **Start the Bot**

Send `/start` to your bot on Telegram

### **Command Examples**

#### **Landing Page**
```
Build me a personal loan landing page with Stripe and email capture, deploy it
```

Output:
- ✅ React component generated
- ✅ Deployed to custom Vercel URL
- ✅ Stripe payment button active
- ✅ Email list connected
- 💰 Cost: ~$15

#### **Lead Generation**
```
Get 50 qualified personal loan leads in California, max budget $20, send to xyz.com
```

Output:
- ✅ 50 leads scraped + enriched
- ✅ Quality scored (0-100)
- ✅ Sent to your webhook
- 💰 Cost: ~$18

#### **E-Commerce Store**
```
Build me a dropshipping store with 50 phone case products, Stripe payments, email sequences
```

Output:
- ✅ Shopify store created
- ✅ 50 products with images
- ✅ Payment processing active
- ✅ 5-email welcome sequence
- 💰 Cost: ~$40

#### **Content Creation**
```
Write 5 SEO blog posts about personal finance, each 2000+ words, optimize for search
```

Output:
- ✅ 5 blog posts (2000+ words each)
- ✅ SEO optimized (keywords, headers, links)
- ✅ Ready for WordPress/Webflow
- 💰 Cost: ~$8

#### **Video/Social**
```
Generate 20 TikTok videos about cryptocurrency trading, 15-30 seconds each
```

Output:
- ✅ 20 TikTok-length videos
- ✅ Scripts + voiceover
- ✅ Posted to TikTok
- 💰 Cost: ~$15

### **Budget Management**

Check spending:
```
/budget
```

Response:
```
💰 Budget Report
Monthly: $100
Spent: $65 (65%)
Remaining: $35

Breakdown:
• OpenRouter LLM: $20 (31%)
• Image Generation: $20 (31%)
• Web Scraping: $15 (23%)
• APIs & Delivery: $10 (15%)

Status: CAUTION - 65% used
```

Increase budget:
```
Set my budget to $300/month
```

### **View Projects**

```
/projects
```

Lists all landing pages, campaigns, stores, etc.

---

## **💰 Pricing Breakdown ($100/Month)**

| Service | Cost | Usage | Best For |
|---------|------|-------|----------|
| **OpenRouter LLM** | $40 | 10M tokens | Complex reasoning, coding |
| **Image Generation** | $30 | 150 images | Product photos + social |
| **Web Scraping** | $20 | 500 URLs | Lead generation |
| **APIs** | $10 | Email, storage, etc | Infrastructure |
| **TOTAL** | **$100** | - | 1-2 full projects/month |

### **Cost Optimization (Auto-Enabled at 75% Budget)**

When you hit 75% of budget:
- ✅ Switch to Grok (10x cheaper LLM)
- ✅ Use Replicate instead of Midjourney for images
- ✅ Batch operations together
- ✅ Cache results aggressively
- ✅ Disable premium features

---

## **🏗️ Architecture**

### **Core Layers**

```
Telegram (Input)
    ↓
Command Router (Parse intent)
    ↓
Budget Controller (Check limits)
    ↓
Agent Orchestrator (Spawn swarms)
    ↓
13+ Specialized Agents (Execute)
    ↓
Factories & Tools (Generation)
    ↓
External APIs (OpenRouter, Replicate, etc)
    ↓
Telegram (Output + TTS)
```

### **13 Agent Types**

**Strategy Tier:**
- Ideation Agent - Market research
- Finance Agent - Unit economics
- Analytics Agent - Performance tracking

**Product Tier:**
- Product Agent - Core offering design
- E-Commerce Agent - Store setup
- Landing Page Agent - High-converting pages

**Content Tier:**
- Content Agent - Blog/SEO
- Video Agent - Scripts & production
- Social Media Agent - Posts & scheduling
- Podcast Agent - Audio production

**Acquisition Tier:**
- Marketing Agent - Demand generation
- Sales Agent - Funnel conversion

**Specialized Tier:**
- Frontend Dev - React/Vercel
- Backend Dev - APIs/Render
- Database Agent - Schema design
- DevOps Agent - Deployment
- Security/QA - Testing & audits

### **60+ MCP Tools**

Available across all agents:
- Command parsing & routing
- Landing page generation
- Coding (React, Next.js, APIs)
- Image generation (Replicate, Midjourney)
- Lead scraping & enrichment
- Content generation
- Email automation
- E-commerce integration
- Analytics & tracking
- Cost tracking & optimization
- Memory & learnings

---

## **📊 Monitoring & Debugging**

### **View Logs**

```bash
tail -f logs/combined.log
tail -f logs/error.log
```

### **Check Server Health**

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "uptime": 3600,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### **Database**

Access Supabase dashboard:
- View all tables
- Check projects, transactions, leads
- Query analytics

### **Cost Tracking**

```bash
# Get spend by service this month
SELECT service, SUM(amount) as total 
FROM transactions 
WHERE DATE(created_at) >= DATE_TRUNC('month', now())
GROUP BY service;
```

---

## **🚀 Deployment**

### **To Render (Recommended)**

1. Push to GitHub
2. Create new Web Service on render.com
3. Connect repo
4. Add env vars from .env
5. Deploy!

Server auto-starts: `npm start`

### **To Heroku**

```bash
heroku create hustlebot
git push heroku main
```

### **Local Development**

```bash
npm run dev
```

Runs on `http://localhost:3000` with hot reload

---

## **🔧 Customization**

### **Add New Agent**

1. Create `src/agents/my-agent.js`
2. Implement `execute(input)` method
3. Register in orchestrator:

```javascript
const myAgent = new MyAgent(db, llm);
orchestrator.registerAgent('my_agent', myAgent);
```

### **Add New Tool**

1. Add to relevant agent
2. Register via `getTools()` method
3. Implement `execute(args)` logic

### **Change Budget**

Update in database:
```sql
UPDATE users SET monthly_budget = 500 WHERE id = '...';
```

Or via command: `Set my budget to $500/month`

### **Add More LLM Models**

Edit `src/llm/openrouter.js`:
```javascript
models.new_model = {
  id: 'provider/model-name',
  cost_input: 0.001,
  cost_output: 0.005,
  speed: 'fast',
  quality: 'good',
  best_for: ['category1', 'category2']
}
```

---

## **📈 Roadmap**

**Phase 2** (Next):
- [ ] CrewAI agent framework integration
- [ ] Advanced swarm coordination
- [ ] Image generation agents (Replicate, Midjourney)
- [ ] Web scraping with Firecrawl + Playwright

**Phase 3**:
- [ ] Scheduled commands (run daily/weekly)
- [ ] Dashboard UI (real-time project tracking)
- [ ] API endpoints for external apps
- [ ] Webhook integrations

**Phase 4**:
- [ ] Advanced analytics & attribution
- [ ] A/B testing framework
- [ ] Lead scoring refinement
- [ ] Multi-language support

---

## **❓ FAQ**

**Q: What if I run out of budget?**
A: All operations pause. Upgrade your budget via `/budget` command.

**Q: Can I cancel a project?**
A: Yes, but you're charged for completed work.

**Q: Do you store my data?**
A: Only in Supabase (database). No selling/sharing.

**Q: Can I use my own APIs?**
A: Yes! Edit tool definitions to use your own endpoints.

**Q: How do I add custom verticals?**
A: Update `src/core/command-router.js` verticalPatterns.

---

## **📞 Support**

- 📧 Email: support@hustlebot.io
- 💬 Telegram: @HustleBotSupport
- 🐛 Issues: GitHub issues

---

## **📄 License**

MIT License - See LICENSE file

---

**Made with ❤️ by the HustleBot team**

*Automate your business. Amplify your results. Save on costs.*
