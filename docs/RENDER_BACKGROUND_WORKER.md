# Render Background Worker Setup for HustleBot Connectors

## Overview

The HustleBot Connectors service runs 4 AI agents (DeepSeek, Kimi, ChatGPT, Grok) that poll Redis for messages. This service doesn't expose HTTP endpoints, so it runs as a **Render Background Worker** rather than a Web Service.

## What is a Background Worker?

- **Continuous process** that runs indefinitely
- **No HTTP listener** required (doesn't bind to a port)
- **Ideal for**: polling services, background job processors, message queue consumers
- **Pricing**: Pay only for compute time used

## Creating the Background Worker

### Step 1: Access Render Dashboard

Go to [https://dashboard.render.com](https://dashboard.render.com) and log in.

### Step 2: Create New Service

Click **+ New** and select **Background Worker**

### Step 3: Configure the Background Worker

Fill in the following settings:

| Field | Value |
|-------|-------|
| **Name** | `hustlebot-connectors` |
| **Environment** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `npm run connectors` |
| **Branch** | `main` (or your deployment branch) |
| **Auto-Deploy** | Yes |
| **Plan** | Starter ($7/month) or higher |
| **Region** | oregon (or your preferred region) |

### Step 4: Add Environment Variables

Click **Environment** and add these variables:

```
REDIS_URL = <your-redis-url>
OPENROUTER_API_KEY = <your-openrouter-key>
```

**Note:** If you already added these to your Render account's environment, they'll be inherited automatically.

### Step 5: Connect Repository

1. Select **GitHub**
2. Choose repository: `jpgreen30/hustlebot-v2`
3. Confirm authorization

### Step 6: Create Service

Click **Create Background Worker** and wait for deployment.

## Monitoring Deployment

1. Watch the **Logs** tab for startup messages:
   ```
   ✅ ConnectorsManager initialized
   🔗 Redis mailbox connected
   📡 DeepSeek connector polling...
   📡 Kimi connector polling...
   📡 ChatGPT connector polling...
   📡 Grok connector polling...
   ```

2. Check **Metrics** to see CPU/memory usage

3. View **Events** for deployment status updates

## Verifying Agents are Running

Once deployed, check your Redis mailbox is receiving messages:

```bash
# From your main HustleBot service terminal
npm run test:mailbox

# Look for message flow from all 4 agents
```

## Troubleshooting

### Service keeps restarting
- Check **Logs** for error messages
- Verify REDIS_URL is correct and accessible
- Ensure OPENROUTER_API_KEY is valid

### Agents not polling
- Confirm service reached "Live" status (not in yellow/red)
- Check that REDIS_URL points to correct Redis instance
- Verify `npm run connectors` command works locally: `npm run connectors`

### Memory/CPU usage high
- Background Workers run indefinitely; some CPU usage is expected
- If excessive, check for infinite loops in connector code

## Stopping the Service

If needed, go to **Settings** and click **Suspend** to pause the service without deleting it.

## Cost Estimation

- **Starter plan**: $7/month (included in most Render accounts)
- Runs 24/7 polling Redis at 5-second intervals
- Minimal CPU/memory footprint (~100MB, <5% CPU)

## Next Steps

After the Background Worker is running:

1. ✅ Main service (hustlebot-v2) is deployed and running
2. ✅ Telegram bot is operational with all 9 commands
3. ✅ Redis mailbox is active for inter-agent communication
4. ⏳ Background Worker for connectors (this document) - CREATE NOW
5. ⏭️ Test multi-agent coordination with `/agents ping` command
6. ⏭️ Deploy video generation service (if included in roadmap)

## Connector Details

The Background Worker runs `npm run connectors`, which starts:

| Agent | Model | Specialty | Port |
|-------|-------|-----------|------|
| **DeepSeek** | DeepSeek-v3 | Code analysis & optimization | None |
| **Kimi** | Kimi Pro | Code review & security | None |
| **ChatGPT** | GPT-4o | Reasoning & collaboration | None |
| **Grok** | Grok-2 | Unconventional thinking | None |

All agents use **Redis mailbox** for asynchronous message passing.

## Render API Alternative

If you prefer using the Render API to create the Background Worker programmatically:

```bash
# Get workspace ID
curl -H "Authorization: Bearer YOUR_RENDER_API_KEY" \
  https://api.render.com/v1/workspaces

# Create Background Worker (if API supports it)
# Note: Current Render API may require dashboard for Background Workers
```

For more details, see [Render API Docs](https://render.com/docs/api-reference).

---

**Status:** Ready for deployment  
**Last updated:** 2026-08-15  
**Related:** CONNECTORS_SETUP.md, RETELL_OUTBOUND_CALLS.md
