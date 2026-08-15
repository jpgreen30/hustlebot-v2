/**
 * DeepSeek MCP Connector
 * Bridges DeepSeek (via OpenRouter) to HustleBot mailbox
 *
 * Polls mailbox for messages, processes with DeepSeek, replies
 */

import Redis from 'ioredis';
import fetch from 'node-fetch';

class DeepSeekConnector {
  constructor(options = {}) {
    this.redisUrl = options.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
    this.openrouterKey = options.openrouterKey || process.env.OPENROUTER_API_KEY;
    this.model = 'deepseek/deepseek-chat'; // OpenRouter DeepSeek model
    this.agentName = 'deepseek';
    this.redis = null;
    this.running = false;
    this.pollInterval = 5000; // Poll every 5 seconds
    this.conversationHistory = new Map(); // Store conversation context
    this.processedMessages = new Set(); // Track processed messages
  }

  async initialize() {
    console.log('[DeepSeek] Connecting to Redis...');
    this.redis = new Redis(this.redisUrl);

    try {
      await this.redis.ping();
      console.log('[DeepSeek] ✅ Redis connected');
    } catch (error) {
      console.error('[DeepSeek] ❌ Redis connection failed:', error.message);
      throw error;
    }

    if (!this.openrouterKey) {
      console.warn('[DeepSeek] ⚠️  OPENROUTER_API_KEY not set');
    }

    console.log('[DeepSeek] 🚀 Connector initialized');
  }

  async start() {
    this.running = true;
    console.log('[DeepSeek] 📬 Starting message polling...');

    // Poll for messages
    this.pollInterval = setInterval(() => {
      this.processMessages().catch(error => {
        console.error('[DeepSeek] Polling error:', error.message);
      });
    }, 5000);

    console.log('[DeepSeek] ✅ Connector running');
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

        console.log(`[DeepSeek] 📬 Processing message from ${msg.from}: ${msg.subject}`);

        try {
          // Get conversation history for context
          const threadId = msg.id;
          let context = this.conversationHistory.get(threadId) || [];

          // Build conversation
          const conversation = [
            ...context,
            {
              role: 'user',
              content: `${msg.subject}\n\n${msg.content}`,
            },
          ];

          // Call DeepSeek via OpenRouter
          const response = await this.callDeepSeek(conversation);

          // Store in conversation history
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

          console.log(`[DeepSeek] ✅ Replied to ${msg.from}`);

          // Mark as processed
          this.processedMessages.add(msg.id);
        } catch (error) {
          console.error(`[DeepSeek] ❌ Failed to process message:`, error.message);
        }
      }
    } catch (error) {
      console.error('[DeepSeek] Error in processMessages:', error.message);
    }
  }

  async callDeepSeek(conversation) {
    if (!this.openrouterKey) {
      return 'DeepSeek service not configured (OPENROUTER_API_KEY not set)';
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
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const message = data.choices[0].message.content;

      console.log('[DeepSeek] 🧠 Got response from DeepSeek');
      return message;
    } catch (error) {
      console.error('[DeepSeek] API call failed:', error.message);
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
    console.log('[DeepSeek] ⏹️  Connector stopped');
  }
}

// Run if executed directly
if (process.argv[1].includes('deepseek-connector')) {
  const connector = new DeepSeekConnector();

  connector
    .initialize()
    .then(() => connector.start())
    .catch(error => {
      console.error('[DeepSeek] Fatal error:', error);
      process.exit(1);
    });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('[DeepSeek] Shutting down...');
    await connector.stop();
    process.exit(0);
  });
}

export { DeepSeekConnector };
