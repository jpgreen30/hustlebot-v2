# HustleBot v2 - Complete Automation Setup

**Status:** ✅ Production-Ready  
**Last Updated:** August 12, 2026  
**Setup Time:** 45-60 minutes  
**Cost:** Free to $50/month

---

## 📋 Quick Overview

HustleBot v2 is a fully automated AI platform that:
- ✅ Builds landing pages automatically
- ✅ Generates qualified leads
- ✅ Creates marketing content
- ✅ Manages email automation
- ✅ Handles workflow automation

This guide automates the **complete setup** from local development to production deployment.

---

## 🚀 Quick Start (3 Steps)

### Step 1: Setup Environment Variables
```bash
# Run the interactive setup wizard
chmod +x setup-env.sh
./setup-env.sh
```

This script will guide you through collecting:
- Telegram Bot Token (from @BotFather)
- Supabase credentials (from supabase.com)
- OpenRouter API Key (from openrouter.ai)
- Optional: AWS, Stripe, Deepgram keys

### Step 2: Deploy Locally
```bash
# Install dependencies
npm install

# Run database migrations
npm run db:migrate

# Start development server
npm run dev
```

The server will start at `http://localhost:3000`

### Step 3: Deploy to Production
```bash
# Make the deploy script executable
chmod +x deploy.sh

# Run automated deployment
./deploy.sh production
```

The script will automatically:
1. ✅ Validate all credentials
2. ✅ Run tests and linting
3. ✅ Push code to GitHub
4. ✅ Deploy to Render
5. ✅ Verify deployment

---

## 📁 Setup Files Included

| File | Purpose |
|------|---------|
| **setup-env.sh** | Interactive wizard to collect credentials and generate .env |
| **deploy.sh** | Automated deployment script (validate → test → push → deploy) |
| **AUTOMATION-SETUP-GUIDE.md** | Detailed step-by-step setup guide for each service |
| **AUTOMATION-README.md** | This file |

---

## 🔧 Service Setup Requirements

### 1. **Telegram Bot** (Required)
- **Time:** 5 minutes
- **Cost:** Free
- **Steps:**
  ```
  1. Open Telegram, search @BotFather
  2. Send /newbot
  3. Choose bot name: HustleBot v2
  4. Choose username: hustlebot_v2_bot
  5. Copy the API token
  ```
- **Credential:** `TELEGRAM_BOT_TOKEN`

### 2. **Supabase Database** (Required)
- **Time:** 10 minutes
- **Cost:** Free tier available
- **Steps:**
  ```
  1. Go to https://supabase.com/dashboard
  2. Click "New project"
  3. Name: hustlebot-v2
  4. Set database password
  5. Wait for initialization (2-3 minutes)
  6. Go to Settings → API
  7. Copy: SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_KEY
  ```
- **Credentials:** `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_KEY`

### 3. **OpenRouter LLM** (Required)
- **Time:** 5 minutes
- **Cost:** Pay-as-you-go (recommended: $10-50/month)
- **Steps:**
  ```
  1. Go to https://openrouter.ai
  2. Sign up with email
  3. Go to API Keys
  4. Create new API key
  5. Add payment method
  6. Set budget limit (e.g., $50/month)
  ```
- **Credentials:** `OPENROUTER_API_KEY`

### 4. **GitHub Repository** (Required)
- **Time:** 5 minutes
- **Cost:** Free
- **Steps:**
  ```
  1. Go to https://github.com/new
  2. Repository name: hustlebot-v2
  3. Description: [pre-filled in setup-env.sh]
  4. Make it public
  5. Click "Create repository"
  6. Run: git push -u origin main
  ```
- **Credential:** Git remote already configured

### 5. **Render Deployment** (Required)
- **Time:** 10 minutes
- **Cost:** Free tier (with limits)
- **Steps:**
  ```
  1. Go to https://render.com
  2. Sign up (use GitHub or email)
  3. New Web Service
  4. Connect GitHub repo (hustlebot-v2)
  5. Configure:
     - Environment: Node
     - Build: npm install
     - Start: npm start
  6. Add environment variables from .env
  ```
