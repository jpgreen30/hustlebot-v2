/**
 * Grok MCP Connector
 * Bridges Grok (via OpenRouter) to HustleBot mailbox
 *
 * Specialized for irreverent humor, real-time info, and unconventional thinking
 */

import Redis from 'ioredis';
import fetch from 'node-fetch';

class GrokConnector {
  constructor(options = {}) {
    this.redisUrl = options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
    this.openrouterKey = options.openrouterKey || process.env.OPENROUTER_API_KEY;
    this.model = 'x-ai/grok-beta'; // Grok via OpenRouter
    this.agentName = 'grok';
    this.redis = null;
    this.running = false;
    this.pollInterval = 5000;
    this.conversationHistory = new Map();
    this.processedMessages = new Set();
    this.systemPrompt = `You are Grok, an AI with a unique personality. You are known for:
- Sharp wit and dark humor
- Unconventional thinking
- Calling out absurdity
- Direct, no-nonsense communication
- Fresh perspectives on problems

When collaborating with Claude, ChatGPT, Kimi, and DeepSeek, bring your irreverent energy while being genuinely helpful. Don't be afraid to challenge conventional wisdom with a joke.`;
  }

  async initialize() {
    console.log('[Grok] Connecting to Redis...');
    this.redis = new Redis(this.redisUrl);

    try {
      await this.redis.ping();
      console.log('[Grok] ✅ Redis connected');
    } catch (error) {
      console.error('[Grok] ❌ Redis connection failed:', error.message);
      throw error;
    }

    if (!this.openrouterKey) {
      console.warn('[Grok] ⚠️  OPENROUTER_API_KEY not set');
    }

    console.log('[Grok] 🚀 Connector initialized');
  }

  async start() {
    this.running = true;
    console.log('[Grok] 📬 Starting message polling...');

    this.pollInterval = setInterval(() => {
      this.processMessages().catch(error => {
        console.error('[Grok] Polling error:', error.message);
      });
    }, 5000);

    console.log('[Grok] ✅ Connector running');
  }

  async processMessages() {
    try {
      const queueKey = `mailbox:${this.agentName}:queue`;
      const messages = await this.redis.lrange(queueKey, 0, -1);

      for (const msgStr of messages) {
        const msg = JSON.parse(msgStr);

        if (this.processedMessages.has(msg.id)) {
          continue;
        }

        console.log(`[Grok] 📬 Processing message from ${msg.from}: ${msg.subject}`);

        try {
          const threadId = msg.id;
          let context = this.conversationHistory.get(threadId) || [];

          const conversation = [
            {
              role: 'system',
              content: this.systemPrompt,
            },
            ...context,
            {
              role: 'user',
              content: `${msg.subject}\n\n${msg.content}`,
            },
          ];

          const response = await this.callGrok(conversation);

          context.push({
            role: 'user',
            content: msg.content,
          });
          context.push({
            role: 'assistant',
            content: response,
          });
          this.conversationHistory.set(threadId, context);

          await this.redis.rpush(
            `mailbox:${msg.from}:queue`,
            JSON.stringify({
              id: `reply_${Date.now()}`,
              from: this.agentName,
              to: msg.from,
              subject: `Re: ${msg.subject}`,
              content: response,
              inReplyTo: msg.id,
              timestamp: new Date().toISOString(),
              read: false,
              replies: [],
            })
          );

          await this.redis.publish(
            `mailbox:${msg.from}:messages`,
            JSON.stringify({
              _event: 'message_reply',
              from: this.agentName,
              subject: `Re: ${msg.subject}`,
              messageId: msg.id,
            })
          );

          console.log(`[Grok] ✅ Replied to ${msg.from}`);
          this.processedMessages.add(msg.id);
        } catch (error) {
          console.error(`[Grok] ❌ Failed to process message:`, error.message);
        }
      }
    } catch (error) {
      console.error('[Grok] Error in processMessages:', error.message);
    }
  }

  async callGrok(conversation) {
    if (!this.openrouterKey) {
      return 'Grok service not configured (OPENROUTER_API_KEY not set)';
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openrouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://hustlebot.io',
          'X-Title': 'HustleBot',
        },
        body: JSON.stringify({
          model: this.model,
          messages: conversation,
          temperature: 0.8, // Higher temp for Grok's personality
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const message = data.choices[0].message.content;

      console.log('[Grok] 🧠 Got response from Grok');
      return message;
    } catch (error) {
      console.error('[Grok] API call failed:', error.message);
      throw error;
    }
  }

  async stop() {
    this.running = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
    if (this.redis) {
      await this.redis.quit();
    }
    console.log('[Grok] ⏹️  Connector stopped');
  }
}

if (process.argv[1].includes('grok-connector')) {
  const connector = new GrokConnector();

  connector
    .initialize()
    .then(() => connector.start())
    .catch(error => {
      console.error('[Grok] Fatal error:', error);
      process.exit(1);
    });

  process.on('SIGINT', async () => {
    console.log('[Grok] Shutting down...');
    await connector.stop();
    process.exit(0);
  });
}

export { GrokConnector };
