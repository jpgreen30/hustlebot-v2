# HUSTLEBOT v2 - COMPLETE AUTOMATION PROMPT FOR CLAUDE CODE/COWORK

Copy this entire prompt into Claude Code or Cowork and it will automate the entire setup.

---

```
SETUP AUTOMATION FOR HUSTLEBOT v2

## MISSION
Completely automate the setup of HustleBot v2 from code to live deployment on Render.

Include:
1. Create GitHub repository
2. Push code to GitHub
3. Create Supabase project and get credentials
4. Get OpenRouter API key
5. Create Telegram bot
6. Configure Render deployment
7. Deploy to Render
8. Verify everything works

Use browser automation, terminal commands, and computer use as needed.

## PROCESS

### PHASE 1: GITHUB SETUP (Use Terminal)

1. Initialize git repo in /home/claude/hustlebot-v2
   ```bash
   cd /home/claude/hustlebot-v2
   git init
   git add .
   git commit -m "Initial commit: HustleBot v2 complete"
   ```

2. Create GitHub repository (MANUAL - need user's GitHub):
   - Open browser: https://github.com/new
   - Repository name: hustlebot-v2
   - Description: "AI-powered business automation platform"
   - Public or Private: [User choice]
   - Initialize with README: No (we have it)
   - Click "Create repository"

3. Add remote and push (Terminal):
   ```bash
   git remote add origin https://github.com/[USER]/hustlebot-v2.git
   git branch -M main
   git push -u origin main
   ```

### PHASE 2: SUPABASE SETUP (Use Browser)

1. Navigate to https://supabase.com
2. Sign up with GitHub (or email)
3. Create new project:
   - Organization: [create if needed]
   - Project name: hustlebot
   - Password: [generate strong password - SAVE IT]
   - Region: [choose closest to user]
   - Pricing plan: Free
   - Click "Create new project"
4. Wait for project initialization (2-3 minutes)
5. Go to Settings → Database → Connection String
   - Copy full URI (looks like: postgresql://postgres:[password]@[host]:5432/postgres)
   - SAVE as: SUPABASE_URL
6. Go to Settings → API → Project API Keys
   - Copy "anon public" key
   - SAVE as: SUPABASE_KEY
7. Go to Settings → API → Project URL
   - SAVE as: SUPABASE_PROJECT_URL

### PHASE 3: OPENROUTER SETUP (Use Browser)

1. Navigate to https://openrouter.ai
2. Sign up (email or OAuth)
3. Go to Dashboard → Keys
4. Click "Create key"
5. Give it a name: "HustleBot"
6. Copy the API key (starts with: sk-or-v1-)
   - SAVE as: OPENROUTER_API_KEY

### PHASE 4: TELEGRAM BOT SETUP (Use Browser)

1. Open Telegram app
2. Search for @BotFather
3. Send: /newbot
4. Follow prompts:
   - Give the bot a name: "HustleBot v2"
   - Give it a username: @hustlebot-v2-[random]
5. Copy the token from @BotFather
   - SAVE as: TELEGRAM_BOT_TOKEN

### PHASE 5: ENVIRONMENT SETUP (Use Terminal)

1. Create .env file with all credentials:
   ```bash
   cd /home/claude/hustlebot-v2
   cp .env.example .env
   cat > .env << 'EOF'
   # Core APIs
   OPENROUTER_API_KEY=[OPENROUTER_API_KEY]
   SUPABASE_URL=[SUPABASE_URL]
   SUPABASE_KEY=[SUPABASE_KEY]
   TELEGRAM_BOT_TOKEN=[TELEGRAM_BOT_TOKEN]

   # Server
   PORT=3000
   NODE_ENV=production

   # Budget
   MONTHLY_BUDGET=100

   # GitHub (for deployments)
   GITHUB_TOKEN=[WILL_SET_FROM_RENDER]

   # Render
   RENDER_API_KEY=[WILL_CREATE]
   EOF
   ```

2. Verify .env was created:
   ```bash
   cat .env
   ```

### PHASE 6: DATABASE SETUP (Use Terminal)

1. Install dependencies:
   ```bash
   cd /home/claude/hustlebot-v2
   npm install
   ```

2. Run database migrations:
   ```bash
   npm run db:migrate
   ```

3. Verify database connected:
   ```bash
   npm run test
   ```

### PHASE 7: RENDER DEPLOYMENT (Use Browser)

1. Navigate to https://render.com
2. Sign up with GitHub account
3. Go to Dashboard
4. Click "New +" → "Web Service"
5. Connect GitHub:
   - Click "Connect account"
   - Authorize Render to access GitHub
   - Select your hustlebot-v2 repository
   - Click "Connect"

6. Configure Web Service:
   - Name: hustlebot-v2
   - Environment: Node
   - Build Command: npm install
   - Start Command: npm start
   - Instance Type: Free (or paid for production)

7. Add Environment Variables:
   - Click "Advanced"
   - Add environment variables (copy from .env):
     ```
     OPENROUTER_API_KEY = [key]
     SUPABASE_URL = [url]
     SUPABASE_KEY = [key]
     TELEGRAM_BOT_TOKEN = [token]
     MONTHLY_BUDGET = 100
     NODE_ENV = production
     ```

8. Click "Create Web Service"

9. Wait for deployment (3-5 minutes)

10. Get Render deployment URL:
    - Copy the URL from Render dashboard (looks like: https://hustlebot-v2.onrender.com)
    - SAVE as: RENDER_URL

### PHASE 8: TELEGRAM WEBHOOK SETUP (Use Terminal)

1. Set Telegram webhook to point to Render:
   ```bash
   curl -X POST https://api.telegram.org/bot[TELEGRAM_BOT_TOKEN]/setWebhook \
     -H "Content-Type: application/json" \
     -d "{\"url\": \"https://hustlebot-v2.onrender.com/telegram/webhook\"}"
   ```

2. Verify webhook set:
   ```bash
   curl https://api.telegram.org/bot[TELEGRAM_BOT_TOKEN]/getWebhookInfo
   ```

### PHASE 9: VERIFICATION (Use Browser + Terminal)

1. Check Render deployment status:
   - Go to https://render.com/dashboard
   - Click on hustlebot-v2
   - Verify "Live" status with green checkmark

2. Test health endpoint (Terminal):
   ```bash
   curl https://hustlebot-v2.onrender.com/health
   ```
   Should return:
   ```json
   {
     "status": "ok",
     "agents": 17,
     "database": "connected",
     "budget": { "monthly": 100, "spent": 0, "remaining": 100 }
   }
   ```

3. Test Telegram bot:
   - Open Telegram
   - Find your bot
   - Send: "Generate 5 headlines for fitness app"
   - Wait 10 seconds
   - Bot should respond with headlines

4. Check logs in Render:
   - Go to Render dashboard
   - Click on hustlebot-v2
   - Click "Logs"
   - Should see: "✅ All systems ready"

## CREDENTIALS TO COLLECT & VERIFY

Create a summary document with:

```
HUSTLEBOT v2 - DEPLOYMENT SUMMARY
===================================

