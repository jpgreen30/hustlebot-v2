# HustleBot v2 - Windows Setup Guide

**Platform:** Windows 10/11  
**Terminal:** PowerShell or Command Prompt  
**Time:** 45-60 minutes

---

## 🚀 Quick Start (3 Commands)

### Step 1: Run Setup Wizard
```powershell
.\setup-env.bat
```

### Step 2: Install Dependencies & Test
```powershell
npm install
npm run dev
```

### Step 3: Deploy to Production
```powershell
.\deploy.bat production
```

**Result:** 🎉 Live at https://hustlebot-v2.onrender.com

---

## 📋 Files Created for Windows

| File | Purpose |
|------|---------|
| **setup-env.bat** | Interactive credential wizard (Windows) |
| **deploy.bat** | Automated deployment (Windows) |
| AUTOMATION-SETUP-GUIDE.md | Detailed step-by-step guide |
| QUICK-SETUP-CHECKLIST.md | Fast-track checklist |
| AUTOMATION-README.md | Complete documentation |

---

## ✅ Windows Prerequisites

Make sure you have installed:

- ✅ **Node.js 18+** (https://nodejs.org)
  ```powershell
  node --version
  npm --version
  ```

- ✅ **Git for Windows** (https://git-scm.com/download/win)
  ```powershell
  git --version
  ```

- ✅ **PowerShell or Command Prompt** (built-in on Windows)

---

## 🎯 Step-by-Step Setup

### **Phase 1: Collect Credentials (15 minutes)**

#### Open PowerShell or Command Prompt
1. Press `Win + R`
2. Type `powershell` or `cmd`
3. Navigate to your HustleBot folder:
   ```powershell
   cd C:\Users\[YourUsername]\OneDrive\Desktop\hustlebot-v2\hustlebot-v2
   ```

#### Run the Setup Wizard
```powershell
.\setup-env.bat
```

The script will prompt you for:

**Telegram Bot Token:**
- Open Telegram
- Search for @BotFather
- Send `/newbot`
- Create bot named "HustleBot v2"
- Copy the API token
- Paste when prompted

**Supabase Credentials:**
- Visit https://supabase.com/dashboard
- Create new project: "hustlebot-v2"
- Wait for initialization (2-3 minutes)
- Go to Settings → API
- Copy: Project URL, Anon Key, Service Role Key
- Paste when prompted

**OpenRouter API Key:**
- Visit https://openrouter.ai
- Sign up
- Go to API Keys
- Create new key
- Add payment method
- Copy API key
- Paste when prompted

**Server Settings:**
- Node Environment: `production`
- Port: `3000`
- Log Level: `info`

**Feature Flags:**
- Voice Input: `y` (recommended)
- Image Generation: `y` (recommended)
- Lead Generation: `y` (recommended)
- Landing Page Builder: `y` (recommended)
- Email Automation: `y` (recommended)

**Budget:**
- Monthly Budget: `100` (USD)
- Track Spending: `y` (yes)

#### Result
✅ `.env` file created with all credentials

---

### **Phase 2: Local Testing (10 minutes)**

#### Install Dependencies
```powershell
npm install
```
Wait for npm to finish installing all packages.

#### Run Database Migrations
```powershell
npm run db:migrate
```

#### Start Development Server
```powershell
npm run dev
```

You should see:
```
Server running on http://localhost:3000
```

#### Test in Another Terminal
```powershell
# Open a new PowerShell window
curl http://localhost:3000/health
```

Should return: `{"status":"ok"}`

#### Test Telegram Bot
- Open Telegram
- Send a message to @hustlebot_v2_bot
- You should get a response

#### Stop the Server
```powershell
# Press Ctrl+C in the terminal running npm run dev
```

✅ Everything works locally!

---

### **Phase 3: GitHub Setup (5 minutes)**

#### Create GitHub Repository (Manual)
1. Visit https://github.com/new
2. Fill in:
   - **Owner:** jpgreen30
   - **Repository name:** hustlebot-v2
   - **Visibility:** Public
   - **Add .gitignore:** Node
   - **License:** MIT
3. Click **Create repository**

#### Push Code to GitHub
```powershell
git branch -M main
git push -u origin main
```

✅ Code is now on GitHub!

---

### **Phase 4: Production Deployment (15 minutes)**

#### Run the Deployment Script
```powershell
.\deploy.bat production
```

This will automatically:
- ✅ Validate all credentials
- ✅ Install dependencies
- ✅ Run tests
- ✅ Run linting
- ✅ Run database migrations
- ✅ Push code to GitHub
- ✅ Display deployment information

#### Deploy to Render (Manual)
1. Visit https://render.com/dashboard
2. Create new Web Service
3. Connect GitHub (select hustlebot-v2 repo)
4. Configure:
   - **Environment:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
5. Add Environment Variables from your `.env` file
6. Click Deploy

#### Verify Deployment
```powershell
# After deployment completes (5-10 minutes)
curl https://hustlebot-v2.onrender.com/health
```

✅ Production is live!

---

## 🔧 Troubleshooting Windows-Specific Issues

### Issue: Script won't run ("not recognized")
```powershell
# Try running with full path
C:\Users\[YourUsername]\OneDrive\Desktop\hustlebot-v2\hustlebot-v2\setup-env.bat

# Or make sure you're in the right directory
cd path\to\hustlebot-v2
```

### Issue: npm not found
```powershell
# Install Node.js from https://nodejs.org
# Restart PowerShell/Command Prompt
# Verify installation:
node --version
npm --version
```

### Issue: "Access Denied" when running script
```powershell
# Right-click PowerShell
# Select "Run as Administrator"
# Then run the script again
```

### Issue: .env file not being read
```powershell
# Verify .env file exists
dir .env

# Check contents
type .env

# Should show all your credentials
```

### Issue: Git command not found
```powershell
# Install Git for Windows:
# https://git-scm.com/download/win

# After installation, restart PowerShell
git --version
```

### Issue: npm install fails
```powershell
# Clear npm cache
npm cache clean --force

# Try again
npm install

# If still fails, check internet connection
ping npm.org
```

---

## 📊 Verification Checklist

- [ ] Node.js installed (`node --version`)
- [ ] npm installed (`npm --version`)
- [ ] Git installed (`git --version`)
- [ ] `.env` file created with credentials
- [ ] `npm install` completed
- [ ] `npm run dev` starts server
- [ ] Health check works locally (`curl http://localhost:3000/health`)
- [ ] Telegram bot responds
- [ ] GitHub repo created and code pushed
- [ ] Render service deployed
- [ ] Production health check works

---

## 🎯 Common Commands

```powershell
# Navigate to project
cd C:\Users\YourUsername\OneDrive\Desktop\hustlebot-v2\hustlebot-v2

# Setup credentials
.\setup-env.bat

# Install dependencies
npm install

# Run database migrations
npm run db:migrate

# Start development server
npm run dev

# Run tests
npm test

# Run linter
npm run lint

# Deploy to production
.\deploy.bat production

# Check git status
git status

# Push to GitHub
git push

# View environment variables
type .env

# Check if port 3000 is in use
netstat -ano | findstr :3000
```

---

## 🔒 Security Notes for Windows

- ✅ `.env` file is in `.gitignore` (won't be committed)
- ✅ Never share `.env` file
- ✅ Don't commit API keys to GitHub
- ✅ Keep credentials private
- ✅ Use environment variables in production (Render handles this)

---

## 📱 Testing After Deployment

### Test Health Endpoint
```powershell
curl https://hustlebot-v2.onrender.com/health
```

### Test Telegram Bot
1. Open Telegram
2. Find your bot: @hustlebot_v2_bot
3. Send a message
4. Bot should respond

### View Production Logs
1. Go to https://render.com/dashboard
2. Select "hustlebot-v2" service
3. Click "Logs" tab
4. Watch for incoming messages

---

## 🆘 Need Help?

**Setup Issues:**
- Run `.\setup-env.bat` again
- Check AUTOMATION-SETUP-GUIDE.md for detailed steps

**Deployment Issues:**
- Check Render logs: https://render.com/dashboard
- Verify all environment variables are set
- Check if service is "Live" status

**Git Issues:**
- Verify git config: `git config --list`
- Check remote: `git remote -v`
- Ensure GitHub repo is created

**Service Issues:**
- Check Telegram token in .env
- Verify Supabase credentials
- Check OpenRouter API credits
- Monitor Render service status

---

## ✨ You're Ready!

Everything is set up for Windows. Just run:

```powershell
.\setup-env.bat
.\deploy.bat production
```

**Your production deployment is ready! 🚀**

---

**Windows Version:** August 12, 2026  
**Status:** Ready for production  
**Support:** See AUTOMATION-SETUP-GUIDE.md and AUTOMATION-README.md
