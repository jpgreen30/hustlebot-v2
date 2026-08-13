# HustleBot v2 - Automated Render Deployment

**Status:** ✅ Fully Automated  
**Platform:** Windows, Mac, Linux  
**Time Required:** 5 minutes  
**What it does:** Creates Render service and deploys automatically

---

## 🚀 Quick Start (3 Commands)

```powershell
# 1. Setup credentials
.\setup-env.bat

# 2. Deploy to Render (fully automated)
.\render-deploy.bat

# 3. Check deployment
# Visit: https://render.com/dashboard
```

**Result:** 🎉 Live at https://hustlebot-v2.onrender.com

---

## 📋 What render-deploy.bat Does

The script fully automates:

✅ **Validates Prerequisites**
- Checks .env file exists
- Verifies all environment variables
- Confirms Git is installed

✅ **Creates Render Service**
- Uses Render API to create new service
- Connects to your GitHub repo
- Sets up build & start commands

✅ **Configures Environment**
- Sets all variables from your .env file
- Configures Node environment
- Sets port and log levels

✅ **Triggers Deployment**
- Initiates automatic build
- Starts service
- Provides monitoring URL

---

## 📝 Prerequisites

Before running `render-deploy.bat`, you need:

1. **Render Account**
   - Sign up: https://render.com
   - Free tier available

