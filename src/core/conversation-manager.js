/**
 * CONVERSATION MANAGER
 *
 * Manages multi-turn voice conversations
 * - Persists conversation state
 * - Manages lifecycle (start → active → end)
 * - Tracks turns, refinements, and confirmations
 * - Archives conversations for audit trail
 */

import logger from '../utils/logger.js';

class ConversationManager {
  constructor(workflowRegistry = null) {
    this.workflowRegistry = workflowRegistry;
    this.activeConversations = new Map();
    this.archivedConversations = new Map();
    this.conversationIndex = new Map(); // workflowId -> [conversationIds]
  }

  // LIFECYCLE MANAGEMENT

  async createConversation(workflowId, initialRequest, phoneNumber) {
    try {
      const conversation = {
        id: `conv_${Date.now()}`,
        workflowId,
        phoneNumber: phoneNumber || null,
        status: 'active',
        stage: 'initial_analysis',
        turns: [],
        context: {
          refinements: [],
          clarifications: [],
          confirmations: []
        },
        createdAt: new Date(),
        startedAt: new Date(),
        lastActivityAt: new Date(),
        endedAt: null,
        outcome: null
      };

      this.activeConversations.set(conversation.id, conversation);

      // Index by workflow
      if (!this.conversationIndex.has(workflowId)) {
        this.conversationIndex.set(workflowId, []);
      }
      this.conversationIndex.get(workflowId).push(conversation.id);

      logger.info(`✅ Conversation created: ${conversation.id}`);

      return conversation;
    } catch (error) {
      logger.error(`Conversation creation failed: ${error.message}`);
      throw error;
    }
  }

  async getConversation(conversationId, includeArchived = false) {
    const conversation = this.activeConversations.get(conversationId);

    if (conversation) {
      return conversation;
    }

    if (includeArchived) {
      return this.archivedConversations.get(conversationId);
    }

    return null;
  }

  async endConversation(conversationId, outcome = 'completed') {
    try {
      const conversation = this.activeConversations.get(conversationId);

      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      conversation.status = 'closed';
      conversation.outcome = outcome;
      conversation.endedAt = new Date();

      // Move to archived
      this.activeConversations.delete(conversationId);
      this.archivedConversations.set(conversationId, conversation);

      logger.info(`✅ Conversation ended: ${conversationId} (${outcome})`);

      return conversation;
    } catch (error) {
      logger.error(`Conversation end failed: ${error.message}`);
      throw error;
    }
  }

  // TURN MANAGEMENT

  async addTurn(conversationId, speaker, message, metadata = {}) {
    try {
      const conversation = this.activeConversations.get(conversationId);

      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      const turn = {
        number: conversation.turns.length + 1,
        speaker,
        message,
        timestamp: new Date(),
        ...metadata
      };

      conversation.turns.push(turn);
      conversation.lastActivityAt = new Date();

      logger.info(`📝 Added turn ${turn.number} to conversation ${conversationId}`);

      return turn;
    } catch (error) {
      logger.error(`Turn addition failed: ${error.message}`);
      throw error;
    }
  }

  async getTurns(conversationId, limit = null) {
    try {
      const conversation = await this.getConversation(conversationId, true);

      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      const turns = conversation.turns;
      return limit ? turns.slice(-limit) : turns;
    } catch (error) {
      logger.error(`Turn retrieval failed: ${error.message}`);
      throw error;
    }
  }

  // REFINEMENT TRACKING

  async queueRefinement(conversationId, refinement) {
    try {
      const conversation = this.activeConversations.get(conversationId);

      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      const queuedRefinement = {
        id: `ref_${Date.now()}`,
        ...refinement,
        queued: new Date(),
        applied: false,
        appliedAt: null
      };

      conversation.context.refinements.push(queuedRefinement);

      logger.info(`📋 Refinement queued for conversation ${conversationId}`);

      return queuedRefinement;
    } catch (error) {
      logger.error(`Refinement queuing failed: ${error.message}`);
      throw error;
    }
  }

  async markRefinementApplied(conversationId, refinementId) {
    try {
      const conversation = this.activeConversations.get(conversationId);

      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      const refinement = conversation.context.refinements.find(r => r.id === refinementId);

      if (refinement) {
        refinement.applied = true;
        refinement.appliedAt = new Date();
      }

      logger.info(`✅ Refinement marked applied: ${refinementId}`);

      return refinement;
    } catch (error) {
      logger.error(`Refinement marking failed: ${error.message}`);
      throw error;
    }
  }

  async getRefinements(conversationId, appliedOnly = false) {
    try {
      const conversation = await this.getConversation(conversationId, true);

      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      const refinements = conversation.context.refinements;
      return appliedOnly ? refinements.filter(r => r.applied) : refinements;
    } catch (error) {
      logger.error(`Refinement retrieval failed: ${error.message}`);
      throw error;
    }
  }

  // CLARIFICATION TRACKING

  async addClarification(conversationId, question, options = []) {
    try {
      const conversation = this.activeConversations.get(conversationId);

      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      const clarification = {
        id: `clr_${Date.now()}`,
        question,
        options,
        asked: new Date(),
        answered: false,
        answer: null
      };

      conversation.context.clarifications.push(clarification);
      conversation.stage = 'clarification_needed';

      logger.info(`❓ Clarification added for conversation ${conversationId}`);

      return clarification;
    } catch (error) {
      logger.error(`Clarification addition failed: ${error.message}`);
      throw error;
    }
  }

