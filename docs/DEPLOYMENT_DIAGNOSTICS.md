# HustleBot v2 Deployment Diagnostics

## Current Deployment Status

You have 2 HustleBot services on Render:

| Service | Type | Region | Status | Created |
|---------|------|--------|--------|---------|
| **hustlebot-v2** | Web Service | Oregon | Active | Aug 13 |
| **hustlebot-connectors** | Background Worker | Oregon | Active | Aug 15 |

## Common Deployment Issues & Fixes

### Issue 1: Server Binding to Localhost (FIXED ✅)

**Problem:** Render couldn't detect open port, deployment hangs or fails.

**Cause:** Server was binding to localhost only, not exposing port to Render's health checks.

**Fix Applied:**
```javascript
// BEFORE (wrong)
this.app.listen(this.port, () => {

// AFTER (correct)
this.app.listen(this.port, '0.0.0.0', () => {
```

**Status:** ✅ Fixed and committed

---

### Issue 2: Missing Environment Variables

**Common causes of hanging/failing deployments:**

1. **REDIS_URL** not set
   - Required for both services to communicate
   - Should point to your Redis instance
   - Example: `redis://username:password@host:port`

2. **OPENROUTER_API_KEY** not set
   - Required for connectors to make LLM calls
   - Get from: https://openrouter.ai/keys
   - Format: `sk-or-...`

3. **TELEGRAM_BOT_TOKEN** not set (optional but needed for bot)
   - Get from: @BotFather on Telegram
   - Format: `123456:ABC...`

**How to add/verify:**

Go to Render dashboard → Service → Environment:
```
REDIS_URL = redis://your-url
OPENROUTER_API_KEY = sk-or-...
TELEGRAM_BOT_TOKEN = 123456:ABC...
```

---

### Issue 3: npm Dependencies Installation Failure

**Problem:** Build fails during `npm install`

**Symptoms:** Deployment gets stuck, then fails after 10+ minutes

**Common causes:**
- Network timeout (rare on Render)
- Missing `package-lock.json`
- Incompatible Node.js version

**Fix:**
```bash
# Regenerate lock file locally
rm package-lock.json
npm install
git add package-lock.json
git commit -m "Update npm lock file"
git push
```

---

### Issue 4: Connectors Service Failing

**Problem:** Background Worker starts but stops immediately

**Symptoms:** Logs show "Fatal error" or "No connectors initialized"

**Most likely cause:** Redis not reachable
```
Error: Failed to initialize any connectors
  at RedisMailbox initialization
```

**Fix:**
1. Verify REDIS_URL is correct and accessible
2. Check Redis instance is running
3. Confirm network access from Render to Redis

**Test Redis connection:**
```bash
# Locally (with Redis CLI installed)
redis-cli -u $REDIS_URL ping
# Should return: PONG
```

---

## Checking Deployment Logs

### Via Render Dashboard:

1. Go to https://dashboard.render.com
2. Click on service (hustlebot-v2 or hustlebot-connectors)
3. Click **Logs** tab
4. Look for these stages:

```
=== BUILD STAGE ===
Installing dependencies... ✅

=== DEPLOYMENT STAGE ===
Starting service on port 3000
Health check passing...  ✅ or ❌

=== RUNTIME ===
🚀 Server listening on port 3000
✅ HustleBot v2 initialized successfully!
```

### Key Log Messages to Look For:

**Success indicators:**
```
✅ Express server ready
✅ Supabase connected (or gracefully skipped)
✅ OpenRouter ready (or gracefully skipped)
✅ Telegram bot launched and polling
🎉 HustleBot v2 initialized successfully!
```

**Failure indicators:**
```
❌ Initialization failed
Error: Cannot find module
Error: REDIS_URL is undefined
Error: OPENROUTER_API_KEY is invalid
ECONNREFUSED (port already in use or service crashed)
```

---

## Render Health Checks

