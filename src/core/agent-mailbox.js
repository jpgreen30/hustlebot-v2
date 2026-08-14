/**
 * AGENT MAILBOX
 *
 * Responsibilities:
 * 1. Enable bidirectional inter-agent messaging
 * 2. Support message types (request, response, state_update, error)
 * 3. Message routing and delivery
 * 4. Message queue per agent
 * 5. Message history and audit trail
 */

import logger from '../utils/logger.js';

class AgentMailbox {
  constructor(db) {
    this.db = db;

    // In-memory message storage
    this.mailbox = new Map(); // key = toAgentId, value = array of messages
    this.messageHistory = new Map(); // Full history for auditing

    this.messageTypes = ['request', 'response', 'state_update', 'error', 'notification'];
    this.messageStatuses = ['unread', 'read', 'processed'];

    this.initialized = false;
  }

  /**
   * Initialize mailbox from database
   */
  async initialize() {
    try {
      logger.info('📬 Initializing Agent Mailbox...');

      if (this.db) {
        // Load unprocessed messages from database
        const messages = await this.db.getUnprocessedMessages();
        for (const msg of messages) {
          if (!this.mailbox.has(msg.to_agent_id)) {
            this.mailbox.set(msg.to_agent_id, []);
          }
          this.mailbox.get(msg.to_agent_id).push(msg);
          this.messageHistory.set(msg.id, msg);
        }

        logger.info(`✅ Loaded ${messages.length} unprocessed messages`);
      }

      this.initialized = true;
      logger.info(`✅ Agent Mailbox initialized`);
    } catch (error) {
      logger.error('Error initializing mailbox:', error);
      throw error;
    }
  }

  /**
   * Send a message from one agent to another
   */
  async sendMessage(fromAgentId, toAgentId, messageType, payload, options = {}) {
    try {
      if (!this.messageTypes.includes(messageType)) {
        throw new Error(`Invalid message type: ${messageType}`);
      }

      const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const message = {
        id: messageId,
        from_agent_id: fromAgentId,
        to_agent_id: toAgentId,
        message_type: messageType,
        payload,
        status: 'unread',
        priority: options.priority || 'normal',
        created_at: new Date().toISOString(),
        read_at: null,
        processed_at: null,
        reply_to: options.reply_to || null
      };

      // Store in-memory
      if (!this.mailbox.has(toAgentId)) {
        this.mailbox.set(toAgentId, []);
      }
      this.mailbox.get(toAgentId).push(message);
      this.messageHistory.set(messageId, message);

      // Persist to database
      if (this.db) {
        await this.db.createMessage(message);
      }

      logger.info(`📨 Message ${messageId} sent: ${fromAgentId} → ${toAgentId} (${messageType})`);
      return message;
    } catch (error) {
      logger.error('Error sending message:', error);
      throw error;
    }
  }

  /**
   * Get all unread messages for an agent
   */
  async getUnreadMessages(agentId) {
    try {
      const messages = this.mailbox.get(agentId) || [];
      return messages.filter(msg => msg.status === 'unread');
    } catch (error) {
      logger.error('Error getting unread messages:', error);
      throw error;
    }
  }

  /**
   * Get a specific message
   */
  async getMessage(messageId) {
    try {
      let message = this.messageHistory.get(messageId);

      if (!message && this.db) {
        message = await this.db.getMessage(messageId);
        if (message) {
          this.messageHistory.set(messageId, message);
        }
      }

      return message || null;
    } catch (error) {
      logger.error('Error getting message:', error);
      throw error;
    }
  }

  /**
   * Mark message as read
   */
  async markAsRead(messageId) {
    try {
      const message = await this.getMessage(messageId);
      if (!message) {
        throw new Error(`Message not found: ${messageId}`);
      }

      message.status = 'read';
      message.read_at = new Date().toISOString();

      this.messageHistory.set(messageId, message);

      if (this.db) {
        await this.db.updateMessageStatus(messageId, 'read', message.read_at);
      }

      logger.info(`✅ Message ${messageId} marked as read`);
      return message;
    } catch (error) {
      logger.error('Error marking message as read:', error);
      throw error;
    }
  }

  /**
   * Mark message as processed
   */
  async markAsProcessed(messageId) {
    try {
      const message = await this.getMessage(messageId);
      if (!message) {
        throw new Error(`Message not found: ${messageId}`);
      }

      message.status = 'processed';
      message.processed_at = new Date().toISOString();

      this.messageHistory.set(messageId, message);

      if (this.db) {
        await this.db.updateMessageStatus(messageId, 'processed', message.processed_at);
      }

      logger.info(`✅ Message ${messageId} marked as processed`);
      return message;
    } catch (error) {
      logger.error('Error marking message as processed:', error);
      throw error;
    }
  }

