# HustleBot v2 - Complete Setup & Run Guide

## Prerequisites

Before starting, you need:
- **Node.js 18+** (check: `node --version`)
- **npm 9+** (check: `npm --version`)
- **API Keys** (we'll get these next)

---

## Step 1: Get Your API Keys (5 minutes)

You'll need **3 API keys**:

### A. OpenRouter API Key (for LLM)
1. Go to https://openrouter.ai/
2. Sign up (free, no credit card needed for initial credits)
3. Go to Dashboard → Keys
4. Create new API key
5. Copy it (looks like: `sk-or-v1-abc123...`)

**✅ Save this as**: `OPENROUTER_API_KEY`

### B. Supabase Connection String (for Database)
1. Go to https://supabase.com/
2. Sign up with GitHub
3. Create new project (name: "hustlebot", region: closest to you)
4. Wait 2 minutes for database to initialize
5. Go to Project Settings → Database → Connection String
6. Copy **"URI"** (looks like: `postgresql://postgres:[password]@[host]:[5432]/postgres`)

**✅ Save this as**: `SUPABASE_URL`

7. Also get your **Anon Public Key**:
   - Settings → API → Project API Keys
   - Copy "anon public" key (looks like: `eyJhbGc...`)

**✅ Save this as**: `SUPABASE_KEY`

### C. Telegram Bot Token (optional, for testing via Telegram)
1. Go to Telegram app
2. Find `@BotFather` (official Telegram bot)
3. Send: `/newbot`
4. Follow prompts, give your bot a name (e.g., "HustleBot")
5. Copy the token (looks like: `123456789:ABCDefgh...`)

**✅ Save this as**: `TELEGRAM_BOT_TOKEN`

---

## Step 2: Clone/Navigate to Project

```bash
# Navigate to the project directory
cd /home/claude/hustlebot-v2

# Verify files are there
ls -la
# Should show: src/, scripts/, package.json, .env.example, etc.
```

---

## Step 3: Install Dependencies

```bash
# Install all npm packages (takes 2-3 minutes)
npm install

# Verify installation
npm list | head -20
# Should show all dependencies listed
```

---

## Step 4: Setup Environment Variables

```bash
# Copy example to actual config
cp .env.example .env

# Open and edit the .env file
# You can use nano, vim, or any editor
nano .env
```

**Update these lines** with your API keys:

```env
# Core APIs
OPENROUTER_API_KEY=sk-or-v1-your-key-here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key-here
TELEGRAM_BOT_TOKEN=your-telegram-token-here

# Optional: Override these if needed
PORT=3000
NODE_ENV=development
MONTHLY_BUDGET=100
```

**Save the file** (if using nano: `Ctrl+X`, then `Y`, then `Enter`)

**Verify it saved:**
```bash
cat .env | grep OPENROUTER
# Should show your key
```

---

## Step 5: Setup Database

```bash
# Run migrations (creates tables)
npm run db:migrate

# Expected output:
# ✅ Created tables: users, projects, leads, transactions, agent_logs, memory
# ✅ Database initialized successfully
```

**What this does:**
- Creates 6 tables in Supabase
- Sets up schema for users, projects, leads, costs, logs
- No data is deleted

---

## Step 6: Start the Server

```bash
# Start HustleBot in development mode (auto-reloads on file changes)
npm run dev

# OR start in production mode
npm start

# Expected output:
# 🚀 HustleBot v2 Server Running
# 📡 Telegram Bot Connected (polling mode)
# 💾 Database: Connected to Supabase
# 💰 Budget: $100/month
# 🤖 Agents: Initializing 17 agents...
# ✅ All systems ready
#
# Listening on http://localhost:3000
```

**If you see errors:**
- Missing API key? → Check .env file
- Database error? → Verify Supabase connection string
- Telegram error? → That's OK, still works without it

---

## Step 7: Test It's Working

### Option A: Via Telegram (Recommended)

```bash
# 1. Open Telegram app
# 2. Search for your bot name (the one you created with @BotFather)
# 3. Click "Start"
# 4. Send a message:

/start
# Bot responds with: "Welcome to HustleBot! Type /help for commands"

/help
# Shows all available commands

/status
# Shows agent status and current budget

# Try an agent:
"Generate 5 headlines for a fitness app"
# Copywriter Agent responds in 10 seconds

"Create a React landing page"
# Frontend Developer Agent responds in 20 seconds
```

### Option B: Via Health Check (If Telegram not working)

```bash
# In a NEW terminal (keep the bot running), test the API:

curl http://localhost:3000/health

# Expected response:
# {
#   "status": "ok",
#   "timestamp": "2026-08-12T...",
#   "agents": 17,
#   "database": "connected",
#   "budget": { "monthly": 100, "spent": 0, "remaining": 100 }
# }
```

### Option C: Run Tests

```bash
# In another terminal (keep bot running):

npm test

# Should show:
# ✅ All agents initialize successfully
# ✅ Agents execute and return results
# ✅ Agents register and expose tools
# ✅ Agents track costs correctly
# ✅ LLMAgent calls LLM correctly
# ✅ Agent inheritance hierarchy correct
```

---

## Step 8: Try Commands

Once bot is running, send these via Telegram:

### Content Generation
```
"Generate 5 headlines for: AI personal trainer app"
→ Copywriter Agent generates headlines in ~10 seconds

"Write a 300-word blog post about remote work"
→ Content Writer generates blog post in ~20 seconds

"Create 5 Twitter posts about productivity"
→ Content Writer generates social posts in ~15 seconds
```

### Development Tasks
```
"Generate a React component: login form with email and password"
→ Frontend Developer generates code in ~30 seconds

"Create API endpoint: POST /api/users to create user"
→ Backend Developer generates code in ~30 seconds
```

### Business Strategy
```
"What's the unit economics for: $100 COGS, $400 price, $50 customer acquisition?"
→ Finance Agent calculates ROI and margins

"Generate 50 leads in California for B2B SaaS"
→ Lead Gen Factory scrapes, validates, enriches leads in ~2 minutes

"Create landing page for fitness app with Stripe integration"
→ Landing Page Factory generates complete page in ~5 minutes
```

### Check Status
```
/status
→ Shows all agent stats

/budget
→ Shows spend and remaining budget

/projects
→ Shows your projects and costs
```

---

## Troubleshooting

### Problem: "OPENROUTER_API_KEY is not set"
**Solution:**
```bash
# Check .env file has the key
cat .env | grep OPENROUTER_API_KEY

# If empty, edit and add it
nano .env

# Restart the bot (Ctrl+C, then npm run dev)
```

### Problem: "Cannot connect to Supabase"
**Solution:**
```bash
# Check connection string
cat .env | grep SUPABASE_URL

# Make sure it's the full connection string:
# Should start with: postgresql://
# Should end with: ?schema=public

# If still failing:
npm run db:migrate
# This will show detailed error messages
```

### Problem: "Telegram bot not responding"
**Solution:**
```bash
# Telegram is optional. Bot still works via HTTP.
# Test with:
curl http://localhost:3000/health

# To enable Telegram:
# 1. Get bot token from @BotFather
# 2. Add to .env: TELEGRAM_BOT_TOKEN=...
# 3. Restart bot: Ctrl+C, then npm run dev
```

### Problem: "Agents not initializing"
**Solution:**
```bash
# Check agents loaded:
npm test

# Check server output for specific agent errors
# Look for: "❌ Failed to initialize [agent name]"

# If specific agent fails, check its file:
ls -la src/agents/

# Reinstall dependencies:
npm install
npm run dev
```

### Problem: "Port 3000 already in use"
**Solution:**
```bash
# Use different port:
PORT=3001 npm run dev

# Or kill the process using port 3000:
lsof -i :3000
# Find the PID and kill it:
kill -9 [PID]
```

---

## File Structure After Setup

```
/home/claude/hustlebot-v2/
├── .env                          ← Created (your secrets)
├── node_modules/                 ← Created (dependencies)
├── src/
│   ├── agents/                   ← All 17 agents
│   ├── server.js                 ← Main entry point
│   ├── telegram/handler.js       ← Telegram integration
│   ├── core/                      ← Budget, command router
│   ├── llm/openrouter.js         ← LLM integration
│   ├── db/supabase.js            ← Database
│   └── tools/                     ← Factories (landing page, leads)
├── scripts/migrate.js             ← DB setup
└── package.json
```

---

## Running in Background (Optional)

If you want the bot to run 24/7:

### Option A: Using `nohup` (Simple)
```bash
cd /home/claude/hustlebot-v2
nohup npm start > bot.log 2>&1 &

# Check if running:
ps aux | grep "npm start"

# View logs:
tail -f bot.log

# Stop:
pkill -f "npm start"
```

### Option B: Using `screen` (Better)
```bash
# Start in background
screen -S hustlebot npm start

# Detach: Ctrl+A then D
# Reattach: screen -r hustlebot
# Stop: Ctrl+C inside screen
```

### Option C: Deploy to Render (Production)
See `SETUP.md` for complete deployment guide to Render (free tier available)

---

## Next Steps

Once running successfully:

1. **Test all agents** - Send messages to try different agents
2. **Monitor costs** - Check `/status` to see spending
3. **Build Phase 3** - When ready, create more tool factories
4. **Deploy to production** - Use Render for 24/7 hosting

---

## Summary

| Step | Command | Time |
|------|---------|------|
| 1 | Get API keys | 5 min |
| 2 | Navigate to project | 1 min |
| 3 | npm install | 3 min |
| 4 | Setup .env | 2 min |
| 5 | npm run db:migrate | 1 min |
| 6 | npm run dev | Instant |
| **Total** | | **12 minutes** |

---

## Quick Copy-Paste (if you have all keys ready)

```bash
cd /home/claude/hustlebot-v2
npm install
cp .env.example .env
nano .env  # Add your 3 API keys, save with Ctrl+X, Y, Enter
npm run db:migrate
npm run dev

# Once started, open Telegram and message your bot:
# "Generate 5 headlines for my product"
```

---

**You're now ready to run HustleBot v2! 🚀**

Questions? Check:
- `README.md` - Full documentation
- `SETUP.md` - Deployment guide
- `PHASE2-QUICKSTART.md` - Feature overview
- Source code comments
