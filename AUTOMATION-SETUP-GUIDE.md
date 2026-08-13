# HustleBot v2 - Complete Automation Setup Guide

**Last Updated:** August 12, 2026  
**Status:** Production-Ready Deployment Guide

---

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Step 1: GitHub Setup](#step-1-github-setup)
3. [Step 2: Supabase Database Setup](#step-2-supabase-database-setup)
4. [Step 3: OpenRouter API Setup](#step-3-openrouter-api-setup)
5. [Step 4: Telegram Bot Setup](#step-4-telegram-bot-setup)
6. [Step 5: Render Deployment Setup](#step-5-render-deployment-setup)
7. [Step 6: Environment Configuration](#step-6-environment-configuration)
8. [Step 7: Production Deployment](#step-7-production-deployment)
9. [Verification Checklist](#verification-checklist)

---

## Prerequisites

- Node.js >=18.0.0 installed
- Git configured locally
- Active Gmail account: **jpgreen1@gmail.com**
- Telegram account with access to BotFather
- Modern web browser

**Verified Local Setup:**
✅ Git repository initialized at: `/home/claude/hustlebot-v2`
✅ Git user configured: Claude Automation <jpgreen1@gmail.com>
✅ Git remote configured: https://github.com/jpgreen30/hustlebot-v2.git

---

## Step 1: GitHub Setup

### 1.1 Manual GitHub Repository Creation

1. Go to **https://github.com/new**
2. Fill in the form:
   - **Owner:** jpgreen30
   - **Repository name:** hustlebot-v2
   - **Description:** AI-powered business automation platform - builds landing pages, generates leads, creates content, and automates workflows with autonomous agents
   - **Visibility:** Public
   - **Add .gitignore:** Node
   - **License:** MIT
3. Click **Create repository**

### 1.2 Push Code to GitHub

Once the GitHub repo is created, run this command:

```bash
cd /path/to/hustlebot-v2
git branch -M main
git push -u origin main
```

**Expected Output:**
```
Enumerating objects: 38, done.
Counting objects: 100% (38/38), done.
...
 * [new branch]      main -> main
Branch 'main' set up to track remote branch 'main' from 'origin'.
```

---

## Step 2: Supabase Database Setup

### 2.1 Create Supabase Project

1. Go to **https://supabase.com/dashboard**
2. Sign up or log in with **jpgreen1@gmail.com**
3. Click **New project**
4. Fill in:
   - **Name:** hustlebot-v2
   - **Database Password:** Generate a strong password (save it!)
   - **Region:** us-east-1 (closest to your location)
5. Click **Create new project**

### 2.2 Wait for Project Initialization

Supabase will initialize the database (takes 2-3 minutes). Once done:

1. Go to **Project Settings → API**
2. Copy these values (you'll need them in .env):
   ```
   SUPABASE_URL = [URL shown under "Project URL"]
   SUPABASE_KEY = [Anon key under "Anon (public)"]
   SUPABASE_SERVICE_KEY = [Service role key under "Service role (secret)"]
   ```

### 2.3 Initialize Database Schema

Run this command to set up tables:

```bash
npm run db:migrate
```

This will create:
- users table
- projects table
- leads table
- content table
- automation_jobs table
- subscriptions table

---

## Step 3: OpenRouter API Setup

### 3.1 Create OpenRouter Account

1. Go to **https://openrouter.ai**
2. Click **Sign in** → **Create account**
3. Sign up with **jpgreen1@gmail.com**
4. Verify your email

### 3.2 Get API Key

1. Go to **https://openrouter.ai/keys**
2. Click **Create new API key**
3. Name it: "hustlebot-v2"
4. Copy the API key and save it

**You'll need:**
```
OPENROUTER_API_KEY = [your-api-key]
OPENROUTER_BASE_URL = https://openrouter.ai/api/v1
```

### 3.3 Set Up Credits/Billing

1. Go to **OpenRouter Dashboard**
2. Add payment method
3. Set monthly budget limit (recommended: $50-100)

---

## Step 4: Telegram Bot Setup

### 4.1 Create Bot with BotFather

1. Open Telegram
2. Search for **@BotFather**
3. Send `/newbot`
4. Follow the prompts:
   - **Name:** HustleBot v2
   - **Username:** hustlebot_v2_bot (or similar)
5. BotFather will send you the API token

**Save this value:**
```
TELEGRAM_BOT_TOKEN = [token-from-botfather]
```

### 4.2 Enable Webhook (Optional)

For production, enable webhook instead of polling:

1. Send `/setcommands` to BotFather
2. Send `/setdefault_administrator_rights` to enable admin features
3. Your Render deployment URL will become: `https://your-render-url.onrender.com/telegram`

---

## Step 5: Render Deployment Setup

### 5.1 Create Render Account

1. Go to **https://render.com**
2. Click **Sign up**
3. Use GitHub account (use email if GitHub has issues)
4. Complete verification

### 5.2 Connect GitHub Repository

1. Go to **Dashboard → New** → **Web Service**
2. Select **GitHub**
3. Connect your GitHub account
4. Select the **hustlebot-v2** repository
5. Configure:
   - **Name:** hustlebot-v2
   - **Environment:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Plan:** Free (or Pro for production)

### 5.3 Add Environment Variables

In Render dashboard, go to **Environment** and add all variables from Step 6.

---

## Step 6: Environment Configuration

### 6.1 Create .env File

Create a `.env` file in your project root with all the credentials you've gathered:

```bash
# Essential Services
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_from_botfather
OPENROUTER_API_KEY=your_openrouter_api_key
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_role_key

# Optional but Recommended Services
DEEPGRAM_API_KEY=your_deepgram_api_key
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_VOICE_ID=default_voice_id

# Stripe (for payments)
STRIPE_SECRET_KEY=sk_test_your_stripe_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_key

# AWS S3 (for file storage)
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=hustlebot-assets

# Redis (for caching)
REDIS_URL=redis://localhost:6379

# Server Configuration
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Feature Flags
ENABLE_VOICE_INPUT=true
ENABLE_IMAGE_GENERATION=true
ENABLE_LEAD_GENERATION=true
ENABLE_LANDING_PAGE_BUILDER=true
ENABLE_EMAIL_AUTOMATION=true

# Budget & Tracking
MONTHLY_BUDGET=100
BUDGET_CURRENCY=USD
TRACK_SPEND=true
```

### 6.2 Validation

Check that your .env file is complete:

```bash
# Verify essential variables are set
grep -E "TELEGRAM_BOT_TOKEN|OPENROUTER_API_KEY|SUPABASE_URL" .env
```

---

## Step 7: Production Deployment

### 7.1 Deploy to Render

1. Commit your .env changes (add .env to .gitignore first!):
   ```bash
   echo ".env" >> .gitignore
   git add .gitignore
   git commit -m "Add .env to gitignore"
   git push
   ```

2. Render will automatically detect the push and deploy

### 7.2 Monitor Deployment

1. Go to **Render Dashboard**
2. Select **hustlebot-v2** service
3. Watch **Logs** tab for deployment progress
4. Once deployed, you'll see a URL like: `https://hustlebot-v2.onrender.com`

### 7.3 Test the Deployment

```bash
# Test the health check endpoint
curl https://your-render-url.onrender.com/health

# Test Telegram webhook
curl -X POST https://your-render-url.onrender.com/telegram \
  -H "Content-Type: application/json" \
  -d '{"update_id": 1}'
```

---

## Verification Checklist

Before going live, verify each component:

- [ ] **GitHub**: Repository created and all code pushed
  ```bash
  git log --oneline | head -5
  ```

- [ ] **Supabase**: Database initialized with tables
  ```bash
  npm run db:migrate
  ```

- [ ] **OpenRouter**: API key working
  ```bash
  curl https://openrouter.ai/api/v1/models -H "Authorization: Bearer YOUR_KEY"
  ```

- [ ] **Telegram**: Bot responding
  - Send a message to @hustlebot_v2_bot
  - Check Telegram logs for incoming message

- [ ] **Render**: Service running
  ```bash
  curl https://your-render-url.onrender.com/health
  ```

- [ ] **.env file**: All variables present
  ```bash
  cat .env | wc -l  # Should have 30+ lines
  ```

---

## Troubleshooting

### Service Not Starting

```bash
# Check local logs
npm run dev

# Check Render logs
# Go to Render dashboard → Select service → Logs tab
```

### Database Connection Issues

```bash
# Verify Supabase credentials
echo $SUPABASE_URL
echo $SUPABASE_KEY

# Test connection
npm run test:db
```

### Telegram Bot Not Responding

1. Verify `TELEGRAM_BOT_TOKEN` is correct
2. Check webhook URL is publicly accessible
3. Ensure Render service is running

### OpenRouter Rate Limiting

- Check API key has credits
- Monitor usage: https://openrouter.ai/activity
- Adjust budget limits if needed

---

## Security Notes

⚠️ **IMPORTANT:**
- Never commit `.env` to git
- Store sensitive keys securely
- Use environment variables in production (Render handles this)
- Rotate API keys periodically
- Monitor API usage for unauthorized access

---

## Next Steps After Deployment

1. **Monitor Performance**
   - Set up error tracking (Sentry)
   - Monitor API costs
   - Track Telegram bot usage

2. **Scaling**
   - Switch to paid Render plan if needed
   - Set up database backups
   - Configure auto-scaling

3. **Maintenance**
   - Update dependencies monthly
   - Monitor security advisories
   - Scale resources based on usage

---

## Support

For issues or questions:
- **Supabase Docs**: https://supabase.com/docs
- **OpenRouter Docs**: https://openrouter.ai/docs
- **Render Docs**: https://render.com/docs
- **Telegram Bot API**: https://core.telegram.org/bots/api

---

**Setup Time:** ~45 minutes  
**Skill Required:** Intermediate (CLI familiarity helpful)  
**Cost:** Free to $50/month depending on usage
