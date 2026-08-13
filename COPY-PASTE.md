# Copy & Paste Setup - No Thinking Required

## BEFORE YOU START
Get these 3 things:
1. OpenRouter key: https://openrouter.ai/keys
2. Supabase connection: https://supabase.com (create project, get DB URI)
3. Telegram bot token: Message @BotFather on Telegram with /newbot

---

## EXACT COMMANDS TO RUN

### Terminal 1: Setup (Run these commands in order)

```bash
cd /home/claude/hustlebot-v2
npm install
cp .env.example .env
```

**Stop here and edit .env:**
```bash
nano .env
```

Find these lines and fill in your values:
```env
OPENROUTER_API_KEY=sk-or-v1-YOUR-KEY-HERE
SUPABASE_URL=postgresql://YOUR-CONNECTION-STRING
SUPABASE_KEY=YOUR-ANON-KEY
TELEGRAM_BOT_TOKEN=YOUR-BOT-TOKEN
```

Save: `Ctrl+X` → `Y` → `Enter`

**Continue:**
```bash
npm run db:migrate
npm run dev
```

**Wait for:**
```
✅ All systems ready
🎧 Listening on http://localhost:3000
```

---

## NOW TEST IT

### Option A: Via Telegram (Best)

1. Open Telegram app
2. Search for your bot name
3. Click "Start"
4. Send: `Generate 5 headlines for a fitness app`
5. **Wait 10 seconds** → Bot responds!

### Option B: Via Terminal (If Telegram not setup)

**Open a NEW terminal window** (keep first one running):

```bash
curl http://localhost:3000/health
```

Should return:
```json
{
  "status": "ok",
  "agents": 17,
  "database": "connected"
}
```

---

## TRY THESE COMMANDS IN TELEGRAM

Copy-paste one at a time into Telegram:

```
Generate 5 headlines for my fitness app
```

```
Write a 300-word blog post about remote work
```

```
Create a React component: login form
```

```
Generate 50 leads in California
```

```
Create landing page with Stripe for my product
```

```
/status
```

```
/budget
```

---

## THAT'S IT!

Your HustleBot is now running with:
- ✅ 17 AI agents
- ✅ Cost tracking
- ✅ LLM routing (Claude/Grok/Llama)
- ✅ Database storage
- ✅ Telegram interface

---

## COMMON ISSUES & FIXES

**Issue: "OPENROUTER_API_KEY not set"**
```bash
# Check .env file
cat .env | grep OPENROUTER

# If empty, edit again
nano .env

# Then restart (press Ctrl+C in terminal, then):
npm run dev
```

**Issue: "Cannot connect to Supabase"**
```bash
# Make sure connection string is correct
# Should look like: postgresql://postgres:[password]@[host]:[port]/postgres

# Double-check in .env
cat .env | grep SUPABASE_URL

# Restart
npm run dev
```

**Issue: "Telegram not responding"**
- That's OK, it's optional
- Bot still works via HTTP
- Use `curl http://localhost:3000/health` to test

**Issue: "Something failed"**
```bash
# Stop bot
Ctrl+C

# Try again
npm run dev
```

---

## TO STOP THE BOT
```
Ctrl+C
```

## TO START AGAIN
```bash
cd /home/claude/hustlebot-v2
npm run dev
```

---

## WHAT'S WORKING NOW

You have a fully functional AI platform with:

**Copywriting Agents:**
- Headlines, sales copy, email sequences, blog posts

**Development Agents:**
- React components, APIs, database schemas, deployment configs

**Business Agents:**
- Product strategy, marketing plans, sales tactics, unit economics, analytics

**Tool Factories:**
- Landing page generation with Stripe integration
- Lead generation with scraping, validation, enrichment, scoring

**Smart LLM Routing:**
- Claude 3.5 for complex tasks
- Grok 2 for fast, cheap content
- Llama for high-volume, low-cost tasks

**Budget Control:**
- $100/month hard cap
- Cost tracking on every operation
- Alerts at 75% and 90% budget

---

## NEXT PHASE

When ready to add more features:
- See `PHASE3-5-IMPLEMENTATION.md` for detailed roadmap
- Or continue testing current agents

---

## FILES YOU NOW HAVE

```
/home/claude/hustlebot-v2/
├── src/agents/           ← 17 AI agents (working!)
├── src/tools/            ← Factories (working!)
├── .env                  ← Your secrets
├── node_modules/         ← Dependencies
└── [other files]
```

---

## ESTIMATED COSTS

| Operation | Cost | Time |
|-----------|------|------|
| 5 headlines | $0.02 | 10 sec |
| Blog post | $0.05 | 3 min |
| React component | $0.08 | 1 min |
| 50 leads | $0.25 | 2 min |
| Landing page | $0.15 | 5 min |

**Monthly budget: $100 (hard limit)**

---

## SUMMARY

```
5 minutes:  Get API keys
5 minutes:  npm install
2 minutes:  Edit .env file
1 minute:   npm run db:migrate
Instant:    npm run dev
10 seconds: Send first message to bot

TOTAL: 13 minutes to working AI platform
```

---

**That's it! Your AI platform is ready to use. 🚀**

Questions? Read `README.md` or `RUN-GUIDE.md`
