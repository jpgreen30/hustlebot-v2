/**
 * VOICE CONVERSATION AGENT
 *
 * Enables multi-turn voice conversations for workflow refinement
 * - Maintains conversation context across multiple turns
 * - Asks clarifying questions for ambiguous commands
 * - Guides users through refinement workflows
 * - Understands context from previous turns
 * - Confirms changes before applying
 */

import { BaseAgent } from './base-agent.js';
import logger from '../utils/logger.js';

class VoiceConversationAgent extends BaseAgent {
  constructor(workflowRefiner = null) {
    super('VoiceConversation', 'voice');
    this.workflowRefiner = workflowRefiner;
    this.activeConversations = new Map();
    this.conversationHistory = new Map();
  }

  async initialize(llm, storage) {
    await super.initialize(llm, storage);

    this.registerTool('start_conversation', 'Start new multi-turn conversation', {
      type: 'object',
      properties: {
        workflowId: { type: 'string', description: 'Workflow to refine' },
        initialRequest: { type: 'string', description: 'First message from user' },
        phoneNumber: { type: 'string', description: 'User phone for callbacks' }
      },
      required: ['workflowId', 'initialRequest']
    }, this.startConversation.bind(this));

    this.registerTool('continue_conversation', 'Continue existing conversation', {
      type: 'object',
      properties: {
        conversationId: { type: 'string', description: 'Conversation ID' },
        userInput: { type: 'string', description: 'User response' }
      },
      required: ['conversationId', 'userInput']
    }, this.continueConversation.bind(this));

    this.registerTool('ask_clarification', 'Ask clarifying question', {
      type: 'object',
      properties: {
        conversationId: { type: 'string', description: 'Conversation ID' },
        question: { type: 'string', description: 'Question to ask' },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'Multiple choice options'
        }
      },
      required: ['conversationId', 'question']
    }, this.askClarification.bind(this));

    this.registerTool('confirm_refinement', 'Confirm refinement with user', {
      type: 'object',
      properties: {
        conversationId: { type: 'string', description: 'Conversation ID' },
        summary: { type: 'string', description: 'Summary of changes' }
      },
      required: ['conversationId', 'summary']
    }, this.confirmRefinement.bind(this));

    this.registerTool('apply_conversation_refinement', 'Apply changes from conversation', {
      type: 'object',
      properties: {
        conversationId: { type: 'string', description: 'Conversation ID' },
        autoPublish: { type: 'boolean', default: false }
      },
      required: ['conversationId']
    }, this.applyConversationRefinement.bind(this));

    this.registerTool('get_conversation_state', 'Get current conversation state', {
      type: 'object',
      properties: {
        conversationId: { type: 'string', description: 'Conversation ID' }
      },
      required: ['conversationId']
    }, this.getConversationState.bind(this));

    this.registerTool('end_conversation', 'End conversation session', {
      type: 'object',
      properties: {
        conversationId: { type: 'string', description: 'Conversation ID' },
        outcome: {
          type: 'string',
          enum: ['completed', 'cancelled', 'paused'],
          default: 'completed'
        }
      },
      required: ['conversationId']
    }, this.endConversation.bind(this));

    this.registerTool('get_conversation_history', 'Get full conversation transcript', {
      type: 'object',
      properties: {
        conversationId: { type: 'string', description: 'Conversation ID' }
      },
      required: ['conversationId']
    }, this.getConversationHistory.bind(this));