  /**
   * Get agent mailbox status
   */
  async getMailboxStatus(agentId) {
    try {
      const messages = this.mailbox.get(agentId) || [];

      const status = {
        agent_id: agentId,
        total_messages: messages.length,
        by_status: {},
        by_type: {}
      };

      for (const msg of messages) {
        status.by_status[msg.status] = (status.by_status[msg.status] || 0) + 1;
        status.by_type[msg.message_type] = (status.by_type[msg.message_type] || 0) + 1;
      }

      return status;
    } catch (error) {
      logger.error('Error getting mailbox status:', error);
      throw error;
    }
  }

  /**
   * Get message conversation thread (message and replies)
   */
  async getConversationThread(messageId) {
    try {
      const message = await this.getMessage(messageId);
      if (!message) {
        return null;
      }

      const thread = {
        root_message: message,
        replies: []
      };

      // Find all replies to this message
      for (const [id, msg] of this.messageHistory.entries()) {
        if (msg.reply_to === messageId) {
          thread.replies.push(msg);
        }
      }

      return thread;
    } catch (error) {
      logger.error('Error getting conversation thread:', error);
      throw error;
    }
  }

  /**
   * Send reply to a message
   */
  async replyToMessage(messageId, fromAgentId, payload, options = {}) {
    try {
      const originalMessage = await this.getMessage(messageId);
      if (!originalMessage) {
        throw new Error(`Original message not found: ${messageId}`);
      }

      // Send message back to original sender
      const reply = await this.sendMessage(
        fromAgentId,
        originalMessage.from_agent_id,
        'response',
        payload,
        {
          ...options,
          reply_to: messageId
        }
      );

      logger.info(`💬 Reply sent to original message ${messageId}`);
      return reply;
    } catch (error) {
      logger.error('Error replying to message:', error);
      throw error;
    }
  }

  /**
   * Broadcast message to multiple agents
   */
  async broadcastMessage(fromAgentId, agentIds, messageType, payload, options = {}) {
    try {
      const messages = [];

      for (const toAgentId of agentIds) {
        const message = await this.sendMessage(fromAgentId, toAgentId, messageType, payload, options);
        messages.push(message);
      }

      logger.info(`📡 Broadcast sent to ${agentIds.length} agents`);
      return messages;
    } catch (error) {
      logger.error('Error broadcasting message:', error);
      throw error;
    }
  }

  /**
   * Get message statistics
   */
  async getMessageStats() {
    try {
      const stats = {
        total_messages: this.messageHistory.size,
        by_type: {},
        by_status: {},
        by_priority: {},
        active_conversations: 0
      };

      for (const [id, msg] of this.messageHistory.entries()) {
        stats.by_type[msg.message_type] = (stats.by_type[msg.message_type] || 0) + 1;
        stats.by_status[msg.status] = (stats.by_status[msg.status] || 0) + 1;
        stats.by_priority[msg.priority] = (stats.by_priority[msg.priority] || 0) + 1;
      }

      return stats;
    } catch (error) {
      logger.error('Error getting message stats:', error);
      throw error;
    }
  }

  /**
   * Query messages with filter
   */
  async queryMessages(filter = {}) {
    try {
      const results = [];

      for (const [id, msg] of this.messageHistory.entries()) {
        let match = true;

        if (filter.from_agent_id && msg.from_agent_id !== filter.from_agent_id) {
          match = false;
        }
        if (filter.to_agent_id && msg.to_agent_id !== filter.to_agent_id) {
          match = false;
        }
        if (filter.message_type && msg.message_type !== filter.message_type) {
          match = false;
        }
        if (filter.status && msg.status !== filter.status) {
          match = false;
        }

        if (match) {
          results.push(msg);
        }
      }

      return results;
    } catch (error) {
      logger.error('Error querying messages:', error);
      throw error;
    }
  }

  /**
   * Clean up old processed messages
   */
  async cleanup(olderThanDays = 30) {
    try {
      const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

      let deletedCount = 0;
      for (const [id, msg] of this.messageHistory.entries()) {
        if (msg.status === 'processed' && new Date(msg.processed_at) < cutoffDate) {
          this.messageHistory.delete(id);

          // Remove from mailbox
          if (this.mailbox.has(msg.to_agent_id)) {
            const queue = this.mailbox.get(msg.to_agent_id);
            const idx = queue.findIndex(m => m.id === id);
            if (idx > -1) {
              queue.splice(idx, 1);
            }
          }

          if (this.db) {
            await this.db.deleteMessage(id);
          }

          deletedCount += 1;
        }
      }

      logger.info(`🧹 Cleaned up ${deletedCount} old messages (> ${olderThanDays} days)`);
      return deletedCount;
    } catch (error) {
      logger.error('Error cleaning up messages:', error);
      throw error;
    }
  }
}

export { AgentMailbox };