- **Result:** Production URL like `https://hustlebot-v2.onrender.com`

---

## 🔑 Environment Variables

The `setup-env.sh` script creates a `.env` file with:

```env
# Essential (Required)
TELEGRAM_BOT_TOKEN=...           # Telegram bot token
OPENROUTER_API_KEY=...           # OpenRouter API key
SUPABASE_URL=...                 # Supabase project URL
SUPABASE_KEY=...                 # Supabase anon key
SUPABASE_SERVICE_KEY=...         # Supabase service key

# Configuration
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Optional
DEEPGRAM_API_KEY=...             # Speech-to-text
AWS_ACCESS_KEY_ID=...            # S3 storage
STRIPE_SECRET_KEY=...            # Payment processing

# Feature Flags
ENABLE_VOICE_INPUT=true
ENABLE_IMAGE_GENERATION=true
ENABLE_LEAD_GENERATION=true
ENABLE_LANDING_PAGE_BUILDER=true
ENABLE_EMAIL_AUTOMATION=true

# Budget
MONTHLY_BUDGET=100
TRACK_SPEND=true
```

⚠️ **Security:** Never commit `.env` to git. The `.gitignore` is already configured.

---

## 📊 Deployment Workflow

```
┌─────────────────────────────────────────────────────────┐
│                  setup-env.sh                           │
│         (Collect credentials interactively)             │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │ Creates .env file            │
        │ With all credentials         │
        └──────────────┬───────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   deploy.sh                             │
│  (Automated deployment with validation & testing)      │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │ 1. Validate environment      │
        │ 2. Run tests                 │
        │ 3. Lint code                 │
        │ 4. Database migrations       │
        │ 5. Push to GitHub            │
        │ 6. Deploy to Render          │
        │ 7. Health check              │
        └──────────────┬───────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │ 🚀 Production Live!          │
        │ https://hustlebot-v2.onrender.com
        └──────────────────────────────┘
```

---

## ✅ Verification Checklist

After deployment, verify everything works:

```bash
# 1. Check GitHub repository
git log --oneline | head -5

# 2. Test local server
npm run dev
curl http://localhost:3000/health

# 3. Verify Supabase connection
npm run test:db

# 4. Test Telegram bot
# Send a message to @hustlebot_v2_bot

# 5. Check production deployment
curl https://hustlebot-v2.onrender.com/health

# 6. Monitor Render logs
# Visit: https://render.com/dashboard
```

---

## 🛠️ Troubleshooting

### Issue: `.env file not found`
```bash
# Run setup wizard
./setup-env.sh
```

### Issue: `npm install` fails
```bash
# Clear npm cache and retry
npm cache clean --force
npm install
```

### Issue: Database migration fails
```bash
# Check Supabase credentials
echo $SUPABASE_URL
echo $SUPABASE_KEY

# Try migration again
npm run db:migrate
```

### Issue: Telegram bot not responding
```bash
# Verify token is correct
echo $TELEGRAM_BOT_TOKEN

# Check Render logs
# Dashboard → Service → Logs
```

### Issue: Deployment stuck
```bash
# Cancel current deployment
# Click "Cancel Deploy" in Render dashboard

# Check logs for errors
npm run dev  # Test locally first

# Re-deploy
./deploy.sh production
```

---

## 📈 Post-Deployment

### 1. Monitor Performance
```bash
# View Render logs
# Dashboard → Service Logs

# Monitor API usage
# OpenRouter → Activity
# Telegram → Bot statistics
```

### 2. Set Up Monitoring
```bash
# Optional: Add error tracking
# npm install @sentry/node

# Optional: Add performance monitoring
# npm install datadog
```

### 3. Scaling
- **Free tier limit reached?** Switch to paid Render plan
- **Need more database capacity?** Upgrade Supabase plan
- **API rate limits?** Increase OpenRouter budget

