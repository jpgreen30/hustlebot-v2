# HustleBot v2 - Complete Setup Guide

Step-by-step instructions to get HustleBot running locally and deployed to production.

---

## **⏱️ Setup Time: ~30 minutes**

---

## **PART 1: Prerequisites (5 minutes)**

### **1.1 Create Free Accounts**

- **Supabase** - supabase.com (database)
- **Render** - render.com (backend hosting)
- **Telegram BotFather** - @BotFather (bot token)
- **OpenRouter** - openrouter.ai (LLM routing)
- **Deepgram** - deepgram.com (speech-to-text)
- **ElevenLabs** - elevenlabs.io (text-to-speech)
- **Replicate** - replicate.com (image generation)
- **Stripe** - stripe.com (payments, optional)
- **Brevo** - brevo.com (email, free up to 20k contacts)

### **1.2 Get Telegram Bot Token**

1. Open Telegram
2. Search for `@BotFather`
3. Send `/newbot`
4. Follow prompts to create bot
5. Copy the **HTTP API token** (looks like `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)

### **1.3 Clone Repository**

```bash
git clone <your-repo-url>
cd hustlebot-v2
```

---

## **PART 2: Local Development Setup (10 minutes)**

### **2.1 Install Dependencies**

```bash
npm install
```

### **2.2 Create Environment File**

```bash
cp .env.example .env
```

### **2.3 Fill in API Keys**

Open `.env` and add your credentials:

```bash
# TELEGRAM
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11

# OPENROUTER (LLM)
OPENROUTER_API_KEY=sk-or-...

# SUPABASE
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# DEEPGRAM
DEEPGRAM_API_KEY=e12345...

# ELEVEN LABS
ELEVENLABS_API_KEY=sk_...

# REPLICATE
REPLICATE_API_TOKEN=r8_...

# STRIPE
STRIPE_SECRET_KEY=sk_test_...

# BREVO
BREVO_API_KEY=...

# SERVER
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
```

### **2.4 Setup Database**

Run migrations to create all tables:

```bash
npm run db:migrate
```

You should see:
```
✅ Database migration completed successfully!

Tables created:
  • users
  • projects
  • leads
  • transactions
  • agent_logs
  • memory
```

### **2.5 Test Local Server**

```bash
npm run dev
```

You should see:
```
🚀 Initializing HustleBot v2...
📦 Connecting to Supabase...
✅ Supabase connected
🧠 Initializing OpenRouter...
✅ OpenRouter ready
...
✅ HustleBot v2 is LIVE and ready to take commands!
🤖 Telegram bot launched (polling mode)
```

**✅ Success!** Local server is running.

To test, send any message to your Telegram bot. You should get a response!

---

## **PART 3: Deploy to Render (10 minutes)**

### **3.1 Push to GitHub**

```bash
git add .
git commit -m "Initial HustleBot v2 setup"
git push origin main
```

### **3.2 Create Render Web Service**

1. Go to **render.com** and sign up
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub account
4. Select your `hustlebot-v2` repository
5. Click **"Connect"**

### **3.3 Configure Web Service**

Fill in the following:

| Field | Value |
|-------|-------|
| Name | `hustlebot-v2` |
| Region | `us-west-1` (or closest) |
| Branch | `main` |
| Runtime | `Node` |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Plan | `Free` (or Starter) |

### **3.4 Add Environment Variables**

Click **"Advanced"** → **"Add Environment Variable"**

Add all variables from your `.env` file:

```
TELEGRAM_BOT_TOKEN=123456:ABC-...
OPENROUTER_API_KEY=sk-or-...
SUPABASE_URL=https://...
SUPABASE_KEY=...
SUPABASE_SERVICE_KEY=...
DEEPGRAM_API_KEY=...
... (all others)
```

### **3.5 Deploy!**

Click **"Create Web Service"**

Render will:
1. ✅ Install dependencies
2. ✅ Run migrations
3. ✅ Start the server

**You should see in the logs:**
```
✅ HustleBot v2 is LIVE and ready to take commands!
🤖 Telegram bot launched (polling mode)
```

Your deployment URL will look like: `https://hustlebot-v2.onrender.com`

---

## **PART 4: Verify Deployment**

### **4.1 Test Health Endpoint**

```bash
curl https://hustlebot-v2.onrender.com/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z",
  "uptime": 123.45
}
```

### **4.2 Test Telegram Bot**

1. Open Telegram
2. Find your bot
3. Send `/start`
4. You should get the welcome message

### **4.3 Check Logs**

On Render dashboard:
- Click your service
- View **"Logs"** tab
- Should show bot is running

---

## **PART 5: (Optional) Setup Webhook**

By default, bot uses polling (slower but simpler). For production, use webhooks:

### **5.1 Set Telegram Webhook**

In your code (or via API):

```bash
curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook \
  -H "Content-Type: application/json" \
  -d '{"url": "https://hustlebot-v2.onrender.com/webhook/<TOKEN>"}'
```

### **5.2 Update .env**

Add webhook URL:

```
TELEGRAM_WEBHOOK_URL=https://hustlebot-v2.onrender.com/webhook/YOUR_BOT_TOKEN
```

### **5.3 Redeploy**

```bash
git commit -am "Enable webhook"
git push origin main
```

Render auto-redeploys. In logs you should see:
```
🔗 Telegram webhook set to https://...
```

---

## **PART 6: First Project (2 minutes)**

### **Test It Out**

1. Open Telegram
2. Find your bot
3. Send a command:

```
Build me a personal loan landing page
```

You should see:
- ✅ "🤔 Processing your command..."
- ✅ Command summary
- ✅ Cost estimate
- ✅ Project creation
- ✅ Status updates

Watch the Render logs for real-time execution!

---

## **⚠️ Troubleshooting**

### **Bot not responding**

```bash
# Check if server is running
curl https://hustlebot-v2.onrender.com/health

# Check Render logs for errors
# In Render dashboard: Logs tab
```

### **"Unauthorized" error**

- Double-check `TELEGRAM_BOT_TOKEN` matches what BotFather gave you
- Make sure no spaces in token

### **Database errors**

- Verify `SUPABASE_URL` and `SUPABASE_KEY` are correct
- Check that tables were created: `npm run db:migrate`

### **API calls failing**

- Verify all API keys are correct
- Check OpenRouter has credit
- Ensure API keys have correct permissions

### **Seeing "Insufficient budget"**

- That's the budget controller working! 🎉
- Increase budget in dashboard or database

---

## **📊 Monitoring**

### **Check Spending**

```bash
# In Telegram
/budget
```

### **View Projects**

```bash
# In Telegram
/projects
```

### **Check Render Logs**

- Dashboard → Your service → Logs tab
- Shows all execution in real-time

### **Query Database**

Login to Supabase dashboard:
- View all tables
- Query transactions for spending
- View projects and leads

---

## **🔐 Security Checklist**

- ✅ Environment variables set (not in code)
- ✅ API keys rotated
- ✅ Render auto-deploys only from `main` branch
- ✅ GitHub repo is private
- ✅ Supabase has auth enabled
- ✅ Stripe webhook secret configured

---

## **🚀 Next Steps**

After successful setup:

1. **Explore the API**
   ```bash
   curl https://hustlebot-v2.onrender.com/mcp/tools
   ```

2. **Build first project** - Send natural language command

3. **Check spending** - `/budget` in Telegram

4. **Explore agent logs** - View execution history in Supabase

5. **Read the full README** - See all capabilities

---

## **❓ Still Need Help?**

- 📖 Read `README.md` for detailed docs
- 🐛 Check GitHub issues
- 📧 Contact support@hustlebot.io
- 💬 Join Discord community

---

**You're all set!** 🎉

HustleBot v2 is now running on Render and ready to take commands via Telegram.

Start with: `/start` in your Telegram bot

Or send: `Build me a landing page`

Enjoy! 🚀
