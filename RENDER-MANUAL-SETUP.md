# HustleBot v2 - Render Manual Setup (5 Minutes)

**Status:** Ready to Deploy  
**Time Required:** 5 minutes  
**What you'll do:** Connect GitHub to Render via dashboard  
**After this:** Everything auto-deploys!

---

## 🚀 Quick Setup

### Step 1: Go to Render Dashboard (30 seconds)
1. Visit: **https://dashboard.render.com**
2. Sign in (or create account)
3. Click **"New +"** button
4. Select **"Web Service"**

### Step 2: Connect GitHub (1 minute)
1. Click **"Connect Repository"**
2. Select: **jpgreen30/hustlebot-v2**
3. Click **"Connect"**

### Step 3: Configure Service (2 minutes)
Fill in these fields:

| Field | Value |
|-------|-------|
| **Name** | `hustlebot-v2` |
| **Environment** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Plan** | Free (or Pro $7/mo) |
| **Region** | US |

### Step 4: Add Environment Variables (2 minutes)
Scroll down and click **"Add Environment Variable"**

Add these (copy from your .env file):

```
TELEGRAM_BOT_TOKEN = [YOUR_BOT_TOKEN]

OPENROUTER_API_KEY = [YOUR_OPENROUTER_KEY]

SUPABASE_URL = [YOUR_SUPABASE_URL]

SUPABASE_KEY = [YOUR_SUPABASE_KEY]

SUPABASE_SERVICE_KEY = [YOUR_SUPABASE_SERVICE_KEY]

NODE_ENV = production

PORT = 3000
```

### Step 5: Deploy (30 seconds)
1. Scroll to bottom
2. Click **"Create Web Service"**
3. Render starts building automatically

---

## ⏱️ What Happens Next

```
Click Create
    ↓
Render pulls from GitHub
    ↓
npm install runs (2-3 min)
    ↓
npm start runs (30 sec)
    ↓
🎉 Live at https://hustlebot-v2.onrender.com
```

---

## ✅ Verify It Works

### Check Status
Visit: https://dashboard.render.com  
Look for **hustlebot-v2** → Status should be **"Live"**

### Test Health
```
curl https://hustlebot-v2.onrender.com/health
```

### Test Telegram Bot
Send message to: @hustlebot_v2_bot  
Bot should respond from production

---

## 📊 Deployment Flow

```
Your GitHub Repo (hustlebot-v2)
           ↓
  [Render Dashboard]
  Click: Web Service
  Connect: GitHub
  Config: npm install/start
  Env Vars: [your credentials]
           ↓
  Click: Create Web Service
           ↓
[Render Builds & Deploys]
  - npm install (auto)
  - npm start (auto)
  - Tests pass (auto)
           ↓
🚀 Live on Render!
https://hustlebot-v2.onrender.com
```

---

## 🎯 5-Step Checklist

- [ ] Go to https://dashboard.render.com
- [ ] Click "New Web Service"
- [ ] Connect GitHub repo (jpgreen30/hustlebot-v2)
- [ ] Fill in config (name, commands, plan)
- [ ] Add environment variables from above
- [ ] Click "Create Web Service"
- [ ] Wait 5-10 minutes for build
- [ ] Visit https://hustlebot-v2.onrender.com/health
- [ ] Test Telegram bot

---

## 🆘 Troubleshooting

### Build fails with "npm not found"
- Error: "Command not found: npm"
- Solution: Make sure Build Command is `npm install`

### Port error
- Error: "Port 3000 already in use"
- Solution: Ensure PORT environment variable is set to `3000`

### Service times out
- Error: "Build exceeded timeout"
- Solution: This means npm install is taking too long
  - Retry the build via dashboard
  - Or upgrade to Pro plan

### Telegram bot not responding
- Check TELEGRAM_BOT_TOKEN in environment
- Verify it's exactly as shown above
- Restart service via dashboard

---

## 💡 That's It!

After these 5 minutes, your HustleBot v2 is live in production! 🎉

**Next steps:**
- Monitor at: https://dashboard.render.com
- Logs view: Click service → Logs tab
- Auto-updates: Push to GitHub → Auto-redeploys

---

**Time to production: 5 minutes (manual setup) + 10 minutes (build)**  
**Total: ~15 minutes**