### 4. Security
- Rotate API keys every 3 months
- Monitor API usage for unusual activity
- Enable 2FA on all service accounts
- Keep dependencies updated

---

## 📞 Support & Documentation

### Service Documentation
- **Telegram Bot API:** https://core.telegram.org/bots/api
- **Supabase Docs:** https://supabase.com/docs
- **OpenRouter Docs:** https://openrouter.ai/docs
- **Render Docs:** https://render.com/docs

### Troubleshooting
- **Render Status:** https://www.renderstatus.com
- **OpenRouter Status:** https://status.openrouter.ai
- **Supabase Status:** https://status.supabase.com

---

## 🎓 Learning Resources

### HustleBot v2 Internals
- **Server Architecture:** `src/server.js`
- **Agent System:** `src/agents/`
- **Database Schema:** `scripts/migrate.js`
- **Telegram Handler:** `src/telegram/handler.js`
- **LLM Integration:** `src/llm/openrouter.js`

### Running Examples
```bash
# Development with hot-reload
npm run dev

# Production mode
npm start

# Run specific agent
node src/agents/orchestrator.js

# Database migrations
npm run db:migrate

# Test suite
npm test

# Linting
npm run lint
```

---

## 🔐 Security Notes

⚠️ **CRITICAL:**
1. **Never** commit `.env` to git
2. **Never** share API keys or tokens
3. **Always** use environment variables in production
4. **Rotate** keys every 3 months
5. **Monitor** API usage for unauthorized access
6. **Enable** 2FA on all service accounts

### Secure Credential Management
```bash
# Verify .env is in .gitignore
grep ".env" .gitignore

# Check no credentials are exposed
git log --all -p | grep -i "token\|key\|secret" || echo "No secrets found"
```

---

## 📝 Customization

### Modify Features
Edit `src/agents/` to add custom agents
Edit `src/tools/` to add new tools
Edit `.env` to enable/disable features

### Customize Telegram Commands
Edit `src/telegram/handler.js`
Update command handlers
Deploy: `./deploy.sh production`

### Add API Endpoints
Edit `src/server.js`
Add Express routes
Deploy: `./deploy.sh production`

---

## 🎯 Common Tasks

### Deploy a new version
```bash
git add .
git commit -m "Feature: description"
./deploy.sh production
```

### Update dependencies
```bash
npm update
npm audit fix
./deploy.sh production
```

### Check production logs
```bash
# Visit: https://render.com/dashboard
# Select hustlebot-v2 service
# Click Logs tab
```

### Rollback to previous version
```bash
git log --oneline        # Find commit
git revert COMMIT_HASH   # Create revert commit
./deploy.sh production   # Re-deploy
```

---

## 📊 Cost Breakdown

| Service | Free Tier | Recommended | Notes |
|---------|-----------|-------------|-------|
| **Telegram** | ✅ Free | N/A | No cost |
| **Supabase** | 500MB DB | Pay-as-you-go | $25+/month |
| **OpenRouter** | No free tier | $10-50/month | Pay-per-API-call |
| **Render** | Free | Pro ($7/mo) | Free tier has 15 min inactivity limit |
| **GitHub** | ✅ Free | ✅ Free | Unlimited public repos |
| **AWS S3** | 1 year free | $1-5/month | Per GB storage |
| **TOTAL** | ~$0/month | ~$40-70/month | Scales with usage |

---

## 🎉 You're Ready!

Everything is set up for production deployment. To get started:

```bash
# 1. Collect credentials
./setup-env.sh

# 2. Deploy
./deploy.sh production

# 3. Monitor
# Visit: https://hustlebot-v2.onrender.com
# Check: https://render.com/dashboard
```

**Deployment Time:** ~10 minutes from running the script

**Questions?** See AUTOMATION-SETUP-GUIDE.md for detailed instructions.

---

**Setup completed on:** August 12, 2026  
**Ready for:** Production deployment  
**Support:** See documentation links above
