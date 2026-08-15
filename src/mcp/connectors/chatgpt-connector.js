/**
 * ChatGPT MCP Connector
 * Bridges ChatGPT (via OpenRouter) to HustleBot mailbox
 *
 * Specialized for reasoning, analysis, and collaboration
 */

import Redis from 'ioredis';
import fetch from 'node-fetch';

class ChatGPTConnector {
  constructor(options = {}) {
    this.redisUrl = options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
    this.openrouterKey = options.openrouterKey || process.env.OPENROUTER_API_KEY;
    this.model = 'openai/gpt-4-turbo'; // High-quality reasoning via OpenRouter
    this.agentName = 'chatgpt';
    this.redis = null;
    this.running = false;
    this.pollInterval = 5000;
    this.conversationHistory = new Map();
    this.processedMessages = new Set();
    this.systemPrompt = `You are ChatGPT, an expert AI assistant. You excel at:
- Reasoning and problem-solving
- Collaboration with other AI agents
- Script writing and dialogue
- Analysis and decision-making
- Creative and technical thinking

When collaborating with Claude, Kimi, or DeepSeek, provide complementary perspectives and build on their ideas.`;
  }

  async initialize() {
    console.log('[ChatGPT] Connecting to Redis...');
    this.redis = new Redis(this.redisUrl);

    try {
      await this.redis.ping();
      console.log('[ChatGPT] ✅ Redis connected');
    } catch (error) {
      console.error('[ChatGPT] ❌ Redis connection failed:', error.message);
      throw error;
    }

    if (!this.openrouterKey) {
      console.warn('[ChatGPT] ⚠️  OPENROUTER_API_KEY not set');
    }

    console.log('[ChatGPT] 🚀 Connector initialized');
  }

  async start() {
    this.running = true;
    console.log('[ChatGPT] 📬 Starting message polling...');

    this.pollInterval = setInterval(() => {
      this.processMessages().catch(error => {
        console.error('[ChatGPT] Polling error:', error.message);
      });
    }, 5000);

    console.log('[ChatGPT] ✅ Connector running');
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

        console.log(`[ChatGPT] 📬 Processing message from ${msg.from}: ${msg.subject}`);

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

          const response = await this.callChatGPT(conversation);

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

          console.log(`[ChatGPT] ✅ Replied to ${msg.from}`);
          this.processedMessages.add(msg.id);
        } catch (error) {
          console.error(`[ChatGPT] ❌ Failed to process message:`, error.message);
        }
      }
    } catch (error) {
      console.error('[ChatGPT] Error in processMessages:', error.message);
    }
  }

  async callChatGPT(conversation) {
    if (!this.openrouterKey) {
      return 'ChatGPT service not configured (OPENROUTER_API_KEY not set)';
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
          temperature: 0.7,
          max_tokens: 2500,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const message = data.choices[0].message.content;

      console.log('[ChatGPT] 🧠 Got response from ChatGPT');
      return message;
    } catch (error) {
      console.error('[ChatGPT] API call failed:', error.message);
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
    console.log('[ChatGPT] ⏹️  Connector stopped');
  }
}

if (process.argv[1].includes('chatgpt-connector')) {
  const connector = new ChatGPTConnector();

  connector
    .initialize()
    .then(() => connector.start())
    .catch(error => {
      console.error('[ChatGPT] Fatal error:', error);
      process.exit(1);
    });

  process.on('SIGINT', async () => {
    console.log('[ChatGPT] Shutting down...');
    await connector.stop();
    process.exit(0);
  });
}

export { ChatGPTConnector };