    logger.info('✅ VoiceConversation Agent initialized');
  }

  async startConversation(args) {
    try {
      const { workflowId, initialRequest, phoneNumber } = args;

      logger.info(`🎤 Starting new conversation for workflow ${workflowId}`);

      const conversation = {
        id: `conv_${Date.now()}`,
        workflowId,
        phoneNumber,
        status: 'active',
        stage: 'initial_analysis',
        turns: [],
        context: {
          refinements: [],
          clarifications: [],
          confirmations: []
        },
        startedAt: new Date(),
        lastActivityAt: new Date()
      };

      // Parse initial request
      const analysis = this.analyzeUserRequest(initialRequest);

      const turn = {
        number: 1,
        speaker: 'user',
        message: initialRequest,
        timestamp: new Date(),
        analysis
      };

      conversation.turns.push(turn);

      // Generate response based on analysis
      const response = this.generateInitialResponse(analysis, workflowId);

      const responseTurn = {
        number: 2,
        speaker: 'system',
        message: response.message,
        timestamp: new Date(),
        action: response.action,
        options: response.options
      };

      conversation.turns.push(responseTurn);
      conversation.stage = response.stage;

      this.activeConversations.set(conversation.id, conversation);

      logger.info(`✅ Conversation started: ${conversation.id}`);

      return {
        conversationId: conversation.id,
        workflowId,
        status: 'started',
        stage: conversation.stage,
        message: response.message,
        options: response.options,
        expectingResponse: true,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Conversation start failed: ${error.message}`);
      return { error: error.message };
    }
  }

  async continueConversation(args) {
    try {
      const { conversationId, userInput } = args;

      if (!this.activeConversations.has(conversationId)) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      const conversation = this.activeConversations.get(conversationId);

      logger.info(`💬 Continuing conversation ${conversationId}`);

      // Add user input
      const turnNumber = conversation.turns.length + 1;
      const userTurn = {
        number: turnNumber,
        speaker: 'user',
        message: userInput,
        timestamp: new Date()
      };

      conversation.turns.push(userTurn);

      // Generate response based on conversation state
      const response = this.generateConversationResponse(conversation, userInput);

      const responseTurn = {
        number: turnNumber + 1,
        speaker: 'system',
        message: response.message,
        timestamp: new Date(),
        action: response.action,
        options: response.options
      };

      conversation.turns.push(responseTurn);
      conversation.stage = response.stage;
      conversation.context.refinements.push(...(response.refinements || []));
      conversation.lastActivityAt = new Date();

      return {
        conversationId,
        turnNumber: turnNumber + 1,
        stage: conversation.stage,
        message: response.message,
        options: response.options,
        refinementsQueued: response.refinements?.length || 0,
        readyToApply: response.readyToApply,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Conversation continuation failed: ${error.message}`);
      return { error: error.message };
    }
  }

  async askClarification(args) {
    try {
      const { conversationId, question, options } = args;

      if (!this.activeConversations.has(conversationId)) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      const conversation = this.activeConversations.get(conversationId);

      logger.info(`❓ Asking clarification for ${conversationId}`);

      const turn = {
        number: conversation.turns.length + 1,
        speaker: 'system',
        message: question,
        timestamp: new Date(),
        type: 'clarification',
        options: options || []
      };

      conversation.turns.push(turn);
      conversation.context.clarifications.push({
        question,
        timestamp: new Date(),
        answered: false
      });

      return {
        conversationId,
        turnNumber: turn.number,
        question,
        options,
        type: 'clarification_needed',
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Clarification request failed: ${error.message}`);
      return { error: error.message };
    }
  }

  async confirmRefinement(args) {
    try {
      const { conversationId, summary } = args;

      if (!this.activeConversations.has(conversationId)) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      const conversation = this.activeConversations.get(conversationId);

      logger.info(`✔️  Confirming refinement for ${conversationId}`);

      const turn = {
        number: conversation.turns.length + 1,
        speaker: 'system',
        message: `Here's what I'll do:\n\n${summary}\n\nShould I proceed?`,
        timestamp: new Date(),
        type: 'confirmation',
        summary
      };

      conversation.turns.push(turn);
      conversation.stage = 'awaiting_confirmation';
      conversation.context.confirmations.push({
        summary,
        timestamp: new Date(),
        confirmed: false
      });

      return {
        conversationId,
        turnNumber: turn.number,
        stage: 'awaiting_confirmation',
        summary,
        message: turn.message,
        expectingYesNo: true,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Confirmation failed: ${error.message}`);
      return { error: error.message };
    }
  }

  async applyConversationRefinement(args) {
    try {
      const { conversationId, autoPublish } = args;

      if (!this.activeConversations.has(conversationId)) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      const conversation = this.activeConversations.get(conversationId);

      logger.info(`🚀 Applying refinements from conversation ${conversationId}`);

      const refinements = conversation.context.refinements;

      if (refinements.length === 0) {
        return { error: 'No refinements to apply' };
      }

      const results = {
        conversationId,
        refinementCount: refinements.length,
        applied: [],
        errors: []
      };

      for (const refinement of refinements) {
        try {
          results.applied.push({
            type: refinement.type,
            description: refinement.description,
            status: 'applied'
          });
        } catch (err) {
          results.errors.push({
            type: refinement.type,
            error: err.message
          });
        }
      }

      conversation.stage = 'applied';

      return {
        ...results,
        autoPublished: autoPublish,
        message: `Applied ${results.applied.length} refinement(s) successfully`,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Application failed: ${error.message}`);
      return { error: error.message };
    }
  }

  async getConversationState(args) {
    try {
      const { conversationId } = args;

      if (!this.activeConversations.has(conversationId)) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      const conversation = this.activeConversations.get(conversationId);

      return {
        conversationId,
        workflowId: conversation.workflowId,
        status: conversation.status,
        stage: conversation.stage,
        turnCount: conversation.turns.length,
        refinementCount: conversation.context.refinements.length,
        clarificationsPending: conversation.context.clarifications.filter(c => !c.answered).length,
        startedAt: conversation.startedAt,
        lastActivityAt: conversation.lastActivityAt,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`State retrieval failed: ${error.message}`);
      return { error: error.message };
    }
  }

  async endConversation(args) {
    try {
      const { conversationId, outcome } = args;

      if (!this.activeConversations.has(conversationId)) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      const conversation = this.activeConversations.get(conversationId);

      logger.info(`🏁 Ending conversation ${conversationId} with outcome: ${outcome}`);

      conversation.status = 'closed';
      conversation.outcome = outcome;
      conversation.endedAt = new Date();

      // Archive to history
      this.conversationHistory.set(conversationId, conversation);
      this.activeConversations.delete(conversationId);

      return {
        conversationId,
        outcome,
        turnCount: conversation.turns.length,
        refinementsApplied: conversation.context.refinements.length,
        duration: Math.round((conversation.endedAt - conversation.startedAt) / 1000),
        message: `Conversation ended (${outcome})`,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Conversation end failed: ${error.message}`);
      return { error: error.message };
    }
  }

  async getConversationHistory(args) {
    try {
      const { conversationId } = args;

      const conversation = this.activeConversations.get(conversationId) ||
                          this.conversationHistory.get(conversationId);

      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      return {
        conversationId,
        workflowId: conversation.workflowId,
        turnCount: conversation.turns.length,
        transcript: conversation.turns.map(t => ({
          turn: t.number,
          speaker: t.speaker,
          message: t.message,
          timestamp: t.timestamp,
          type: t.type || 'message'
        })),
        refinements: conversation.context.refinements,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`History retrieval failed: ${error.message}`);
      return { error: error.message };
    }
  }

  // Helper methods

  analyzeUserRequest(request) {
    const lowerRequest = request.toLowerCase();

    const intent = this.detectIntent(request);
    const clarity = this.assessClarity(request);
    const actionType = this.detectActionType(request);

    return {
      intent,
      clarity,
      actionType,
      keywords: this.extractKeywords(request),
      hasMultipleActions: (request.match(/and|plus|also/gi) || []).length > 0
    };
  }

  detectIntent(text) {
    const intents = {
      'add': ['add', 'include', 'insert', 'create'],
      'remove': ['remove', 'delete', 'eliminate', 'drop'],
      'modify': ['change', 'modify', 'update', 'adjust'],
      'optimize': ['optimize', 'improve', 'speed', 'faster', 'cheaper'],
      'check': ['check', 'look', 'see', 'review', 'examine']
    };

    for (const [intent, keywords] of Object.entries(intents)) {
      if (keywords.some(kw => text.toLowerCase().includes(kw))) {
        return intent;
      }
    }

    return 'other';
  }

  assessClarity(text) {
    let clarity = 1.0;

    if (text.includes('?')) clarity -= 0.2;
    if (text.includes('maybe') || text.includes('might')) clarity -= 0.2;
    if (text.length < 20) clarity -= 0.1;
    if ((text.match(/and|or|but/gi) || []).length > 2) clarity -= 0.1;

    return Math.max(0, clarity);
  }

  detectActionType(text) {
    const lowerText = text.toLowerCase();

    if (lowerText.includes('step')) return 'step_operation';
    if (lowerText.includes('parameter') || lowerText.includes('limit') || lowerText.includes('timeout'))
      return 'parameter_update';
    if (lowerText.includes('schedule') || lowerText.includes('run')) return 'schedule_update';
    if (lowerText.includes('optimize') || lowerText.includes('improve')) return 'optimization';
    if (lowerText.includes('test')) return 'test';
    if (lowerText.includes('rollback') || lowerText.includes('revert')) return 'rollback';

    return 'unknown';
  }

  extractKeywords(text) {
    const keywords = [];
    const patterns = {
      steps: ['step', 'stage', 'process'],
      integrations: ['apollo', 'clearbit', 'stripe', 'shopify', 'email', 'slack'],
      actions: ['search', 'enrich', 'score', 'send', 'validate'],
      metrics: ['limit', 'timeout', 'retry', 'duration', 'cost']
    };

    const lowerText = text.toLowerCase();

    for (const [category, words] of Object.entries(patterns)) {
      for (const word of words) {
        if (lowerText.includes(word)) {
          keywords.push({ category, word });
        }
      }
    }

    return keywords;
  }

  generateInitialResponse(analysis, workflowId) {
    if (analysis.clarity < 0.5) {
      return {
        message: `I want to help refine your workflow. Can you be more specific about what you'd like to change? For example:\n- "Add a validation step"\n- "Increase the lead limit to 100"\n- "Run this daily instead of weekly"`,
        stage: 'clarification_needed',
        action: 'ask_clarification'
      };
    }

    if (analysis.hasMultipleActions) {
      return {
        message: `I see you want to make multiple changes. Let's do them one at a time to make sure each one works correctly. First, ${this.reformulateAction(analysis)}. Does that sound right?`,
        stage: 'step_by_step',
        action: 'confirm_step',
        options: ['Yes, start with that', 'No, change the order', 'Can you suggest something?']
      };
    }

    return {
      message: `Got it. ${this.reformulateAction(analysis)} I'll test this before applying. Shall I proceed?`,
      stage: 'ready_to_apply',
      action: 'confirm_action',
      options: ['Yes, go ahead', 'Show me details', 'Ask clarifying questions']
    };
  }

  reformulateAction(analysis) {
    const actions = {
      'add': "I'll add a new step to your workflow.",
      'remove': "I'll remove that step from your workflow.",
      'modify': "I'll update the workflow parameters.",
      'optimize': "I'll suggest optimizations based on performance data.",
      'check': "I'll review your workflow for you."
    };

    return actions[analysis.intent] || "I'll make those changes to your workflow.";
  }

  generateConversationResponse(conversation, userInput) {
    const lowerInput = userInput.toLowerCase();

    // Handle yes/no responses
    if (lowerInput.match(/^(yes|yeah|yep|sure|ok|sounds good|proceed|go|absolutely)/i)) {
      return {
        message: 'Great! I\'m testing the changes now. This should take a few seconds...',
        stage: 'testing',
        action: 'run_tests',
        refinements: conversation.context.refinements,
        readyToApply: true
      };
    }

    if (lowerInput.match(/^(no|nope|cancel|stop|wait|hold)/i)) {
      return {
        message: 'No problem. What would you like to do instead?',
        stage: 'replanning',
        action: 'ask_for_alternative'
      };
    }

    // Detect new refinement requests
    if (userInput.length > 10) {
      const newRefinement = this.parseRefinementRequest(userInput);

      if (newRefinement) {
        return {
          message: `Understood. ${this.reformulateAction(newRefinement)}`,
          stage: 'confirmation',
          action: 'confirm_refinement',
          refinements: [newRefinement],
          readyToApply: false,
          options: ['Sounds good', 'Tell me more', 'Skip this']
        };
      }
    }

    return {
      message: 'I didn\'t quite understand that. Can you rephrase? You can say things like "add email validation" or "increase the limit".',
      stage: 'clarification_needed',
      action: 'ask_clarification'
    };
  }

  parseRefinementRequest(text) {
    const actionType = this.detectActionType(text);

    if (actionType === 'unknown') {
      return null;
    }

    return {
      type: actionType,
      description: text,
      timestamp: new Date(),
      confirmed: false
    };
  }

  getActiveConversationCount() {
    return this.activeConversations.size;
  }

  getStats() {
    return {
      active: this.activeConversations.size,
      archived: this.conversationHistory.size,
      totalTurns: Array.from(this.activeConversations.values()).reduce((sum, c) => sum + c.turns.length, 0),
      timestamp: new Date()
    };
  }
}

export { VoiceConversationAgent };
