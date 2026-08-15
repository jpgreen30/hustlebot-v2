/**
 * Kimi K MCP Connector
 * Bridges Kimi K (via OpenRouter) to HustleBot mailbox
 *
 * Specialized for coding work - polls mailbox, processes with Kimi K, replies
 */

import Redis from 'ioredis';
import fetch from 'node-fetch';

class KimiConnector {
  constructor(options = {}) {
    this.redisUrl = options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
    this.openrouterKey = options.openrouterKey || process.env.OPENROUTER_API_KEY;
    this.model = 'kimi/moonshot-v1-128k'; // OpenRouter Kimi model
    this.agentName = 'kimi';
    this.redis = null;
    this.running = false;
    this.pollInterval = 5000; // Poll every 5 seconds
    this.conversationHistory = new Map(); // Store conversation context
    this.processedMessages = new Set(); // Track processed messages
    this.systemPrompt = `You are Kimi, an expert coding assistant. You specialize in:
- Code review and refactoring
- Architecture and design patterns
- Bug fixes and optimization
- Technical documentation
- Best practices and standards

Be concise but thorough in your responses. When reviewing code, provide specific suggestions with examples.`;
  }

  async initialize() {
    console.log('[Kimi] Connecting to Redis...');
    this.redis = new Redis(this.redisUrl);

    try {
      await this.redis.ping();
      console.log('[Kimi] ✅ Redis connected');
    } catch (error) {
      console.error('[Kimi] ❌ Redis connection failed:', error.message);
      throw error;
    }

    if (!this.openrouterKey) {
      console.warn('[Kimi] ⚠️  OPENROUTER_API_KEY not set');
    }

    console.log('[Kimi] 🚀 Connector initialized');
  }

  async start() {
    this.running = true;
    console.log('[Kimi] 📬 Starting message polling...');

    // Poll for messages
    this.pollInterval = setInterval(() => {
      this.processMessages().catch(error => {
        console.error('[Kimi] Polling error:', error.message);
      });
    }, 5000);

    console.log('[Kimi] ✅ Connector running');
  }

  async processMessages() {
    try {
      const queueKey = `mailbox:${this.agentName}:queue`;
      const messages = await this.redis.lrange(queueKey, 0, -1);

      for (const msgStr of messages) {
        const msg = JSON.parse(msgStr);

        // Skip if already processed
        if (this.processedMessages.has(msg.id)) {
          continue;
        }

        console.log(`[Kimi] 📬 Processing message from ${msg.from}: ${msg.subject}`);

        try {
          // Get conversation history for context
          const threadId = msg.id;
          let context = this.conversationHistory.get(threadId) || [];

          // Build conversation with system prompt
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

          // Call Kimi via OpenRouter
          const response = await this.callKimi(conversation);

          // Store in conversation history (without system prompt)
          context.push({
            role: 'user',
            content: msg.content,
          });
          context.push({
            role: 'assistant',
            content: response,
          });
          this.conversationHistory.set(threadId, context);

          // Reply to message
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

          // Publish notification
          await this.redis.publish(
            `mailbox:${msg.from}:messages`,
            JSON.stringify({
              _event: 'message_reply',
              from: this.agentName,
              subject: `Re: ${msg.subject}`,
              messageId: msg.id,
            })
          );

          console.log(`[Kimi] ✅ Replied to ${msg.from}`);

          // Mark as processed
          this.processedMessages.add(msg.id);
        } catch (error) {
          console.error(`[Kimi] ❌ Failed to process message:`, error.message);
        }
      }
    } catch (error) {
      console.error('[Kimi] Error in processMessages:', error.message);
    }
  }

  async callKimi(conversation) {
    if (!this.openrouterKey) {
      return 'Kimi service not configured (OPENROUTER_API_KEY not set)';
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
          temperature: 0.5, // Lower temp for more consistent coding suggestions
          max_tokens: 3000, // More tokens for detailed code reviews
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const message = data.choices[0].message.content;

      console.log('[Kimi] 🧠 Got response from Kimi');
      return message;
    } catch (error) {
      console.error('[Kimi] API call failed:', error.message);
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
    console.log('[Kimi] ⏹️  Connector stopped');
  }
}

// Run if executed directly
if (process.argv[1].includes('kimi-connector')) {
  const connector = new KimiConnector();

  connector
    .initialize()
    .then(() => connector.start())
    .catch(error => {
      console.error('[Kimi] Fatal error:', error);
      process.exit(1);
    });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('[Kimi] Shutting down...');
    await connector.stop();
    process.exit(0);
  });
}

export { KimiConnector };
