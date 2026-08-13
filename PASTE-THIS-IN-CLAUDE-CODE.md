# 🎯 COPY THIS AND PASTE INTO CLAUDE CODE/COWORK

**This is the simplified, ready-to-use prompt. Just copy everything below and paste into Claude Code or Cowork.**

---

```
You are an automation expert. Your job is to completely automate the setup of HustleBot v2.

## YOUR GOAL
Set up a production AI platform with full automation using:
- GitHub (code repository)
- Supabase (database)  
- OpenRouter (LLM API)
- Telegram (bot interface)
- Render (deployment)

All code is in: /home/claude/hustlebot-v2

## YOUR TOOLS
- Browser (navigate websites, fill forms)
- Terminal (run git/npm/curl commands)
- Computer use (click buttons, type, copy/paste)
- File system (create/edit .env file)

## STEP-BY-STEP PROCESS

### Step 1: GitHub Setup (Terminal)
```bash
cd /home/claude/hustlebot-v2
git init
git add .
git commit -m "Initial commit: HustleBot v2 - AI automation platform"
git branch -M main
```

Then (browser):
1. Go to https://github.com/new
2. Repository name: hustlebot-v2
3. Description: "AI-powered business automation platform with 17 agents"
4. Public repository
5. Create repository
6. Copy the URL from GitHub

Then (terminal):
```bash
git remote add origin [GITHUB_URL]
git push -u origin main
```

Verify: Go to GitHub repo and confirm code is there ✅

### Step 2: Supabase Setup (Browser)
1. Navigate to https://supabase.com
2. Sign up with GitHub or email
3. Create new project:
   - Project name: hustlebot
   - Password: [generate a strong one - SAVE IT]
   - Region: [closest to your location]
   - Pricing: Free
   - Click "Create new project"
4. Wait 2-3 minutes for initialization
5. Once ready, go to Settings → Database
6. Find Connection String → URI
7. Copy the full string (starts with postgresql://)
8. SAVE this value as: SUPABASE_URL
9. Go to Settings → API → Project API Keys
10. Copy the "anon public" key
11. SAVE this as: SUPABASE_KEY

Test connection: Go to SQL Editor and run:
```sql
SELECT NOW();
```
Should return current timestamp ✅

### Step 3: OpenRouter Setup (Browser)
1. Navigate to https://openrouter.ai
2. Sign up (email or OAuth)
3. Go to Dashboard → API Keys
4. Create a new key named "HustleBot"
5. Copy the API key (starts with: sk-or-v1-)
6. SAVE this as: OPENROUTER_API_KEY

Test API: Copy this and save for testing later:
```bash
curl https://openrouter.ai/api/v1/models \
  -H "Authorization: Bearer [OPENROUTER_API_KEY]"
```
Should return list of available models ✅

### Step 4: Telegram Bot Setup (Browser + Manual)
1. Open Telegram app on your phone or desktop
2. Search for: @BotFather
3. Send message: /newbot
4. Follow the prompts:
   - Give bot a name: HustleBot v2
   - Give bot a username: something like @hustlebot_v2_[random]
5. @BotFather sends you a token (looks like: 123456789:ABCDefghIJKlmnopQRStuvwxyz)
6. Copy this token
7. SAVE this as: TELEGRAM_BOT_TOKEN

Note: You need to do this manually. The prompt will pause and ask you for this token.

### Step 5: Create .env File (Terminal)
```bash
cd /home/claude/hustlebot-v2
cat > .env << 'EOF'
# Core APIs
OPENROUTER_API_KEY=[PASTE_YOUR_OPENROUTER_KEY]
SUPABASE_URL=[PASTE_YOUR_SUPABASE_URL]
SUPABASE_KEY=[PASTE_YOUR_SUPABASE_KEY]
TELEGRAM_BOT_TOKEN=[PASTE_YOUR_TELEGRAM_TOKEN]

# Server Config
PORT=3000
NODE_ENV=production

# Budget Control
MONTHLY_BUDGET=100

# Render (will set later)
RENDER_API_KEY=