GitHub Repository
- URL: https://github.com/[USER]/hustlebot-v2
- Branch: main
- Status: [✅ Pushed / ❌ Failed]

Supabase Project
- Project Name: hustlebot
- Project URL: [SUPABASE_PROJECT_URL]
- DB Connection: Connected ✅
- Status: [✅ Created / ❌ Failed]

OpenRouter
- API Key: sk-or-v1-[first-10-chars]...
- Status: [✅ Created / ❌ Failed]

Telegram Bot
- Bot Name: @hustlebot-v2-[random]
- Webhook: https://hustlebot-v2.onrender.com/telegram/webhook
- Status: [✅ Connected / ❌ Failed]

Render Deployment
- URL: https://hustlebot-v2.onrender.com
- Status: [✅ Live / ⏳ Building / ❌ Failed]
- Health Check: [✅ Passing / ❌ Failing]

Environment Variables
- OPENROUTER_API_KEY: [✅ Set]
- SUPABASE_URL: [✅ Set]
- SUPABASE_KEY: [✅ Set]
- TELEGRAM_BOT_TOKEN: [✅ Set]

Final Status
- All systems: [✅ Online / ❌ Issues]
- Ready for production: [✅ Yes / ❌ No]
- Next steps: See recommendations below
```

## ERROR HANDLING

For each phase, if something fails:

1. Supabase fails:
   - Check if project created: https://supabase.com/dashboard
   - Verify connection string format
   - Try running migrations again: npm run db:migrate

2. GitHub fails:
   - Verify GitHub account authenticated
   - Check repo exists: https://github.com/[USER]/hustlebot-v2
   - Try pushing again: git push -u origin main

3. OpenRouter fails:
   - Verify account has credits
   - Check API key format
   - Test: curl https://api.openrouter.ai/api/v1/models

4. Telegram fails:
   - Verify bot token is correct
   - Test webhook: curl https://api.telegram.org/bot[TOKEN]/getWebhookInfo
   - Send test message to bot

5. Render fails:
   - Check build logs in Render dashboard
   - Verify all env variables set
   - Try manual deploy: Click "Deploy" button in Render dashboard
   - Check if npm install succeeds locally: npm install

6. Health check fails:
   - View Render logs
   - Check if Supabase connected
   - Verify all env variables present
   - Run locally to test: npm run dev

## SUCCESS CRITERIA

✅ All items below must be true:

- [ ] GitHub repo created and code pushed
- [ ] Supabase project created with credentials
- [ ] OpenRouter API key obtained
- [ ] Telegram bot created and token saved
- [ ] .env file created with all credentials
- [ ] npm install completed without errors
- [ ] npm run db:migrate succeeded
- [ ] Render deployment live (green checkmark)
- [ ] Health endpoint returns 200 OK
- [ ] Telegram bot responds to test message
- [ ] Logs show "✅ All systems ready"
- [ ] Budget tracking shows $100 limit

If all ✅, then: **DEPLOYMENT COMPLETE - PRODUCTION READY**

## AUTOMATION TOOLS NEEDED

1. **Browser Automation**:
   - Navigate to websites
   - Fill forms (GitHub, Supabase, OpenRouter, Telegram)
   - Copy/paste credentials
   - Click buttons and links
   - Read page content

2. **Terminal Automation**:
   - Run git commands
   - Run npm commands
   - Set environment variables
   - Run database migrations
   - Test health endpoints with curl

3. **Computer Use**:
   - Switch between browser and terminal
   - Copy/paste between windows
   - Fill in forms
   - Navigate menus

4. **File Editing**:
   - Create .env file
   - Update configuration files
   - Create README with credentials summary

## TIMELINE

| Phase | Task | Time | Automated? |
|-------|------|------|-----------|
| 1 | GitHub setup | 5 min | ✅ Terminal |
| 2 | Supabase | 10 min | ✅ Browser |
| 3 | OpenRouter | 3 min | ✅ Browser |
| 4 | Telegram | 5 min | ⚠️ Manual |
| 5 | Environment | 2 min | ✅ Terminal |
| 6 | Database | 5 min | ✅ Terminal |
| 7 | Render | 10 min | ✅ Browser |
| 8 | Webhook | 2 min | ✅ Terminal |
| 9 | Verification | 5 min | ✅ Terminal |
| **TOTAL** | | **47 min** | **~90% automated** |

## OUTPUT

After completion, provide:

1. **Summary Document** with all credentials and status
2. **Verification Report** showing all checks passed
3. **Deployment URL** for accessing bot
4. **Next Steps** for production use
5. **Cost Estimates** for first month
6. **Support Guide** for troubleshooting

## ADDITIONAL RECOMMENDATIONS

After deployment:
1. Set up monitoring alerts in Render
2. Enable auto-deploy on GitHub push
3. Set up backup strategy for Supabase
4. Configure error tracking (Sentry)
5. Set up analytics (Vercel Analytics, PostHog)
6. Create status page for uptime monitoring
7. Document runbooks for common issues
8. Set up cost optimization (auto-scaling)

## START

Begin with PHASE 1: GITHUB SETUP

Go through each phase sequentially.
For each phase, read the instructions carefully.
When it says [USER MANUAL], stop and wait for user input.
When it says [AUTOMATED], proceed automatically.

Ask for clarification if anything is unclear.
Show progress as you complete each phase.
Provide error details if anything fails.
```

