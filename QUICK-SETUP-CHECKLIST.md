# HustleBot v2 - Quick Setup Checklist

**Estimated Time: 45-60 minutes**  
**Difficulty: Intermediate**  
**Date: August 12, 2026**

---

## 📋 Pre-Deployment Checklist

Before you start, make sure you have:

- [ ] Node.js 18+ installed
- [ ] Git installed and configured
- [ ] Gmail account (jpgreen1@gmail.com)
- [ ] Telegram app with BotFather access
- [ ] Web browser for account setup
- [ ] ~$10-50 for API credits

---

## 🚀 Phase 1: Environment Setup (15 minutes)

### Step 1: Make setup script executable
```bash
chmod +x setup-env.sh
```
- [ ] Script is executable

### Step 2: Run the interactive wizard
```bash
./setup-env.sh
```

The wizard will prompt you for:

#### Telegram Bot
- [ ] Open Telegram → Search @BotFather
- [ ] Send `/newbot`
- [ ] Name your bot: **HustleBot v2**
- [ ] Username: **hustlebot_v2_bot** (or similar)
- [ ] Copy the API token
- [ ] Paste token when prompted by setup-env.sh

#### Supabase Database
- [ ] Visit https://supabase.com/dashboard
- [ ] Create new project
- [ ] Name: **hustlebot-v2**
- [ ] Set database password (save it!)
- [ ] Wait for initialization (2-3 minutes)
- [ ] Go to Settings → API
- [ ] Copy **Project URL**
- [ ] Copy **Anon (public) key**
- [ ] Copy **Service role (secret) key**
- [ ] Paste all three when prompted

#### OpenRouter LLM
- [ ] Visit https://openrouter.ai
- [ ] Sign up with email
- [ ] Go to API Keys section
- [ ] Create new API key
- [ ] Add payment method
- [ ] Set monthly budget ($10-50 recommended)
- [ ] Copy API key
- [ ] Paste when prompted

#### Optional Services
- [ ] (Optional) Add Deepgram for voice transcription
- [ ] (Optional) Add ElevenLabs for text-to-speech
- [ ] (Optional) Add other services

### Step 3: Configure server settings
- [ ] Node Environment: **production**
- [ ] Port: **3000** (or your preference)
- [ ] Log Level: **info**

### Step 4: Enable/disable features
- [ ] Voice Input: ✅ (recommended)
- [ ] Image Generation: ✅ (recommended)
- [ ] Lead Generation: ✅ (recommended)
- [ ] Landing Page Builder: ✅ (recommended)
- [ ] Email Automation: ✅ (recommended)

### Step 5: Set budget
- [ ] Monthly Budget: **$100** (adjust as needed)
- [ ] Currency: **USD**
- [ ] Track Spending: **Yes**

### Step 6: Verify .env file
```bash
ls -la .env
cat .env | grep TELEGRAM_BOT_TOKEN  # Should show token
```
- [ ] .env file created
- [ ] All required variables present
- [ ] No empty values for critical services

**✅ Phase 1 Complete:** You should now have a `.env` file with all credentials!

---

## 🔧 Phase 2: Local Testing (10 minutes)

### Step 1: Install dependencies
```bash
npm install
```
- [ ] npm install completes successfully
- [ ] node_modules folder created

### Step 2: Run database migrations
```bash
npm run db:migrate
```
- [ ] Database migration completes
- [ ] Tables created in Supabase

### Step 3: Test server locally
```bash
npm run dev
```
- [ ] Server starts on http://localhost:3000
- [ ] No error messages in console
- [ ] Server listens to port 3000

### Step 4: Test health endpoint
```bash
# In another terminal:
curl http://localhost:3000/health
```
- [ ] Returns status: "ok" or similar
- [ ] HTTP 200 response

### Step 5: Test Telegram integration
- [ ] Open Telegram
- [ ] Search for your bot: @hustlebot_v2_bot
- [ ] Send a test message
- [ ] Check console for incoming message

### Step 6: Stop local server
```bash
# Press Ctrl+C in terminal running npm run dev
```
- [ ] Server stops cleanly

**✅ Phase 2 Complete:** Everything works locally!

---

## 📤 Phase 3: GitHub Setup (5 minutes)

### Step 1: Create GitHub repository
- [ ] Visit https://github.com/new
- [ ] Owner: **jpgreen30**
- [ ] Repository name: **hustlebot-v2**
- [ ] Description: (pre-filled by system)
- [ ] Visibility: **Public**
- [ ] Add .gitignore: **Node**
- [ ] Add license: **MIT**
- [ ] Click **Create repository**

### Step 2: Push code to GitHub
```bash
git branch -M main
git push -u origin main
```
- [ ] Code pushed successfully
- [ ] All files visible on GitHub
- [ ] No errors during push

### Step 3: Verify on GitHub
- [ ] Visit https://github.com/jpgreen30/hustlebot-v2
- [ ] All project files visible
- [ ] README.md displayed
- [ ] Commit history visible

**✅ Phase 3 Complete:** Code is on GitHub!

---

## 🚀 Phase 4: Production Deployment (15 minutes)

### Step 1: Make deploy script executable
```bash
chmod +x deploy.sh
```
- [ ] Script is executable

### Step 2: Run automated deployment
```bash
./deploy.sh production
```

The script will automatically:
- [ ] Validate Node.js and npm
- [ ] Check .env file exists
- [ ] Verify required environment variables
- [ ] Install dependencies
- [ ] Run tests
- [ ] Run linting
- [ ] Run database migrations
- [ ] Push code to GitHub
- [ ] Deploy to Render
- [ ] Verify deployment with health check

