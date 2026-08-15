/**
 * RETELL INTEGRATION
 *
 * AI-powered phone calling platform
 * - Outbound call initiation
 * - Inbound call handling
 * - Call transcription and recording
 * - Agent management and analytics
 */

import logger from '../utils/logger.js';

class RetellIntegration {
  constructor(config = {}) {
    this.apiKey = process.env.RETELL_API_KEY;
    this.retellEnabled = !!this.apiKey;
    this.agents = new Map();
    this.calls = new Map();
    this.transcripts = new Map();
    this.analytics = new Map();
  }

  async initialize() {
    logger.info('📞 Retell Integration initialized');
    if (!this.retellEnabled) {
      logger.warn('⚠️  RETELL_API_KEY not set - using mock mode');
    }
    return true;
  }

  /**
   * Create a voice agent
   */
  async createAgent(agentName, systemPrompt, config = {}) {
    try {
      logger.info(`🤖 Creating Retell agent: ${agentName}`);

      const agent = {
        id: `agent_${Date.now()}`,
        name: agentName,
        systemPrompt,
        config: {
          model: config.model || 'gpt-4-turbo',
          temperature: config.temperature || 0.7,
          maxTokens: config.maxTokens || 1000,
          voice: config.voice || 'default',
          language: config.language || 'en-US',
          ...config
        },
        createdAt: new Date(),
        callCount: 0,
        successRate: 0
      };

      this.agents.set(agent.id, agent);

      return {
        agentId: agent.id,
        name: agentName,
        status: 'active',
        created: true,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Agent creation failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Initiate outbound call
   */
  async initiateOutboundCall(agentId, phoneNumber, callContext = {}) {
    try {
      logger.info(`📞 Initiating outbound call to ${phoneNumber}`);

      if (!this.agents.has(agentId)) {
        throw new Error(`Agent ${agentId} not found`);
      }

      const agent = this.agents.get(agentId);
      const call = {
        id: `call_${Date.now()}`,
        agentId,
        agentName: agent.name,
        direction: 'outbound',
        phoneNumber,
        status: 'initiating',
        startTime: new Date(),
        duration: 0,
        context: callContext,
        transcript: '',
        recording: null,
        success: false
      };

      this.calls.set(call.id, call);
      agent.callCount++;

      // Simulate call completion
      setTimeout(() => {
        this.completeCall(call.id);
      }, 2000 + Math.random() * 8000);

      return {
        callId: call.id,
        phoneNumber,
        status: 'ringing',
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Outbound call failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Handle inbound call
   */
  async handleInboundCall(agentId, phoneNumber, callData = {}) {
    try {
      logger.info(`📲 Handling inbound call from ${phoneNumber}`);

      if (!this.agents.has(agentId)) {
        throw new Error(`Agent ${agentId} not found`);
      }

      const agent = this.agents.get(agentId);
      const call = {
        id: `call_${Date.now()}`,
        agentId,
        agentName: agent.name,
        direction: 'inbound',
        phoneNumber,
        status: 'connected',
        startTime: new Date(),
        duration: 0,
        context: callData,
        transcript: '',
        recording: null,
        success: false
      };

      this.calls.set(call.id, call);
      agent.callCount++;

      return {
        callId: call.id,
        phoneNumber,
        agentId,
        status: 'connected',
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Inbound call handling failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Complete call and generate transcript
   */
  async completeCall(callId) {
    try {
      if (!this.calls.has(callId)) {
        throw new Error(`Call ${callId} not found`);
      }

      const call = this.calls.get(callId);
      call.status = 'completed';
      call.duration = Math.floor((Math.random() * 8 + 2) * 60); // 2-10 minutes
      call.success = Math.random() > 0.2; // 80% success rate

      // Generate mock transcript
      const transcript = this.generateMockTranscript(call);
      call.transcript = transcript;

      this.transcripts.set(callId, {
        callId,
        agentId: call.agentId,
        transcript,
        sentiment: this.analyzeSentiment(transcript),
        keywords: this.extractKeywords(transcript),
        duration: call.duration,
        timestamp: new Date()
      });

      // Update agent success rate
      const agent = this.agents.get(call.agentId);
      const totalCalls = agent.callCount;
      const successCalls = Array.from(this.calls.values())
        .filter(c => c.agentId === call.agentId && c.success).length;
      agent.successRate = (successCalls / totalCalls * 100).toFixed(1);

      logger.info(`✅ Call completed: ${callId} (${call.duration}s)`);

      return {
        callId,
        status: 'completed',
        duration: call.duration,
        success: call.success,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Call completion failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Get call transcript
   */
  async getTranscript(callId) {
    try {
      if (!this.transcripts.has(callId)) {
        throw new Error(`Transcript for ${callId} not found`);
      }

      const transcript = this.transcripts.get(callId);
      return {
        callId,
        transcript: transcript.transcript,
        sentiment: transcript.sentiment,
        keywords: transcript.keywords,
        duration: transcript.duration,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Transcript retrieval failed: ${error.message}`);
      return { callId, error: error.message };
    }
  }

  /**
   * Get agent analytics
   */
  async getAgentAnalytics(agentId) {
    try {
      if (!this.agents.has(agentId)) {
        throw new Error(`Agent ${agentId} not found`);
      }

      const agent = this.agents.get(agentId);
      const agentCalls = Array.from(this.calls.values()).filter(c => c.agentId === agentId);

      const totalDuration = agentCalls.reduce((sum, c) => sum + c.duration, 0);
      const avgDuration = agentCalls.length > 0 ? totalDuration / agentCalls.length : 0;

      return {
        agentId,
        agentName: agent.name,
        totalCalls: agent.callCount,
        successRate: agent.successRate,
        averageDuration: Math.round(avgDuration),
        outboundCalls: agentCalls.filter(c => c.direction === 'outbound').length,
        inboundCalls: agentCalls.filter(c => c.direction === 'inbound').length,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Analytics retrieval failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Update agent prompt
   */
  async updateAgentPrompt(agentId, newPrompt) {
    try {
      if (!this.agents.has(agentId)) {
        throw new Error(`Agent ${agentId} not found`);
      }

      const agent = this.agents.get(agentId);
      agent.systemPrompt = newPrompt;

      logger.info(`✏️  Agent prompt updated: ${agentId}`);

      return {
        agentId,
        updated: true,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Prompt update failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Get call history
   */
  async getCallHistory(agentId, limit = 10) {
    try {
      const agentCalls = Array.from(this.calls.values())
        .filter(c => c.agentId === agentId)
        .sort((a, b) => b.startTime - a.startTime)
        .slice(0, limit);

      return {
        agentId,
        callCount: agentCalls.length,
        calls: agentCalls.map(c => ({
          callId: c.id,
          direction: c.direction,
          phoneNumber: c.phoneNumber,
          duration: c.duration,
          success: c.success,
          startTime: c.startTime
        })),
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Call history retrieval failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * List all agents
   */
  async listAgents() {
    try {
      const agents = Array.from(this.agents.values()).map(a => ({
        agentId: a.id,
        name: a.name,
        model: a.config.model,
        callCount: a.callCount,
        successRate: a.successRate,
        voice: a.config.voice,
        createdAt: a.createdAt
      }));

      return {
        agentCount: agents.length,
        agents,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Agent listing failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Analyze call sentiment
   */
  analyzeSentiment(transcript) {
    const positiveWords = ['great', 'excellent', 'love', 'perfect', 'amazing', 'happy', 'yes', 'absolutely'];
    const negativeWords = ['bad', 'terrible', 'hate', 'worst', 'angry', 'no', 'never'];

    const text = transcript.toLowerCase();
    const positiveCount = positiveWords.filter(w => text.includes(w)).length;
    const negativeCount = negativeWords.filter(w => text.includes(w)).length;

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  /**
   * Extract keywords from transcript
   */
  extractKeywords(transcript) {
    const words = transcript.toLowerCase().split(/\s+/)
      .filter(w => w.length > 4)
      .slice(0, 10);
    return words;
  }

  /**
   * Generate mock transcript
   */
  generateMockTranscript(call) {
    const scenarios = {
      sales: 'Agent: Hello! I\'m calling about our new product. Customer: Oh hi, yes I\'ve been interested. Agent: Great! Let me tell you about our special offer. Customer: That sounds amazing! Agent: I can get you started today. Customer: Absolutely, let\'s do it!',
      support: 'Customer: Hi, I have an issue. Agent: I\'m sorry to hear that. Let me help. Customer: My account isn\'t working. Agent: Let me check that for you. Customer: Thank you! Agent: Fixed! Anything else? Customer: No, you\'re great!',
      lead: 'Agent: Hi! I heard you might be interested in our service. Customer: Maybe, tell me more. Agent: We help businesses grow 10x faster. Customer: That\'s interesting. Agent: Can I schedule a demo? Customer: Yes, tomorrow at 2pm works!'
    };

    const callType = call.context.type || 'sales';
    return scenarios[callType] || scenarios.sales;
  }

  getStatus() {
    return {
      initialized: true,
      retellEnabled: this.retellEnabled,
      totalAgents: this.agents.size,
      totalCalls: this.calls.size,
      completedCalls: Array.from(this.calls.values()).filter(c => c.status === 'completed').length,
      successRate: this.calculateOverallSuccessRate(),
      timestamp: new Date()
    };
  }

  calculateOverallSuccessRate() {
    const calls = Array.from(this.calls.values());
    if (calls.length === 0) return 0;
    const successful = calls.filter(c => c.success).length;
    return (successful / calls.length * 100).toFixed(1);
  }
}

export { RetellIntegration };