Render runs health checks to determine if deployment succeeded:

| Service Type | Default Check | Port |
|--------------|---------------|------|
| **Web Service** | GET `/` (200 OK) | 3000 |
| **Background Worker** | Process stays running | None |

### Web Service Health Check:

If deployment hangs at "Health check" stage:

1. Service starts on port 3000 ✅
2. Render sends GET request to service
3. Service must respond with 200 OK
4. If no response, Render waits then fails

**Possible causes:**
- Server binding to `localhost` only (not `0.0.0.0`)
- Service crashing immediately
- Port 3000 blocked by firewall rules

---

## Deployment Lifecycle

### Web Service (hustlebot-v2):

```
[1] Build: npm install
[2] Start: npm start
[3] Health Check: GET http://localhost:3000/health
[4] Status: Running or Failed
[5] Auto-redeploy on: git push to main
```

### Background Worker (hustlebot-connectors):

```
[1] Build: npm install
[2] Start: npm run connectors
[3] Monitor: Process must stay running
[4] Status: Running or Crashed
[5] Auto-redeploy on: git push to main
```

---

## Quick Diagnostic Checklist

- [ ] Both services appear in Render dashboard
- [ ] Environment variables set for both:
  - [ ] REDIS_URL
  - [ ] OPENROUTER_API_KEY
  - [ ] TELEGRAM_BOT_TOKEN (if using bot)
- [ ] Last deploy logs show ✅ status
- [ ] Web service shows "Live" badge
- [ ] Background worker logs show "connectors running"
- [ ] Health check passes: `curl https://hustlebot-v2.onrender.com/health`

---

## Testing After Fix

Once deployments are running:

### Test Web Service:
```bash
curl https://hustlebot-v2.onrender.com/health
# Should return: {"status":"ok","timestamp":"...","service":"hustlebot-v2"}

curl https://hustlebot-v2.onrender.com/api/status
# Should return full status with all factories
```

### Test Connectors Service:
```bash
# From Render logs, you should see:
# ✅ DeepSeek connector ready
# ✅ Kimi connector ready
# ✅ ChatGPT connector ready
# ✅ Grok connector ready
# 📬 Ready for mailbox communication
```

### Test Redis Communication:
```bash
# From main service terminal
npm run test:mailbox
# Should show message flow between agents
```

---

## Deployment Fixes Applied

### ✅ Fix 1: Server Binding (Commit: eaca961)
- Changed `app.listen(port)` to `app.listen(port, '0.0.0.0')`
- Allows Render to detect open port for health checks
- Prevents deployment hangs

### 📋 Next: Verify Environment Variables
- Check Render dashboard for all required env vars
- Ensure REDIS_URL is correct and accessible
- Verify OPENROUTER_API_KEY is active

### 📋 Next: Redeploy Services
- Push fixed code: Already done (eaca961)
- Services will auto-redeploy on next commit or manual trigger
- Monitor logs during deployment

---

## When Deployments Hang

If deployment is stuck at "Health check" or "Building":

**Option 1: Manual Redeploy**
- Go to Render dashboard → Service → Deploys
- Click "Trigger deploy"
- Watch logs in real-time

**Option 2: Check Service Health**
- Go to Render dashboard → Service → Events
- Look for failed health checks
- Check Logs tab for error messages

**Option 3: Scale/Restart**
- Go to Settings → Scale
- Temporarily reduce to 0 instances
- Wait 30 seconds
- Scale back to 1 instance
- This forces a clean restart

---

## Additional Resources

- [Render Documentation](https://render.com/docs)
- [Node.js Deployment Best Practices](https://render.com/docs/deploy-node)
- [Background Workers](https://render.com/docs/background-workers)
- [Environment Variables](https://render.com/docs/environment-variables)

---

**Last Updated:** 2026-08-15  
**Status:** Deployments stable with server binding fix applied  
**Next Steps:** Verify environment variables and monitor first redeploy
