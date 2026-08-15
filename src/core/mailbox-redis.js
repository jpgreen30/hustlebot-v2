/**
 * Redis-Based Mailbox System
 * Enables bidirectional communication between AI agents
 *
 * Features:
 * - Pub/Sub for real-time message delivery
 * - Persistent message queue for offline delivery
 * - Agent-to-agent communication (Claude ↔ ChatGPT ↔ Grok)
 * - Message threads and replies
 */

import Redis from 'ioredis';
import logger from '../utils/logger.js';

class RedisMailbox {
  constructor(redisUrl = null) {
    this.redisUrl = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
    this.redis = null;
    this.subscriber = null;
    this.messageHandlers = new Map(); // Callbacks for incoming messages
    this.agents = new Set(['claude', 'chatgpt', 'grok', 'system']);
    this.initialized = false;
  }

  async initialize() {
    try {
      logger.info(`📬 Connecting to Redis: ${this.redisUrl.split('@')[1] || 'localhost'}`);

      this.redis = new Redis(this.redisUrl);
      this.subscriber = new Redis(this.redisUrl);

      // Test connection
      await this.redis.ping();
      logger.info('✅ Redis connection established');

      // Subscribe to all agent channels
      await this.setupSubscriptions();

      this.initialized = true;
      logger.info('📬 Mailbox system initialized (Redis mode)');
    } catch (error) {
      logger.error('Failed to initialize Redis mailbox:', error);
      throw error;
    }
  }

  async setupSubscriptions() {
    // Subscribe to all agent channels
    for (const agent of this.agents) {
      const channel = `mailbox:${agent}:messages`;
      await this.subscriber.subscribe(channel);
      logger.info(`📬 Subscribed to ${channel}`);
    }

    // Handle incoming messages
    this.subscriber.on('message', (channel, message) => {
      try {
        const msg = JSON.parse(message);
        logger.info(`📬 Message received on ${channel}: ${msg.subject}`);

        // Call any registered handlers
        const handlers = this.messageHandlers.get(channel) || [];
        handlers.forEach(handler => handler(msg));
      } catch (error) {
        logger.error('Error processing Redis message:', error);
      }
    });

    this.subscriber.on('error', (error) => {
      logger.error('Redis subscriber error:', error);
    });
  }

  /**
   * Send a message from one agent to another
   * Publishes to Redis pub/sub AND stores in message queue
   */
  async send(message) {
    if (!this.initialized) {
      throw new Error('Mailbox not initialized');
    }

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const msg = {
      id: messageId,
      from: message.from,
      to: message.to,
      subject: message.subject,
      content: message.content,
      priority: message.priority || 'normal',
      metadata: message.metadata || {},
      timestamp: new Date().toISOString(),
      read: false,
      replies: [],
    };

    try {
      // Store in message queue (persistent)
      const queueKey = `mailbox:${message.to}:queue`;
      await this.redis.lpush(queueKey, JSON.stringify(msg));
      await this.redis.expire(queueKey, 86400 * 7); // 7 day TTL

      // Publish to channel (real-time)
      const channel = `mailbox:${message.to}:messages`;
      await this.redis.publish(channel, JSON.stringify({
        ...msg,
        _event: 'new_message',
      }));

      // Store in message index for searching
      const indexKey = `mailbox:${message.to}:index`;
      await this.redis.zadd(indexKey, Date.now(), messageId);
      await this.redis.expire(indexKey, 86400 * 7);

      logger.info(`📬 Message sent from ${message.from} to ${message.to}: ${messageId}`);

      return messageId;
    } catch (error) {
      logger.error('Failed to send message:', error);
      throw error;
    }
  }

  /**
   * Get messages for an agent (with optional filtering)
   */
  async getMessages(agent, options = {}) {
    if (!this.initialized) {
      throw new Error('Mailbox not initialized');
    }

    const {
      limit = 10,
      unreadOnly = false,
      from = null,
      since = null,
    } = options;

    try {
      const queueKey = `mailbox:${agent}:queue`;
      const messages = await this.redis.lrange(queueKey, 0, limit - 1);

      let parsedMessages = messages.map(msg => JSON.parse(msg));

      // Filter
      if (from) {
        parsedMessages = parsedMessages.filter(m => m.from === from);
      }
      if (unreadOnly) {
        parsedMessages = parsedMessages.filter(m => !m.read);
      }
      if (since) {
        const sinceTime = new Date(since).getTime();
        parsedMessages = parsedMessages.filter(m =>
          new Date(m.timestamp).getTime() > sinceTime
        );
      }

      logger.info(`📬 Retrieved ${parsedMessages.length} messages for ${agent}`);
      return parsedMessages;
    } catch (error) {
      logger.error('Failed to get messages:', error);
      throw error;
    }
  }

