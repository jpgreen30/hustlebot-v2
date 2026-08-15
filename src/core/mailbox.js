/**
 * MAILBOX SYSTEM
 *
 * Agent-to-agent message coordination:
 * - Send messages between agents
 * - Queue messages with TTL
 * - Track message delivery
 * - Pub/sub event system
 * - Message persistence (optional)
 */

import logger from '../utils/logger.js';

class Mailbox {
  constructor(config = {}) {
    this.db = config.db || null;
    this.cache = config.cache || null;
    this.messageQueues = new Map();
    this.subscribers = new Map();
    this.messageHistory = new Map();
    this.messageIdCounter = 0;
  }

  async initialize() {
    logger.info('📬 Mailbox system initialized');
    return true;
  }

  /**
   * Send message to agent/queue
   */
  async send(to, message, options = {}) {
    try {
      const {
        priority = 'normal',
        ttl = 3600000, // 1 hour
        requiresAck = false,
        replyTo = null
      } = options;

      const messageId = `msg-${++this.messageIdCounter}-${Date.now()}`;

      const envelope = {
        id: messageId,
        to,
        from: options.from || 'system',
        message,
        priority,
        status: 'queued',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + ttl),
        requiresAck,
        replyTo,
        deliveryAttempts: 0
      };

      logger.info(`📨 Message queued for ${to}: ${messageId}`);

      // Add to queue
      if (!this.messageQueues.has(to)) {
        this.messageQueues.set(to, []);
      }
      this.messageQueues.get(to).push(envelope);

      // Add to history
      if (!this.messageHistory.has(to)) {
        this.messageHistory.set(to, []);
      }
      this.messageHistory.get(to).push(envelope);

      // Notify subscribers
      this.notifySubscribers(to, {
        type: 'message_received',
        messageId,
        from: envelope.from,
        priority
      });

      // Setup TTL cleanup
      setTimeout(() => {
        this.cleanup(to, messageId);
      }, ttl);

      return {
        messageId,
        status: 'queued',
        to,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Message send failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Retrieve messages for queue
   */
  async receive(from, limit = 10) {
    try {
      logger.info(`📬 Receiving messages for: ${from}`);

      if (!this.messageQueues.has(from)) {
        return {
          from,
          messageCount: 0,
          messages: [],
          timestamp: new Date()
        };
      }

      const queue = this.messageQueues.get(from);

      // Sort by priority and creation time
      const sorted = [...queue].sort((a, b) => {
        const priorityOrder = { high: 1, normal: 2, low: 3 };
        const pDiff = (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
        if (pDiff !== 0) return pDiff;
        return a.createdAt - b.createdAt;
      });

      const messages = sorted.slice(0, limit);

      // Mark as delivered
      for (const msg of messages) {
        msg.status = 'delivered';
        msg.deliveredAt = new Date();
        msg.deliveryAttempts++;
      }

      return {
        from,
        messageCount: messages.length,
        messages: messages.map(m => ({
          id: m.id,
          from: m.from,
          message: m.message,
          priority: m.priority,
          createdAt: m.createdAt,
          replyTo: m.replyTo
        })),
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Message receive failed: ${error.message}`);
      return { from, error: error.message };
    }
  }

  /**
   * Acknowledge message
   */
  async acknowledge(messageId, to) {
    try {
      logger.info(`✅ Acknowledging message: ${messageId}`);

      if (!this.messageQueues.has(to)) {
        return { messageId, status: 'not_found' };
      }

      const queue = this.messageQueues.get(to);
      const msgIndex = queue.findIndex(m => m.id === messageId);

      if (msgIndex === -1) {
        return { messageId, status: 'not_found' };
      }

      const message = queue[msgIndex];
      message.status = 'acknowledged';
      message.acknowledgedAt = new Date();

      // Remove from queue after acknowledgment
      queue.splice(msgIndex, 1);

      return {
        messageId,
        status: 'acknowledged',
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Message acknowledgment failed: ${error.message}`);
      return { messageId, error: error.message };
    }
  }

  /**
   * Subscribe to events
   */
  subscribe(queue, callback) {
    try {
      logger.info(`🔔 Subscriber added for queue: ${queue}`);

      if (!this.subscribers.has(queue)) {
        this.subscribers.set(queue, []);
      }

      this.subscribers.get(queue).push(callback);

      return {
        queue,
        subscriberCount: this.subscribers.get(queue).length,
        status: 'subscribed',
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Subscription failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Notify subscribers
   */
  notifySubscribers(queue, event) {
    try {
      if (!this.subscribers.has(queue)) {
        return;
      }

      const callbacks = this.subscribers.get(queue);
      for (const callback of callbacks) {
        try {
          callback(event);
        } catch (error) {
          logger.error(`Subscriber callback error: ${error.message}`);
        }
      }
    } catch (error) {
      logger.error(`Subscriber notification failed: ${error.message}`);
    }
  }

  /**
   * Get queue status
   */
  getQueueStatus(queue) {
    try {
      const queueData = this.messageQueues.get(queue) || [];
      const history = this.messageHistory.get(queue) || [];

      const priorityCounts = {
        high: queueData.filter(m => m.priority === 'high').length,
        normal: queueData.filter(m => m.priority === 'normal').length,
        low: queueData.filter(m => m.priority === 'low').length
      };

      return {
        queue,
        messageCount: queueData.length,
        historyCount: history.length,
        priorityDistribution: priorityCounts,
        oldestMessage: queueData.length > 0 ? queueData[0].createdAt : null,
        subscriberCount: this.subscribers.get(queue)?.length || 0,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Queue status error: ${error.message}`);
      return { queue, error: error.message };
    }
  }

  /**
   * Cleanup expired messages
   */
  async cleanup(queue, messageId = null) {
    try {
      if (!this.messageQueues.has(queue)) {
        return { cleaned: 0 };
      }

      const queueData = this.messageQueues.get(queue);
      const now = new Date();

      const filtered = queueData.filter(m => {
        if (messageId && m.id === messageId) return false;
        if (m.expiresAt < now) return false;
        return true;
      });

      const cleaned = queueData.length - filtered.length;
      this.messageQueues.set(queue, filtered);

      if (cleaned > 0) {
        logger.info(`🧹 Cleaned ${cleaned} expired messages from ${queue}`);
      }

      return { queue, cleaned, timestamp: new Date() };
    } catch (error) {
      logger.error(`Cleanup failed: ${error.message}`);
      return { queue, error: error.message };
    }
  }

  /**
   * Get mailbox statistics
   */
  getStats() {
    try {
      let totalMessages = 0;
      let totalQueues = this.messageQueues.size;

      for (const queue of this.messageQueues.values()) {
        totalMessages += queue.length;
      }

      return {
        totalQueues,
        totalMessages,
        totalSubscribers: Array.from(this.subscribers.values()).reduce((sum, subs) => sum + subs.length, 0),
        queueDetails: Array.from(this.messageQueues.keys()).map(queue => this.getQueueStatus(queue)),
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Stats retrieval failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Clear all messages for queue (admin)
   */
  async clearQueue(queue) {
    try {
      logger.warn(`🗑️  Clearing queue: ${queue}`);
      this.messageQueues.delete(queue);
      return { queue, status: 'cleared', timestamp: new Date() };
    } catch (error) {
      logger.error(`Queue clear failed: ${error.message}`);
      return { queue, error: error.message };
    }
  }
}

export { Mailbox };