### Step 3: Monitor deployment in Render
- [ ] Visit https://render.com/dashboard
- [ ] Select **hustlebot-v2** service
- [ ] Watch **Logs** tab
- [ ] Wait for **"Live"** status

### Step 4: Test production deployment
```bash
# Once deployment completes, test the URL
curl https://hustlebot-v2.onrender.com/health
```
- [ ] Returns successful response
- [ ] HTTP 200 status code
- [ ] Service shows as "Live" in Render

### Step 5: Test production Telegram bot
- [ ] Open Telegram
- [ ] Send message to @hustlebot_v2_bot
- [ ] Receive response from production server
- [ ] Check Render logs for activity

**✅ Phase 4 Complete:** Production is live!

---

## ✅ Final Verification Checklist

### GitHub
- [ ] Repository created at https://github.com/jpgreen30/hustlebot-v2
- [ ] All files pushed
- [ ] Commit history visible
- [ ] README displayed

### Supabase
- [ ] Project created at supabase.com
- [ ] Database initialized
- [ ] All tables created (users, projects, leads, etc.)
- [ ] Credentials in .env file

### OpenRouter
- [ ] Account created
- [ ] API key generated
- [ ] Payment method added
- [ ] Budget limit set
- [ ] Credentials in .env file

### Telegram Bot
- [ ] Bot created via BotFather
- [ ] Token obtained
- [ ] Bot responds to messages
- [ ] Webhook configured (if using Render URL)
- [ ] Token in .env file

### Render Deployment
- [ ] Service created in Render
- [ ] Connected to GitHub
- [ ] Environment variables configured
- [ ] Deployment successful
- [ ] Service status: **Live**
- [ ] Health check passing
- [ ] Public URL accessible

### Environment Configuration
- [ ] .env file created in project root
- [ ] .env added to .gitignore
- [ ] All required variables populated
- [ ] No dummy/placeholder values
- [ ] No sensitive data in git history

### Local Development
- [ ] npm dependencies installed
- [ ] Database migrations successful
- [ ] Local server runs without errors
- [ ] Health check works locally

### Production Verification
- [ ] Production URL accessible
- [ ] Health check passing on production
- [ ] Telegram bot responds from production
- [ ] Render logs show activity
- [ ] No error messages in logs

---

## 🎉 Success Checklist

You've successfully deployed HustleBot v2 when:

✅ **GitHub:** Code is publicly available  
✅ **Database:** Supabase tables initialized  
✅ **LLM:** OpenRouter API responding  
✅ **Bot:** Telegram bot responding on Render  
✅ **Deployment:** Service live at https://hustlebot-v2.onrender.com  
✅ **Monitoring:** Logs visible in Render dashboard  

---

## 🔒 Security Checklist

Before going live:

- [ ] .env file is in .gitignore
- [ ] No credentials committed to git
- [ ] API keys are unique and strong
- [ ] No placeholder/dummy values in .env
- [ ] Render environment variables hidden
- [ ] GitHub token not exposed
- [ ] Database password changed from default
- [ ] Supabase project has backups enabled

---

## 📞 Troubleshooting Quick Reference

| Issue | Solution |
|-------|----------|
| setup-env.sh not found | Run: `chmod +x setup-env.sh` |
| npm install fails | Run: `npm cache clean --force && npm install` |
| Database migration fails | Check SUPABASE_KEY in .env |
| Telegram bot not responding | Check TELEGRAM_BOT_TOKEN in .env |
| Deployment fails | Check Render logs: `render.com/dashboard` |
| Health check fails | Wait 5 min (Render may still be deploying) |
| Can't push to GitHub | Verify git remote: `git remote -v` |

---

## 📊 Time Breakdown

| Phase | Time | Status |
|-------|------|--------|
| Phase 1: Environment Setup | 15 min | ▢ Pending |
| Phase 2: Local Testing | 10 min | ▢ Pending |
| Phase 3: GitHub Setup | 5 min | ▢ Pending |
| Phase 4: Production Deploy | 15 min | ▢ Pending |
| **Total** | **45 min** | **▢ Not Started** |

---

## 📈 Next Steps After Deployment

1. **Monitor Performance**
   ```bash
   # View logs
   render.com/dashboard → hustlebot-v2 → Logs
   
   # Monitor usage
   openrouter.ai/activity
   telegram bot statistics
   ```

2. **Set Up Alerts**
   - Render alerts for service down
   - OpenRouter alerts for high usage
   - Error tracking (Sentry)

3. **Optimize Performance**
   - Monitor API response times
   - Track database query performance
   - Analyze Telegram message latency

4. **Plan Scaling**
   - Switch Render to Pro plan if needed
   - Upgrade Supabase as database grows
   - Monitor OpenRouter costs

---

## 🆘 Need Help?

1. **Setup Issues?** See AUTOMATION-SETUP-GUIDE.md
2. **Deployment Issues?** See deploy.sh output
3. **Service Down?** Check Render dashboard
4. **API Issues?** Check service status pages:
   - OpenRouter: https://status.openrouter.ai
   - Supabase: https://status.supabase.com
   - Render: https://www.renderstatus.com

---

## ✨ You're Ready!

Everything is set up and ready to deploy. Follow the checklist above and you'll have HustleBot v2 running in production in under an hour.

**Let's go! 🚀**

```bash
chmod +x setup-env.sh deploy.sh
./setup-env.sh
./deploy.sh production
```

**Status:** Ready for deployment  
**Date:** August 12, 2026  
**Support:** AUTOMATION-README.md and AUTOMATION-SETUP-GUIDE.md
