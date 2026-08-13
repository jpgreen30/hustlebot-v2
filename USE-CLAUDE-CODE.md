# How to Use Claude Code/Cowork for Full Automation

## TL;DR - 3 Steps

1. **Copy** the prompt from `CLAUDE-CODE-AUTOMATION.md`
2. **Open** Claude Code or Cowork
3. **Paste** the prompt and watch it automate everything

---

## STEP-BY-STEP GUIDE

### 1. Get the Automation Prompt

**The complete prompt is in this file:**
```
/home/claude/hustlebot-v2/CLAUDE-CODE-AUTOMATION.md
```

Read it or open it in your editor:
```bash
cat /home/claude/hustlebot-v2/CLAUDE-CODE-AUTOMATION.md
```

### 2. Copy the Prompt Section

**Copy everything between these markers:**
```
[Start of code block]
SETUP AUTOMATION FOR HUSTLEBOT v2
...
Ready? Paste this prompt into Claude Code/Cowork...
[End of code block]
```

### 3. Open Claude Code or Cowork

**If you're on the web:**
- Go to https://claude.ai
- In Claude Desktop or Cowork app

**In Claude Desktop:**
- Open Claude Desktop app
- Create new task
- Paste prompt there

**In Cowork:**
- Open Cowork tab
- New task
- Paste prompt there

### 4. Paste & Run

Paste the entire prompt into Claude Code/Cowork.

Claude will automatically:

✅ Create GitHub repository
✅ Push code to GitHub
✅ Set up Supabase database
✅ Get OpenRouter API key
✅ Create Telegram bot
✅ Deploy to Render
✅ Test everything
✅ Provide summary

---

## WHAT CLAUDE WILL DO

### Phase 1: GitHub ✅
- Initialize git repo
- Commit all code
- Create GitHub repo
- Push to GitHub

### Phase 2: Supabase ✅
- Navigate to supabase.com
- Create project
- Get database credentials
- Save connection string

### Phase 3: OpenRouter ✅
- Navigate to openrouter.ai
- Sign up or login
- Create API key
- Save it

### Phase 4: Telegram ⚠️
- Navigate to Telegram
- Find @BotFather
- Guide you through /newbot
- Save bot token
- (You send the /newbot command, Claude guides you)

### Phase 5: Environment ✅
- Create .env file
- Add all credentials
- Verify file created

### Phase 6: Database ✅
- npm install
- npm run db:migrate
- Verify database connected

### Phase 7: Render ✅
- Navigate to render.com
- Create web service
- Configure deployment
- Set environment variables
- Deploy

### Phase 8: Webhook ✅
- Set Telegram webhook
- Point to Render URL

### Phase 9: Verification ✅
- Test health endpoint
- Verify deployment
- Check all systems

---

## WHAT YOU NEED TO DO

Only **2 things**:

1. **Telegram Bot Token**
   - Open Telegram
   - Find @BotFather
   - Send: /newbot
   - Give it a name
   - Copy the token
   - (Claude will guide you through the rest)

2. **Paste Credentials When Asked**
   - Sometimes Claude might ask you to verify a credential
   - Just copy/paste the value when asked

That's it! Claude does everything else.

---

## TIMELINE

| Task | Time | Who |
|------|------|-----|
| Copy prompt | 2 min | You |
| Paste in Claude Code | 1 min | You |
| GitHub setup | 5 min | Claude |
| Supabase setup | 10 min | Claude |
| OpenRouter setup | 3 min | Claude |
| Telegram setup | 5 min | You (Claude guides) |
| Environment vars | 2 min | Claude |
| Database setup | 5 min | Claude |
| Render deployment | 10 min | Claude |
| Testing | 5 min | Claude |
| **TOTAL** | **48 min** | **90% Claude** |

---

## EXPECTED OUTPUT

After Claude finishes, you'll get:

✅ **Credentials Summary**
```
GitHub Repo: https://github.com/[user]/hustlebot-v2
Supabase Project: hustlebot
OpenRouter Key: sk-or-v1-abc123...
Telegram Bot: @hustlebot-v2-[random]
Render URL: https://hustlebot-v2.onrender.com
```

✅ **Status Report**
```
[✅] All systems online
[✅] Database connected
[✅] Agents initialized (17)
[✅] Telegram bot responding
[✅] Health endpoint passing
```

