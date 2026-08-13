# 🚀 HustleBot v2 - Quick Start Checklist

## Get Your API Keys (5 minutes)

### ✅ Step 1: OpenRouter API Key
- [ ] Go to https://openrouter.ai/
- [ ] Sign up (free)
- [ ] Dashboard → Keys → Create API Key
- [ ] Copy key: **___________________** (paste here temporarily)

### ✅ Step 2: Supabase (Database)
- [ ] Go to https://supabase.com/
- [ ] Create new project (name: "hustlebot")
- [ ] Wait for project to initialize (2 min)
- [ ] Settings → Database → URI: **___________________**
- [ ] Settings → API → Anon Key: **___________________**

### ✅ Step 3: Telegram (Optional but recommended)
- [ ] Open Telegram
- [ ] Search: @BotFather
- [ ] Send: /newbot
- [ ] Name your bot: e.g., "HustleBot"
- [ ] Copy token: **___________________**

---

## Setup (5 minutes)

```bash
# Copy and paste these commands one by one:

# 1. Navigate to project
cd /home/claude/hustlebot-v2

# 2. Install dependencies
npm install

# 3. Create config file
cp .env.example .env

# 4. Open config and add your keys
nano .env

# In the file, find these lines and fill them in:
# OPENROUTER_API_KEY=sk-or-v1-[your-key-here]
# SUPABASE_URL=postgresql://[your-connection-string]
# SUPABASE_KEY=[your-anon-key]
# TELEGRAM_BOT_TOKEN=[your-bot-token]
#
# Save: Press Ctrl+X, then Y, then Enter

# 5. Setup database
npm run db:migrate

# 6. Start the bot
npm run dev
```

---

## Test It's Working

### Via Telegram:
```
1. Open Telegram app
2. Find your bot by name
3. Click "Start"
4. Send: "Generate 5 headlines for a fitness app"
5. Wait 10 seconds → Copywriter Agent responds!
```

### Via Health Check:
```bash
# In a NEW terminal window:
curl http://localhost:3000/health

# Should show:
# { "status": "ok", "agents": 17, ... }
```

---

## Try These Commands

Once running, send to your bot:

**For Copywriting:**
```
"Write 5 headlines for my SaaS"
"Create a sales page for AI tool"
"Generate email subject lines"
```

**For Development:**
```
"Generate React login form component"
"Create API endpoint for creating users"
"Design database schema for e-commerce"
```

**For Business:**
```
"Generate 50 leads in California"
"Create landing page with Stripe for my product"
"Analyze unit economics: $100 COGS, $400 price"
```

**For Status:**
```
/status        → See all agents
/budget        → Check spending
/help          → All commands
```

---

## Expected Output

When you run `npm run dev`, you should see:

```
🚀 HustleBot v2 Server Running
📡 Telegram Bot Connected (polling mode)
💾 Database: Connected to Supabase
💰 Budget: $100/month (hard cap)
🤖 Agents: Initializing 17 agents...
  ✅ Copywriter Agent
  ✅ Content Writer Agent
  ✅ Frontend Developer Agent
  ✅ Backend Developer Agent
  ✅ Database Agent
  ✅ DevOps Agent
  ✅ Landing Page Agent
  ✅ Product Agent
  ✅ Marketing Agent
  ✅ Sales Agent
  ✅ Finance Agent
  ✅ Analytics Agent
  ✅ Ideation Agent
  ✅ Video Agent
  ✅ Social Media Agent
  ✅ Tools: Landing Page Factory
  ✅ Tools: Lead Gen Factory

✅ All systems ready
🎧 Listening on http://localhost:3000
```

---

## If Something Goes Wrong

**"OPENROUTER_API_KEY not set"**
- Check .env file exists: `cat .env`
- Add key and restart: `Ctrl+C`, then `npm run dev`

**"Cannot connect to Supabase"**
- Verify connection string in .env
- Should start with: `postgresql://`
- Restart bot

**"Telegram not responding"**
- It's optional! Bot works without it
- Test with: `curl http://localhost:3000/health`

**"Port 3000 already in use"**
- Use different port: `PORT=3001 npm run dev`

---

## What's Running

```
Your Machine (localhost)
  ↓
Express Server (port 3000)
  ↓
17 AI Agents (coordinated)
  ↓
OpenRouter (LLM routing)
  ↓
Supabase (database)
  ↓
Telegram (optional)
```

---

## Files Created

- ✅ `.env` - Your secrets (API keys)
- ✅ `node_modules/` - Dependencies
- ✅ `.git/` - Version control (if using)

---

## Keep It Running

### Stop the bot:
```
Ctrl+C
```

### Restart the bot:
```
npm run dev
```

### View logs:
```
npm run dev 2>&1 | tee bot.log
tail -f bot.log
```

---

## Next Steps

1. ✅ Run the bot
2. ✅ Test with Telegram
3. ✅ Try different agents
4. ✅ Check `/status` for costs
5. 📋 Build Phase 3 (more factories)

---

## Total Time

| Step | Time |
|------|------|
| Get API keys | 5 min |
| Setup & install | 5 min |
| Start bot | 1 min |
| **Total** | **11 min** |

---

## Support

- Full guide: See `RUN-GUIDE.md`
- Docs: See `README.md`
- Setup help: See `SETUP.md`
- Features: See `PHASE2-QUICKSTART.md`

---

**Ready? Let's go! 🚀**

```bash
cd /home/claude/hustlebot-v2 && npm run dev
```