2. **Render API Key**
   - Get from: https://dashboard.render.com/api-tokens
   - Click "Create API Token"
   - Copy the token (you'll paste it in the script)

3. **GitHub Repository**
   - Code must be pushed to GitHub
   - Run `deploy.bat production` first
   - Or manually push: `git push -u origin main`

4. **Complete .env File**
   - Run `setup-env.bat` first
   - All credentials populated

---

## 🎯 Step-by-Step

### Step 1: Get Render API Key (2 minutes)

1. Go to **https://dashboard.render.com/api-tokens**
2. Sign in with your Render account
3. Click **"Create API Token"**
4. Name it: "HustleBot Deployment"
5. Click **"Create"**
6. **Copy the token** (you'll paste it next)

### Step 2: Run Automated Deployment (3 minutes)

```powershell
# Open PowerShell in your project folder
cd C:\Users\YourUsername\OneDrive\Desktop\hustlebot-v2\hustlebot-v2

# Run the deployment script
.\render-deploy.bat
```

### Step 3: Paste API Key When Prompted

When the script asks:
```
Enter your Render API key: [PASTE HERE]
```

Paste your API token and press Enter.

### Step 4: Script Does Everything

The script will:
- ✅ Validate your .env file
- ✅ Check GitHub repo
- ✅ Create Render service via API
- ✅ Set environment variables
- ✅ Start deployment
- ✅ Display deployment URL

### Step 5: Monitor Deployment

1. Go to **https://render.com/dashboard**
2. Select **hustlebot-v2** service
3. Watch the **Logs** tab
4. Wait for **"Live"** status (5-10 minutes)

---

## ✅ What Gets Deployed

### Service Configuration
```
Name:           hustlebot-v2
Environment:    Node
Build Command:  npm install
Start Command:  npm start
Region:         US (default)
Plan:           Free (initially)
```

### Environment Variables (Automated)
```
TELEGRAM_BOT_TOKEN          → From your .env
OPENROUTER_API_KEY          → From your .env
SUPABASE_URL                → From your .env
SUPABASE_KEY                → From your .env
SUPABASE_SERVICE_KEY        → From your .env
NODE_ENV                    → production
PORT                        → 3000
```

---

## 🔍 Troubleshooting

### Issue: "Render API key is required"
**Solution:**
1. Get API key from https://dashboard.render.com/api-tokens
2. Make sure to copy the full token
3. Run script again and paste it

### Issue: "API call failed"
**Solution:**
1. Verify API key is correct
2. Check you're connected to internet
3. Try manual deployment option (see below)
4. Run script and choose manual option

### Issue: Deployment stuck at "Building"
**Solution:**
1. Check logs: https://render.com/dashboard
2. Look for error messages
3. Common issues:
   - Missing environment variable
   - Invalid API key in .env
   - GitHub repo not accessible

### Issue: "Service not found" after deployment
**Solution:**
1. Wait 10-15 minutes (Render needs time to build)
2. Refresh dashboard
3. Check if service status is "Live"
4. Try health check: `curl https://hustlebot-v2.onrender.com/health`

---

## 🔄 Fallback: Manual Deployment

If the automated script fails, you can deploy manually:

1. **Go to Render Dashboard**
   - https://render.com/dashboard

2. **Create New Web Service**
   - Click "New"
   - Select "Web Service"
   - Connect GitHub (choose hustlebot-v2)

3. **Configure Service**
   - **Name:** hustlebot-v2
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free (or Pro for better performance)

4. **Add Environment Variables**
   - Click "Advanced"
   - Add each variable from .env:
     ```
     TELEGRAM_BOT_TOKEN = your_token
     OPENROUTER_API_KEY = your_key
     SUPABASE_URL = your_url
     SUPABASE_KEY = your_key
     SUPABASE_SERVICE_KEY = your_key
     NODE_ENV = production
     PORT = 3000
     ```

5. **Deploy**
   - Click "Create Web Service"
   - Render automatically builds and deploys

---

## 📊 Deployment Status

### Check Deployment Status
```powershell
# Via Render Dashboard
https://render.com/dashboard → Select Service → View Logs

# Via curl
curl https://hustlebot-v2.onrender.com/health
```

### Expected Status Flow
```
1. Creating    → Service being created
2. Building    → npm install running
3. Starting    → npm start running
4. Live        → ✅ Ready to use
```

### Common Build Errors
```
Build failed: Missing dependency
  → Solution: Run npm install locally first

Build failed: Port already in use
  → Solution: Check PORT in .env

Build failed: Invalid environment variable
  → Solution: Verify .env file has all variables
```

---

## 🎯 Testing After Deployment

### Test Health Endpoint
```powershell
curl https://hustlebot-v2.onrender.com/health
```

**Expected Response:**
```json
{"status":"ok","uptime":1234}
```

### Test Telegram Bot
1. Open Telegram
2. Find your bot: @hustlebot_v2_bot
3. Send a test message
4. Bot should respond

### View Logs
1. **Render Dashboard:** https://render.com/dashboard
2. Select **hustlebot-v2** service
3. Click **Logs** tab
4. Should show:
   ```
   Server running on port 3000
   Connected to database
   Telegram webhook ready
   ```

---

## 💰 Costs

### Free Tier
- ✅ Included: First 750 hours/month
- ✅ Included: Web services
- ⚠️ Limited: 15 minutes inactivity = spin down

### Upgrade to Pro
- **$7/month** for always-on service
- No cold starts
- Better performance
- Recommended for production

### Cost Optimization
1. Start with free tier
2. Monitor usage
3. Upgrade to Pro if needed
4. Monitor API costs on other services

---

## 🔐 Security

### Automated Process
✅ API key only used for deployment
✅ No credentials stored permanently
✅ All variables set via secure API
✅ Environment variables hidden in Render

### Best Practices
- ✅ Rotate API keys quarterly
- ✅ Keep .env file private
- ✅ Monitor API usage
- ✅ Enable 2FA on Render account

---

## 📈 After Deployment

### Immediate (Day 1)
- [ ] Verify service is live
- [ ] Test Telegram bot
- [ ] Check logs for errors
- [ ] Verify database connection

### Short-term (Week 1)
- [ ] Monitor uptime
- [ ] Check API usage
- [ ] Monitor error rate
- [ ] Set up alerts if needed

### Long-term (Month 1+)
- [ ] Upgrade to Pro plan
- [ ] Monitor performance
- [ ] Analyze metrics
- [ ] Plan scaling if needed

---

## 🆘 Need Help?

### Render Issues
- Status page: https://www.renderstatus.com
- Docs: https://render.com/docs
- Support: https://render.com/support

### HustleBot Issues
- Setup guide: AUTOMATION-SETUP-GUIDE.md
- Windows setup: WINDOWS-SETUP.md
- Documentation: AUTOMATION-README.md

### Common Questions

**Q: Can I use the free tier?**
A: Yes, but service will pause after 15 min of inactivity. Upgrade to Pro ($7/mo) for always-on.

**Q: How long does deployment take?**
A: Usually 5-10 minutes. Building npm packages takes most of the time.

**Q: What if deployment fails?**
A: Check logs in Render dashboard. Most common: missing .env variable.

**Q: Can I redeploy without running the script again?**
A: Yes. In Render dashboard, click "Manual Deploy" → "Deploy latest commit"

**Q: How do I update my bot?**
A: Edit code → `git push` → Render auto-redeploys (if you enabled it)

---

## 📋 Complete Workflow

```
You: .\setup-env.bat
    ↓
[Collect credentials]
    ↓
You: deploy.bat production
    ↓
[Push to GitHub]
    ↓
You: .\render-deploy.bat
    ↓
[Enter Render API key]
    ↓
[Script creates service]
    ↓
[Script sets environment]
    ↓
[Script triggers build]
    ↓
[Wait 5-10 minutes]
    ↓
🎉 Live at https://hustlebot-v2.onrender.com
```

---

## ✨ Summary

| Step | Time | Command |
|------|------|---------|
| Setup | 15 min | `.\setup-env.bat` |
| Deploy | 15 min | `.\deploy.bat production` |
| Render Deploy | 5 min | `.\render-deploy.bat` |
| Wait for build | 5-10 min | Monitor dashboard |
| **Total** | **40-50 min** | **Done!** |

---

**Everything is automated. Just run the scripts and watch it deploy!** 🚀

**Next Action:** Get your Render API key from https://dashboard.render.com/api-tokens, then run `.\render-deploy.bat`