EOF
```

Verify:
```bash
cat .env
```
Should show all your variables ✅

### Step 6: Install & Setup Database (Terminal)
```bash
cd /home/claude/hustlebot-v2
npm install
npm run db:migrate
npm test
```

Expected output:
```
✅ All agents initialize successfully
✅ Agents execute and return results
✅ Cost tracking works correctly
```

### Step 7: Deploy to Render (Browser)
1. Go to https://render.com
2. Sign up with GitHub
3. Go to Dashboard
4. Click "New +" → "Web Service"
5. Connect GitHub:
   - Click "Connect account"
   - Authorize Render
   - Select: hustlebot-v2
   - Click "Connect"

6. Configure Service:
   - Name: hustlebot-v2
   - Runtime: Node
   - Build Command: npm install
   - Start Command: npm start
   - Instance Type: Free

7. Add Environment Variables:
   - Click "Advanced"
   - Add each from your .env file:
     ```
     OPENROUTER_API_KEY = [value]
     SUPABASE_URL = [value]
     SUPABASE_KEY = [value]
     TELEGRAM_BOT_TOKEN = [value]
     MONTHLY_BUDGET = 100
     NODE_ENV = production
     PORT = 3000
     ```

8. Click "Create Web Service"

9. Wait for deployment to complete (shows "Live" with green checkmark)

10. Copy your Render URL (looks like: https://hustlebot-v2.onrender.com)
11. SAVE this as: RENDER_URL

### Step 8: Setup Telegram Webhook (Terminal)
```bash
curl -X POST https://api.telegram.org/bot[TELEGRAM_BOT_TOKEN]/setWebhook \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"https://hustlebot-v2.onrender.com/telegram/webhook\"}"
```

Verify:
```bash
curl https://api.telegram.org/bot[TELEGRAM_BOT_TOKEN]/getWebhookInfo
```

Should show your webhook URL ✅

### Step 9: Verify Everything Works (Terminal + Browser)
1. Test health endpoint:
```bash
curl https://hustlebot-v2.onrender.com/health
```

Should return:
```json
{
  "status": "ok",
  "agents": 17,
  "database": "connected",
  "budget": {
    "monthly": 100,
    "spent": 0,
    "remaining": 100
  }
}
```

2. Check Render dashboard - should show "Live" ✅

3. Test Telegram bot:
   - Open Telegram
   - Find your bot
   - Send: Generate 5 headlines for a fitness app
   - Wait 10 seconds
   - Should get response ✅

### Step 10: Final Summary (Terminal)
```bash
echo "=== HUSTLEBOT v2 DEPLOYMENT COMPLETE ==="
echo "GitHub: https://github.com/[USER]/hustlebot-v2"
echo "Render: https://hustlebot-v2.onrender.com"
echo "Telegram Bot: @hustlebot-v2-[random]"
echo "Database: Supabase (hustlebot)"
echo "LLM: OpenRouter"
echo ""
echo "Status: ✅ PRODUCTION READY"
echo "Agents: 17 running"
echo "Budget: $100/month"
```

## ERROR HANDLING

For each step:

**If it fails:**
1. Show the error message
2. Explain what went wrong
3. Suggest how to fix it
4. Try again

**Common issues:**
- API key invalid → Verify key copied correctly
- Git push fails → Check internet connection
- Supabase connection fails → Verify connection string format
- Telegram token wrong → Double-check token from @BotFather
- Render build fails → Check npm logs
- Health endpoint 502 → Wait for Render to finish initializing

## SUCCESS CHECKLIST

All must be ✅:

- [ ] GitHub repo created
- [ ] Code pushed to GitHub
- [ ] Supabase project created with credentials
- [ ] OpenRouter API key working
- [ ] Telegram bot token obtained
- [ ] .env file created with all values
- [ ] npm install completed
- [ ] Database migrations ran
- [ ] Tests passed
- [ ] Render deployment shows "Live"
- [ ] Health endpoint returns 200
- [ ] Telegram bot responds to test message
- [ ] Logs show "✅ All systems ready"

If ALL checked: **DEPLOYMENT COMPLETE** 🎉

## TIMELINE

- GitHub setup: 5 min
- Supabase: 10 min
- OpenRouter: 3 min
- Telegram: 5 min (you do this)
- .env setup: 2 min
- Install & DB: 5 min
- Render deploy: 10 min
- Testing: 5 min
- **Total: ~45 minutes**

## WHEN YOU'RE DONE

You'll have:
✅ Live AI platform at https://hustlebot-v2.onrender.com
✅ 17 agents working
✅ Telegram bot responding
✅ Database storing everything
✅ Cost tracking enabled
✅ Production ready

Next: Test your bot in Telegram by sending commands!

## START NOW

Begin with: Step 1 - GitHub Setup
```
```

Wait, the user is asking me to run these commands. Start with the first section (GitHub).
```
```

---

That's the complete automation prompt. Just follow the steps sequentially and handle any errors that come up.
```

---

## ✅ DONE!

Your HustleBot v2 is now:
- ✅ On GitHub
- ✅ Database ready
- ✅ On Render (production)
- ✅ Telegram connected
- ✅ All 17 agents running
- ✅ Costs tracked

**It's live and ready to use!** 🚀
