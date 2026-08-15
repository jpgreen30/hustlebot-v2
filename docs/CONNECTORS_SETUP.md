# AI Agent Connectors Setup

Connect DeepSeek and Kimi K as independent agents to HustleBot's mailbox system.

## Overview

DeepSeek and Kimi K connectors enable your favorite OpenRouter models to:
- Receive messages from Claude and other agents
- Process requests independently
- Send replies back to the mailbox
- Participate in multi-agent coordination

**Architecture:**
```
Claude (MCP) ─┐
             ├─→ Redis Mailbox ←─ DeepSeek Connector (polls)
Telegram ────┤                 ←─ Kimi Connector (polls)
             └──────────────────

Each connector:
1. Polls mailbox for incoming messages
2. Processes with OpenRouter API
3. Sends reply back to mailbox
4. Notifies sender via pub/sub
```

## Quick Start

### 1. Prerequisites

✅ Redis running on Render (already set up)
✅ OPENROUTER_API_KEY set in environment variables
✅ REDIS_URL set in environment variables

### 2. Start Connectors

Run in a separate terminal:
```bash
npm run connectors
```

You'll see:
```
[Connectors] 🚀 Initializing MCP Connectors...

[Connectors] Setting up DeepSeek connector...
[DeepSeek] ✅ Redis connected
[DeepSeek] 🚀 Connector initialized
[Connectors] ✅ DeepSeek connector ready

[Connectors] Setting up Kimi connector...
[Kimi] ✅ Redis connected
[Kimi] 🚀 Connector initialized
[Connectors] ✅ Kimi connector ready

[Connectors] ✅ 2 connector(s) initialized
[Connectors] 📬 Starting all connectors...

[DeepSeek] 📬 Starting message polling...
[DeepSeek] ✅ Connector running

[Kimi] 📬 Starting message polling...
[Kimi] ✅ Connector running

[Connectors] ✅ All connectors running
[Connectors] 📬 Ready for mailbox communication
```

### 3. Use in Claude

Now Claude can coordinate with DeepSeek and Kimi:

```
Claude: "DeepSeek, what's your take on this user query? Kimi, review the code."

Claude sends via mailbox → Both connectors receive notification
DeepSeek processes → replies
Kimi processes → replies
Claude receives both → coordinates next steps
```

## How Connectors Work

### Message Flow

1. **Claude sends message:**
   ```javascript
   await hustle_bot.send_message({
     recipient: "deepseek",
     subject: "Analyze user intent",
     content: "User wants to automate their email..."
   })
   ```

2. **Connector polls mailbox (every 5 seconds):**
   ```
   [DeepSeek] 📬 Processing message from claude: Analyze user intent
   ```

3. **Connector calls OpenRouter:**
   ```
   POST https://openrouter.ai/api/v1/chat/completions
   {
     model: "deepseek/deepseek-chat",
     messages: [{"role": "user", "content": "..."}],
     temperature: 0.7
   }
   ```

4. **DeepSeek responds:**
   ```
   [DeepSeek] 🧠 Got response from DeepSeek
   [DeepSeek] ✅ Replied to claude
   ```

5. **Claude receives notification:**
   ```
   Redis pub/sub: mailbox:claude:messages
   {
     "_event": "message_reply",
     "from": "deepseek",
     "subject": "Re: Analyze user intent",
     "messageId": "msg_..."
   }
   ```

6. **Claude retrieves full reply:**
   ```javascript
   const messages = await hustle_bot.check_mailbox()
   // Gets DeepSeek's detailed analysis
   ```

## Connector Details

### DeepSeek Connector

**Purpose:** Chat, analysis, general AI tasks

**Model:** `deepseek/deepseek-chat` (via OpenRouter)

**Features:**
- Temperature: 0.7 (balanced creativity)
- Max tokens: 2000
- Conversation history tracking
- Multi-turn message threads

**Use Cases:**
- User intent analysis
- Conversation understanding
- Content generation ideas
- Problem-solving discussion

### Kimi Connector

**Purpose:** Code review, technical architecture, coding work

**Model:** `kimi/moonshot-v1-128k` (via OpenRouter)

**Features:**
- System prompt optimized for coding
- Temperature: 0.5 (consistent, precise)
- Max tokens: 3000 (detailed reviews)
- Code-focused conversation history

**Use Cases:**
- Code reviews
- Architecture review
- Bug analysis
- Best practices suggestions
- Technical documentation review

## Running Connectors on Render

### Option 1: Separate Service

Create a new Render service for connectors:

1. **Go to Render Dashboard**
2. **Create New → Web Service**
3. **Configure:**
   - Name: `hustlebot-connectors`
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `npm run connectors`
   - Environment Variables:
     - `REDIS_URL`: (copy from Redis instance)
     - `OPENROUTER_API_KEY`: (your key)

4. **Deploy** → Connectors run continuously

### Option 2: Render Background Workers

If Render adds background workers, run connectors as a separate job.

### Option 3: Local Development

Run connectors locally while developing:
```bash
npm run connectors
```

They'll connect to production Redis and work alongside HustleBot.

## Environment Setup

### On Render

Add to HustleBot service environment variables:

```
REDIS_URL=redis://default:password@red-xxx.onrender.com:6379
OPENROUTER_API_KEY=sk-or-xxx...
MAILBOX_MODE=redis
```

### Locally (.env)

```env
REDIS_URL=redis://localhost:6379
OPENROUTER_API_KEY=sk-or-xxx...
```

## Multi-Agent Workflows

### Example 1: Content + Review

```
Claude: "Generate a blog post, then have Kimi review it for technical accuracy"

1. Claude → calls generate_content() → HustleBot ContentFactory
2. Claude → send_message(recipient="kimi", content=blog_post)
3. Kimi connector polls mailbox → processes with OpenRouter
4. Kimi → replies with review feedback
5. Claude → receives and integrates feedback
6. Claude → publishes final post
```

### Example 2: Multi-Agent Analysis

```
Claude: "Analyze this market trend from different angles"

1. Claude → send_message(recipient="deepseek", content=trend_data)
   send_message(recipient="kimi", content=trend_data)

2. Both connectors process in parallel:
   - DeepSeek: Business & market analysis
   - Kimi: Technical implications analysis

3. Claude receives both perspectives → synthesizes report
```

### Example 3: Real-Time Collaboration

```
Telegram user sends: "Build a landing page for my SaaS"

1. Claude receives via Telegram
2. Claude generates requirements
3. Claude → send_message(recipient="deepseek", content=requirements)
4. DeepSeek analyzes requirements
5. Claude → send_message(recipient="kimi", content=user_code)
6. Kimi reviews technical approach
7. Claude → coordinates HustleBot to build landing page
8. Claude → sends result back to user via Telegram
```

## Monitoring

### Check Connector Status

```bash
# See logs
docker logs hustlebot-connectors  # if on Docker
# or check Render dashboard for service logs
```

### Redis Mailbox Inspection

```bash
# Connect to Redis
redis-cli -u redis://...

# Check messages for deepseek
LRANGE mailbox:deepseek:queue 0 -1

# Monitor pub/sub
SUBSCRIBE mailbox:claude:messages
```

### Message Debugging

```javascript
// Check unread messages
const messages = await hustlebot.check_mailbox();
console.log('Total messages:', messages.length);
console.log('From deepseek:', messages.filter(m => m.from === 'deepseek'));
```

## Troubleshooting

### Connector Not Processing Messages

1. **Check Redis connection:**
   ```bash
   redis-cli -u $REDIS_URL ping
   # Should return: PONG
   ```

2. **Check OpenRouter key:**
   ```bash
   curl -X POST https://openrouter.ai/api/v1/chat/completions \
     -H "Authorization: Bearer $OPENROUTER_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"model":"deepseek/deepseek-chat","messages":[{"role":"user","content":"test"}]}'
   ```

3. **Check logs:**
   ```
   [DeepSeek] Error in processMessages: ...
   [Kimi] Polling error: ...
   ```

### Messages Not Replying

- Connector is stuck: restart with `npm run connectors`
- OpenRouter rate limited: wait a moment, try again
- Redis connection lost: check REDIS_URL is correct

### Memory/Performance Issues

- Conversation history grows: Set TTL on Redis keys
- Too many messages: Archive old messages
- Connector CPU high: Increase poll interval from 5s to 10s

## Advanced: Custom Connectors

To add more agents (e.g., Claude Opus for complex reasoning):

1. **Create connector:**
   ```javascript
   // src/mcp/connectors/claude-advanced-connector.js
   class ClaudeAdvancedConnector extends BaseConnector {
     async callModel(conversation) {
       // Call Claude API directly
     }
   }
   ```

2. **Register in connectors/index.js:**
   ```javascript
   const claude = new ClaudeAdvancedConnector();
   this.connectors.push(claude);
   ```

3. **Use in workflows:**
   ```
   Claude: "Send to claude-advanced for complex reasoning"
   ```

## API Reference

### Connector Methods

```javascript
// Initialize connector
await connector.initialize()

// Start polling
await connector.start()

// Stop polling
await connector.stop()

// Process single message
await connector.processMessages()

// Call underlying model
await connector.callModel(conversation)
```

### Mailbox Methods (from Connector Perspective)

```javascript
// Check for messages
const messages = await redis.lrange('mailbox:deepseek:queue', 0, -1)

// Send reply
await redis.rpush('mailbox:claude:queue', JSON.stringify(reply))

// Publish notification
await redis.publish('mailbox:claude:messages', JSON.stringify(notification))
```

## Performance Notes

- **Poll frequency:** 5 seconds (adjust if needed)
- **Message processing:** ~1-5 seconds per message (depends on model)
- **OpenRouter costs:** Variable (depends on model choice)
- **Redis memory:** ~1KB per message (expires in 7 days)

## Next Steps

1. ✅ Set up connectors locally
2. ✅ Test coordination between Claude and connectors
3. ⏳ Deploy connectors service to Render
4. ⏳ Create custom connectors for other models
5. ⏳ Build advanced multi-agent workflows

---

**Status:** DeepSeek and Kimi connectors ready for deployment.

For support: Check connector logs in Render dashboard or run locally with `npm run connectors`.