  /**
   * Mark message as read
   */
  async markAsRead(agent, messageId) {
    if (!this.initialized) {
      throw new Error('Mailbox not initialized');
    }

    try {
      const queueKey = `mailbox:${agent}:queue`;
      const messages = await this.redis.lrange(queueKey, 0, -1);

      for (let i = 0; i < messages.length; i++) {
        const msg = JSON.parse(messages[i]);
        if (msg.id === messageId) {
          msg.read = true;
          await this.redis.lset(queueKey, i, JSON.stringify(msg));
          break;
        }
      }

      logger.info(`📬 Message ${messageId} marked as read`);
    } catch (error) {
      logger.error('Failed to mark message as read:', error);
    }
  }

  /**
   * Reply to a message (creates a thread)
   */
  async reply(agent, messageId, replyContent) {
    if (!this.initialized) {
      throw new Error('Mailbox not initialized');
    }

    const replyId = `reply_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      const queueKey = `mailbox:${agent}:queue`;
      const messages = await this.redis.lrange(queueKey, 0, -1);

      for (let i = 0; i < messages.length; i++) {
        const msg = JSON.parse(messages[i]);
        if (msg.id === messageId) {
          // Add reply to message thread
          msg.replies.push({
            id: replyId,
            from: agent,
            content: replyContent,
            timestamp: new Date().toISOString(),
          });

          await this.redis.lset(queueKey, i, JSON.stringify(msg));

          // Also publish reply to original sender
          const senderChannel = `mailbox:${msg.from}:messages`;
          await this.redis.publish(senderChannel, JSON.stringify({
            _event: 'message_reply',
            messageId: messageId,
            replyId: replyId,
            from: agent,
            content: replyContent,
          }));

          logger.info(`📬 Reply ${replyId} sent from ${agent} to message ${messageId}`);
          return replyId;
        }
      }

      throw new Error('Message not found');
    } catch (error) {
      logger.error('Failed to reply to message:', error);
      throw error;
    }
  }

  /**
   * Register a handler for incoming messages on an agent's channel
   */
  onMessage(agent, handler) {
    const channel = `mailbox:${agent}:messages`;
    if (!this.messageHandlers.has(channel)) {
      this.messageHandlers.set(channel, []);
    }
    this.messageHandlers.get(channel).push(handler);
    logger.info(`📬 Message handler registered for ${agent}`);
  }

  /**
   * Broadcast a message to all agents
   */
  async broadcast(message) {
    try {
      const broadcastMsg = {
        ...message,
        id: `broadcast_${Date.now()}`,
        timestamp: new Date().toISOString(),
        _broadcast: true,
      };

      for (const agent of this.agents) {
        if (agent !== 'system') {
          const channel = `mailbox:${agent}:messages`;
          await this.redis.publish(channel, JSON.stringify(broadcastMsg));
        }
      }

      logger.info(`📬 Broadcast message sent to all agents`);
    } catch (error) {
      logger.error('Failed to broadcast message:', error);
    }
  }

  /**
   * Get message thread (message + all replies)
   */
  async getThread(agent, messageId) {
    if (!this.initialized) {
      throw new Error('Mailbox not initialized');
    }

    try {
      const queueKey = `mailbox:${agent}:queue`;
      const messages = await this.redis.lrange(queueKey, 0, -1);

      for (const msgStr of messages) {
        const msg = JSON.parse(msgStr);
        if (msg.id === messageId) {
          return msg;
        }
      }

      throw new Error('Message not found');
    } catch (error) {
      logger.error('Failed to get message thread:', error);
      throw error;
    }
  }

  /**
   * Clear all messages (admin function)
   */
  async clear(agent = null) {
    if (!this.initialized) {
      throw new Error('Mailbox not initialized');
    }

    try {
      if (agent) {
        await this.redis.del(`mailbox:${agent}:queue`);
        await this.redis.del(`mailbox:${agent}:index`);
        logger.info(`📬 Cleared messages for ${agent}`);
      } else {
        for (const a of this.agents) {
          await this.redis.del(`mailbox:${a}:queue`);
          await this.redis.del(`mailbox:${a}:index`);
        }
        logger.info(`📬 Cleared all messages`);
      }
    } catch (error) {
      logger.error('Failed to clear messages:', error);
    }
  }

  async close() {
    try {
      if (this.redis) await this.redis.quit();
      if (this.subscriber) await this.subscriber.quit();
      logger.info('📬 Mailbox connection closed');
    } catch (error) {
      logger.error('Error closing mailbox:', error);
    }
  }
}

export { RedisMailbox };