  async answerClarification(conversationId, clarificationId, answer) {
    try {
      const conversation = this.activeConversations.get(conversationId);

      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      const clarification = conversation.context.clarifications.find(c => c.id === clarificationId);

      if (clarification) {
        clarification.answered = true;
        clarification.answer = answer;
        clarification.answeredAt = new Date();
      }

      logger.info(`✅ Clarification answered for conversation ${conversationId}`);

      return clarification;
    } catch (error) {
      logger.error(`Clarification answering failed: ${error.message}`);
      throw error;
    }
  }

  // CONFIRMATION TRACKING

  async addConfirmation(conversationId, summary) {
    try {
      const conversation = this.activeConversations.get(conversationId);

      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      const confirmation = {
        id: `conf_${Date.now()}`,
        summary,
        requested: new Date(),
        confirmed: false,
        confirmedAt: null
      };

      conversation.context.confirmations.push(confirmation);
      conversation.stage = 'awaiting_confirmation';

      logger.info(`✔️  Confirmation requested for conversation ${conversationId}`);

      return confirmation;
    } catch (error) {
      logger.error(`Confirmation addition failed: ${error.message}`);
      throw error;
    }
  }

  async confirmRequest(conversationId, confirmationId) {
    try {
      const conversation = this.activeConversations.get(conversationId);

      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      const confirmation = conversation.context.confirmations.find(c => c.id === confirmationId);

      if (confirmation) {
        confirmation.confirmed = true;
        confirmation.confirmedAt = new Date();
        conversation.stage = 'applying_changes';
      }

      logger.info(`✅ Confirmation confirmed for conversation ${conversationId}`);

      return confirmation;
    } catch (error) {
      logger.error(`Confirmation confirmation failed: ${error.message}`);
      throw error;
    }
  }

  // STATE QUERIES

  async getConversationState(conversationId) {
    try {
      const conversation = await this.getConversation(conversationId, true);

      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      return {
        id: conversation.id,
        workflowId: conversation.workflowId,
        status: conversation.status,
        stage: conversation.stage,
        turnCount: conversation.turns.length,
        refinementCount: conversation.context.refinements.length,
        appliedRefinementCount: conversation.context.refinements.filter(r => r.applied).length,
        pendingClarifications: conversation.context.clarifications.filter(c => !c.answered).length,
        pendingConfirmations: conversation.context.confirmations.filter(c => !c.confirmed).length,
        createdAt: conversation.createdAt,
        startedAt: conversation.startedAt,
        lastActivityAt: conversation.lastActivityAt,
        endedAt: conversation.endedAt,
        outcome: conversation.outcome
      };
    } catch (error) {
      logger.error(`State retrieval failed: ${error.message}`);
      throw error;
    }
  }

  async getConversationHistory(conversationId) {
    try {
      const conversation = await this.getConversation(conversationId, true);

      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      return {
        id: conversation.id,
        workflowId: conversation.workflowId,
        status: conversation.status,
        stage: conversation.stage,
        createdAt: conversation.createdAt,
        endedAt: conversation.endedAt,
        outcome: conversation.outcome,
        turnCount: conversation.turns.length,
        transcript: conversation.turns.map(t => ({
          number: t.number,
          speaker: t.speaker,
          message: t.message,
          timestamp: t.timestamp,
          type: t.type || 'message'
        })),
        refinements: conversation.context.refinements,
        clarifications: conversation.context.clarifications,
        confirmations: conversation.context.confirmations
      };
    } catch (error) {
      logger.error(`History retrieval failed: ${error.message}`);
      throw error;
    }
  }

  async getWorkflowConversations(workflowId, activeOnly = true) {
    try {
      const conversationIds = this.conversationIndex.get(workflowId) || [];
      const conversations = [];

      for (const convId of conversationIds) {
        const conversation = this.activeConversations.get(convId);

        if (conversation && !activeOnly) {
          conversations.push(conversation);
        } else if (conversation && activeOnly) {
          conversations.push(conversation);
        } else if (!activeOnly) {
          const archived = this.archivedConversations.get(convId);
          if (archived) conversations.push(archived);
        }
      }

      return conversations;
    } catch (error) {
      logger.error(`Workflow conversations retrieval failed: ${error.message}`);
      throw error;
    }
  }

  // STATISTICS

  getStats() {
    const activeConversations = Array.from(this.activeConversations.values());
    const totalTurns = activeConversations.reduce((sum, c) => sum + c.turns.length, 0);
    const totalRefinements = activeConversations.reduce((sum, c) => sum + c.context.refinements.length, 0);

    return {
      activeConversations: this.activeConversations.size,
      archivedConversations: this.archivedConversations.size,
      totalConversations: this.activeConversations.size + this.archivedConversations.size,
      totalTurns,
      totalRefinements,
      avgTurnsPerConversation: activeConversations.length > 0 ? Math.round(totalTurns / activeConversations.length) : 0,
      avgRefinementsPerConversation: activeConversations.length > 0 ? Math.round(totalRefinements / activeConversations.length) : 0,
      timestamp: new Date()
    };
  }

  // CLEANUP

  async pruneArchivedConversations(olderThanDays = 30) {
    try {
      const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
      let prunedCount = 0;

      for (const [convId, conversation] of this.archivedConversations.entries()) {
        if (conversation.endedAt && conversation.endedAt < cutoffDate) {
          this.archivedConversations.delete(convId);
          prunedCount++;
        }
      }

      logger.info(`✅ Pruned ${prunedCount} archived conversations older than ${olderThanDays} days`);

      return prunedCount;
    } catch (error) {
      logger.error(`Pruning failed: ${error.message}`);
      throw error;
    }
  }
}

export { ConversationManager };