✅ **Next Steps**
- Test your bot in Telegram
- Monitor costs
- Scale as needed

---

## WHAT CLAUDE NEEDS ACCESS TO

Claude Code/Cowork needs these capabilities:

✅ **Browser access** (navigate websites)
✅ **Terminal access** (run git/npm commands)
✅ **Computer use** (click buttons, fill forms)
✅ **File system access** (create .env file)

All of these are available in Claude Code/Cowork.

---

## TROUBLESHOOTING

**If Claude gets stuck:**

Send message:
```
Continue with the next step
```

**If something fails:**

Claude will:
1. Show the error
2. Explain what went wrong
3. Ask how to fix it
4. Retry automatically

**If you need to pause:**

Say:
```
Pause here, I need to [do something]
```

Claude will wait.

**If you want to stop:**

Say:
```
Stop the automation
```

Claude will:
- Save progress
- Provide summary of what's done
- Explain what's left

---

## SUCCESS INDICATORS

✅ You know it worked when:

1. GitHub repo created and visible at github.com
2. Supabase project shows "Active"
3. OpenRouter shows API credit balance
4. Telegram bot responds to messages
5. Render dashboard shows "Live" (green)
6. Health endpoint returns 200 OK
7. Logs show "✅ All systems ready"

---

## COST ESTIMATE

After deployment:

- **Supabase**: Free tier (up to 500 MB)
- **OpenRouter**: Pay-as-you-go ($0.01 - $0.10 per operation)
- **Render**: Free tier (or $7/month for always-on)
- **Telegram**: Free
- **GitHub**: Free
- **Total for first month**: $0-15 depending on usage

---

## NEXT STEPS AFTER DEPLOYMENT

1. **Test in Telegram**
   - Send: "Generate 5 headlines"
   - Should get response in 10 seconds

2. **Monitor costs**
   - Check: /budget
   - Make sure under $100/month

3. **Build Phase 3**
   - Add more tool factories
   - Add external integrations

4. **Scale**
   - If successful, upgrade Render tier
   - Set up auto-scaling
   - Configure backups

---

## FILE LOCATIONS

```
/home/claude/hustlebot-v2/
├── CLAUDE-CODE-AUTOMATION.md     ← The full prompt
├── COPY-PASTE.md                 ← If you want manual setup
├── README.md                      ← Documentation
├── .env                           ← Will be created by Claude
├── node_modules/                  ← Will be created
└── src/                           ← Already complete
```

---

## KEY FEATURES OF THIS APPROACH

✅ **Fully Automated**
- Claude handles 90% of setup
- Uses browser, terminal, computer use

✅ **Error Recovery**
- If something fails, Claude fixes it
- Shows detailed error messages
- Retries automatically

✅ **Credential Safe**
- All secrets saved securely
- .env file created locally
- Not shared with anyone

✅ **Production Ready**
- Deploys to Render (24/7 uptime)
- Real database (Supabase)
- Real API keys (OpenRouter)
- Real Telegram bot

✅ **Verifiable**
- Each step tested and verified
- Health checks run automatically
- Logs show what happened

---

## ALTERNATIVE: MANUAL SETUP

If you prefer to do it manually:

See these files:
- `START-HERE.md` - Quick overview
- `COPY-PASTE.md` - Just commands
- `RUN-GUIDE.md` - Step-by-step
- `QUICK-START.md` - Checklist

Takes 13 minutes if you do it manually.
Takes 48 minutes if Claude does it (but you don't have to watch).

---

## SUMMARY

**What you do:**
1. Copy prompt
2. Paste in Claude Code
3. Wait 48 minutes
4. Get fully deployed bot

**What Claude does:**
- Everything else
- Handles errors
- Sets up all services
- Deploys to production
- Tests everything

**Result:**
✅ Live production AI platform
✅ 17 agents working
✅ Tracking costs
✅ Responding to Telegram

---

## READY?

1. Open `CLAUDE-CODE-AUTOMATION.md`
2. Copy the prompt (the big code block)
3. Open Claude Code or Cowork
4. Paste prompt
5. Watch it work! 🚀

---

**Questions? Read `CLAUDE-CODE-AUTOMATION.md` for full details.**
