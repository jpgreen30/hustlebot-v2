# 🔧 Vercel Deployment Debugging Guide

**Status:** Serverless compatibility fixed, but deployment returning 500 errors  
**Last Updated:** August 15, 2026

---

## 🔍 Issue Analysis

The Vercel deployment at `https://hustlebot-v2.vercel.app` returns 500 errors due to serverless function initialization failures.

### Root Causes

1. **Serverless Initialization** ✅ FIXED
   - Server was calling `app.listen()` which doesn't work in Vercel's serverless environment
   - Fixed: App now detects `VERCEL` environment variable and exports the app directly

2. **Missing/Incorrect Environment Variables** ⚠️ NEEDS CHECKING
   - Vercel requires all environment variables to be set in project settings
   - Missing vars cause failures: `SUPABASE_URL`, `OPENROUTER_API_KEY`, etc.

3. **Module Resolution Issues** ⚠️ NEEDS CHECKING
   - Node modules may not be building correctly in Vercel
   - Dependency issues with large modules (Supabase, LLM providers)

4. **Cold Start Timeouts** ⚠️ POTENTIAL ISSUE
   - Initialization takes >30 seconds in some cases
   - Vercel functions have execution time limits

---

## ✅ What's Been Fixed

### Serverless Compatibility Fix
The server now properly handles Vercel's serverless environment:

```javascript
if (isVercel) {
  // Initialize but don't listen
  server.initialize().catch(err => {
    logger.error('Failed to initialize for Vercel:', err);
    process.exit(1);
  });
} else {
  // Start server normally
  server.start();
}

// Export app for Vercel
export default server.app;
```

**Status:** ✅ Deployed and ready

---

## 🔍 Debugging Steps

### Step 1: Check Environment Variables

**In Vercel Dashboard:**
1. Go to https://vercel.com/dashboard
2. Select `hustlebot-v2` project
3. Click "Settings" → "Environment Variables"
4. Verify these are set:

**Critical Variables:**
- ✅ `NODE_ENV=production`
- ✅ `PORT=3000`
- ❓ `SUPABASE_URL` - Required for database
- ❓ `SUPABASE_KEY` - Required for database
- ❓ `SUPABASE_SERVICE_KEY` - Required for admin ops
- ❓ `OPENROUTER_API_KEY` - Required for LLM

**Recommended Variables:**
- ❓ `TELEGRAM_BOT_TOKEN` - For Telegram bot
- ❓ `DEEPGRAM_API_KEY` - For voice features
- ❓ `ELEVENLABS_API_KEY` - For text-to-speech
- ❓ `STRIPE_SECRET_KEY` - For payments
- ❓ `BREVO_API_KEY` - For email marketing
- ❓ `POSTIZ_API_KEY` - For social scheduling

### Step 2: Check Vercel Logs

**View Deployment Logs:**
```bash
# Using Vercel CLI (if installed)
vercel logs hustlebot-v2 --tail

# Or manually in Vercel Dashboard:
# Settings → Deployments → Click latest → View logs
```

**Look for:**
- Module not found errors
- Missing environment variable errors
- Timeout messages
- Memory exceeded errors

### Step 3: Test Deployment Endpoint

```bash
# Check if deployment is responding
curl https://hustlebot-v2.vercel.app/health

# Check with verbose error output
curl -v https://hustlebot-v2.vercel.app/health 2>&1 | head -30
```

**Expected Response (200 OK):**
```json
{"status":"ok","timestamp":"...","service":"hustlebot-v2"}
```

**Error Response (500):**
Usually includes server error details in logs

### Step 4: Local Verification

Before redeploying to Vercel:

```bash
# Test local build (simulates Vercel environment)
npm run build  # if build script exists
npm start

# Verify all endpoints
curl http://localhost:3000/health
curl http://localhost:3000/api/conversations/status
```

### Step 5: Rebuild Deployment

After fixing environment variables:

**Option A - Via Vercel Dashboard:**
1. Go to Deployments
2. Click the three dots on latest deployment
3. Select "Redeploy"

**Option B - Via Git:**
```bash
git push origin main  # Triggers automatic deployment
```

**Option C - Via Vercel CLI:**
```bash
vercel deploy --prod  # Force production deployment
```

---

## 📋 Quick Checklist

### Environment Variables
- [ ] `NODE_ENV=production` set
- [ ] `PORT=3000` set
- [ ] `SUPABASE_URL` set
- [ ] `SUPABASE_KEY` set
- [ ] `SUPABASE_SERVICE_KEY` set
- [ ] `OPENROUTER_API_KEY` set (or mock mode acceptable)
- [ ] All other required APIs set

### Deployment Files
- [ ] `vercel.json` configured correctly
- [ ] `.vercelignore` excludes unnecessary files
- [ ] `src/server.js` exports Express app
- [ ] `package.json` has correct start script
- [ ] All dependencies installed (`package-lock.json` present)

### Testing
- [ ] Local server starts: `npm start`
- [ ] Health endpoint responds: `/health`
- [ ] Conversation endpoint works: POST `/api/conversations/start`
- [ ] Test with `curl` before viewing in browser

---

## 🚨 Common Issues & Solutions

### Issue: "Cannot find module 'X'"
**Cause:** Missing or incorrectly installed dependency  
**Solution:**
```bash
npm install
npm ci  # Use lock file
git push origin main  # Redeploy to Vercel
```

### Issue: "SUPABASE_URL is required"
**Cause:** Environment variable not set  
**Solution:** Set in Vercel dashboard or `.env.production`

### Issue: "Function timeout"
**Cause:** Initialization taking too long (>30s)  
**Solution:**
- Optimize initialization code
- Use faster database
- Enable Vercel Pro for longer timeouts

### Issue: "Module not found after recent changes"
**Cause:** Files not committed to git  
**Solution:**
```bash
git status
git add .
git commit -m "Message"
git push origin main
```

---

## 🔗 Useful Links

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Node.js Runtime](https://vercel.com/docs/concepts/functions/serverless-functions/node-js)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
- [View Project](https://vercel.com/dashboard/jpgreen30/hustlebot-v2)

---

## 📊 Performance Tips

1. **Reduce Cold Start Time**
   - Remove unused dependencies
   - Lazy-load heavy modules
   - Optimize initialization sequence

2. **Handle Serverless Limits**
   - Max execution: 10s (free), 60s (pro)
   - Max memory: 512MB (free), 3GB (pro)
   - Monitor with Vercel Analytics

3. **Database Optimization**
   - Use connection pooling
   - Cache frequently accessed data
   - Optimize queries

---

## 📞 Support

If issues persist:
1. Check Vercel build logs in Dashboard
2. Test locally with `npm start`
3. Verify all environment variables are set
4. Check for recent code changes that might cause issues
5. Contact Vercel support with deployment ID

---

## ✅ Deployment Health Check

Run this script to verify all systems:

```bash
# Local verification
npm start &
sleep 3

# Health check
curl http://localhost:3000/health

# Conversation test
curl -X POST http://localhost:3000/api/conversations/start \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": "test",
    "initialRequest": "Hello",
    "phoneNumber": "+1-555-0100"
  }'

# System status
curl http://localhost:3000/api/conversations/status
```

All endpoints should return HTTP 200 with JSON responses.