---

## HOW TO USE THIS PROMPT

1. **Copy the entire prompt above** (from ``` to ```)
2. **Open Claude Code or Cowork**
3. **Paste the prompt** into a new task
4. **Claude will:**
   - Follow each phase step-by-step
   - Use browser to navigate websites
   - Use terminal for git/npm commands
   - Use computer use to fill forms
   - Verify each step worked
   - Provide credential summary
   - Deploy to Render
   - Test everything

---

## WHAT CLAUDE CODE/COWORK WILL DO

✅ **Automated:**
- Git initialization and commits
- npm install and database setup
- Render deployment configuration
- Telegram webhook setup
- Health check testing
- Error detection and recovery

✅ **Browser-based (with user approval):**
- Create GitHub repo
- Create Supabase project
- Create OpenRouter account
- Fill forms on Render
- Verify deployments

⚠️ **Manual (you do):**
- Telegram @BotFather /newbot command (can't automate chat app)
- Final Telegram test message (to ensure it works)

---

## CREDENTIALS YOU'LL GET

After automation completes:

```
GitHub Repo: https://github.com/[your-username]/hustlebot-v2
Supabase Project: https://supabase.com/dashboard
Render URL: https://hustlebot-v2.onrender.com
Telegram Bot: @hustlebot-v2-[random]

All API keys and credentials saved in .env file
```

---

## EXPECTED TIME

- **With automation**: 45 minutes (mostly waiting for deployments)
- **Without automation**: 2-3 hours (manual setup)

**You save 1.5-2 hours of manual work!** ⏱️

---

## NEXT AFTER DEPLOYMENT

Once live:
1. Test bot in Telegram
2. Monitor costs in /budget
3. Check logs in Render dashboard
4. Build Phase 3 (additional factories)
5. Set up auto-scaling if needed

---

**Ready? Paste this prompt into Claude Code/Cowork and watch it automate everything!** 🚀
