# HustleBot MCP Server Setup

Connect Claude and other AI agents to HustleBot via the Model Context Protocol (MCP).

## Overview

HustleBot exposes its capabilities as an MCP server, allowing Claude to:
- Generate content (blogs, emails, landing pages, social media, video scripts)
- Create and execute workflows
- Search and enrich leads
- Send messages to other AI agents (ChatGPT, Grok, etc.) via the Mailbox
- Check incoming messages from other agents
- Query analytics across all systems
- Access the knowledge base

## Installation

1. Install MCP SDK (already in package.json):
```bash
npm install
```

2. Verify MCP server can start:
```bash
npm run mcp
```

You should see:
```
[MCP] Starting HustleBot MCP Server...
[MCP] Server ready for Claude connection
```

## Connecting Claude to HustleBot

### Option 1: Claude Desktop App

1. Edit Claude Desktop config file:
   - **macOS/Linux:** `~/.config/Claude/claude_desktop_config.json`
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

2. Add HustleBot MCP server configuration:
```json
{
  "mcpServers": {
    "hustlebot": {
      "command": "node",
      "args": ["/path/to/hustlebot-v2/src/mcp/index.js"],
      "env": {
        "NODE_ENV": "production",
        "OPENROUTER_API_KEY": "your_key_here",
        "DEEPGRAM_API_KEY": "your_key_here"
      }
    }
  }
}
```

3. Restart Claude Desktop - HustleBot tools will appear in the Tools section

### Option 2: Claude Web/API

For programmatic access to HustleBot via Claude API:

```javascript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

// Define HustleBot tools
const hustlebotTools = [
  {
    name: 'generate_content',
    description: 'Generate content using ContentFactory',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['blog', 'email', 'landing', 'social', 'video'] },
        topic: { type: 'string' },
        audience: { type: 'string' },
      },
      required: ['type', 'topic'],
    },
  },
  // ... other tools
];

// Use with Claude
const response = await client.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 4096,
  tools: hustlebotTools,
  messages: [
    {
      role: 'user',
      content: 'Generate a blog post about AI automation for small businesses',
    },
  ],
});
```

## Available Tools

### Content Generation
- **generate_content** - Create blog posts, emails, landing pages, social media, or video scripts

### Workflow Management
- **create_workflow** - Define new automation workflows
- **run_workflow** - Execute a registered workflow
- **list_workflows** - View all workflows

### Lead Management
- **search_leads** - Find prospects by industry, location, job title, company size
- **enrich_lead** - Add additional data to lead profiles

### Agent Communication (Mailbox)
- **send_message** - Send message to another AI agent (ChatGPT, Grok, etc.)
- **check_mailbox** - Receive messages from other agents
- **reply_to_message** - Reply to incoming agent messages

### Analytics
- **get_analytics** - Query content, lead, workflow, or revenue analytics

### Email Marketing
- **send_campaign** - Create and send email campaigns to lead lists

### Knowledge Management
- **add_knowledge** - Store information in knowledge base
- **search_knowledge** - Query knowledge base

### System
- **get_system_status** - Check status of all services

## Example: Claude Orchestrating Multiple Agents

Claude can now coordinate work between AI agents:

```
User: "Generate a blog post about AI trends, then send it to ChatGPT for review"

Claude will:
1. Call generate_content("blog", "AI trends") → HustleBot generates post
2. Call send_message(recipient="chatgpt", subject="Blog Post Review", content=post)
3. Wait for ChatGPT to respond via check_mailbox()
4. Call reply_to_message() with Claude's feedback based on ChatGPT's review
```

## Agent-to-Agent Workflow

1. **Claude** initiates task via HustleBot
2. **Claude** sends message to **ChatGPT** via Mailbox
3. **ChatGPT** receives message, processes it, replies
4. **Claude** checks mailbox and continues workflow
5. **Grok** can be included in the conversation loop

Example workflow:
```
Claude → "Generate lead list" → HustleBot generates leads
Claude → "Review this list" → sends to ChatGPT via Mailbox
ChatGPT → "Here's my analysis" → replies to Claude via Mailbox  
Claude → "Run campaign on these leads" → HustleBot executes workflow
Claude → "Report results" → sends summary to all agents
```

## Environment Variables Required

```bash
# Core
NODE_ENV=production
PORT=3000

# Optional Services
OPENROUTER_API_KEY=your_key
DEEPGRAM_API_KEY=your_key
TELEGRAM_BOT_TOKEN=your_token
SUPABASE_URL=your_url
SUPABASE_KEY=your_key
```

## Testing

1. Start HustleBot MCP server:
```bash
npm run mcp
```

2. Test in Claude:
```
Claude: "What tools do you have available?"
Claude will list all HustleBot MCP tools
```

3. Try a tool:
```
Claude: "Generate a blog post about productivity"
Claude will call generate_content tool via HustleBot MCP server
```

## Troubleshooting

### "Server failed to start"
- Check Node.js version: `node --version` (requires 18+)
- Check dependencies: `npm install`
- Check environment variables are set

### "Tool not responding"
- Verify MCP server is running: `npm run mcp`
- Check logs for errors
- Restart Claude app (if using Desktop)

### "Message to other agents not working"
- Verify Mailbox system is initialized
- Ensure recipient agent is registered in HustleBot
- Check mailbox logs

## Architecture

```
Claude API/Desktop
       ↓
   MCP Protocol
       ↓
HustleBot MCP Server (src/mcp/server.js)
       ↓
HustleBot Services
├── ContentFactory
├── WorkflowRegistry
├── LeadFactory
├── Mailbox (agent communication)
├── AnalyticsEngine
└── ... 10+ other services
       ↓
External Services (Supabase, OpenRouter, Deepgram, etc.)
```

## Advanced: Running Multiple Agent MCP Servers

To have ChatGPT, Grok, and Claude all coordinating:

```json
{
  "mcpServers": {
    "hustlebot": {
      "command": "node",
      "args": ["/path/to/hustlebot-v2/src/mcp/index.js"]
    },
    "chatgpt-connector": {
      "command": "python",
      "args": ["./connectors/chatgpt_mcp.py"]
    },
    "grok-connector": {
      "command": "python", 
      "args": ["./connectors/grok_mcp.py"]
    }
  }
}
```

Each agent can:
- Access HustleBot's tools via the MCP server
- Send messages to other agents via Mailbox
- Coordinate on complex multi-agent workflows

## Security

- MCP runs in isolated stdio transport
- No exposed HTTP endpoints
- Communication via encrypted channels
- Environment variables isolated to MCP process
- Tool access controlled via schema validation

## Next Steps

1. ✅ Set up HustleBot MCP server
2. ✅ Connect Claude to HustleBot
3. ⏳ Create ChatGPT MCP connector
4. ⏳ Create Grok MCP connector  
5. ⏳ Build multi-agent workflow examples

---

**Status:** HustleBot MCP Server fully functional and ready for Claude integration.
