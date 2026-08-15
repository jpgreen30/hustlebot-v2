/**
 * Retell AI Integration
 * Make outbound calls with AI-generated scripts
 *
 * Features:
 * - Create outbound calls with custom scripts
 * - Real-time call monitoring
 * - Recording and transcription
 * - Call analytics and results
 */

import logger from '../utils/logger.js';
import fetch from 'node-fetch';

class RetellIntegration {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.RETELL_API_KEY;
    this.baseUrl = 'https://api.retellai.com/v2';
    this.agentId = options.agentId || process.env.RETELL_AGENT_ID;
    this.initialized = false;
    this.calls = new Map();
  }

  async initialize() {
    if (!this.apiKey) {
      logger.warn('⚠️  RETELL_API_KEY not set, Retell integration disabled');
      return;
    }

    try {
      logger.info('☎️  Initializing Retell integration...');
      const response = await fetch(`${this.baseUrl}/list-agents`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Retell API error: ${response.status}`);
      }

      this.initialized = true;
      logger.info('✅ Retell integration ready');
    } catch (error) {
      logger.error('Retell initialization failed:', error.message);
      this.initialized = false;
    }
  }

  async makeOutboundCall(options) {
    if (!this.initialized) {
      throw new Error('Retell integration not initialized');
    }

    const {
      phoneNumber,
      script,
      name = 'Prospect',
      purpose = 'Business call',
      variables = {},
      onUpdate = null,
    } = options;

    if (!phoneNumber) throw new Error('Phone number required');
    if (!script) throw new Error('Script required');

    try {
      logger.info(`☎️  Making outbound call to ${phoneNumber}`);

      const response = await fetch(`${this.baseUrl}/start-outbound-call`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agent_id: this.agentId,
          phone_number: phoneNumber,
          custom_greeting: script,
          direction: 'outbound',
          metadata: {
            name,
            purpose,
            generatedAt: new Date().toISOString(),
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Call failed: ${error.error_message || response.statusText}`);
      }

      const callData = await response.json();
      const callId = callData.call_id;

      const callInfo = {
        callId,
        phoneNumber,
        name,
        purpose,
        script,
        status: 'initiating',
        startTime: new Date().toISOString(),
        duration: 0,
        transcript: null,
        recording: null,
        metadata: callData,
      };

      this.calls.set(callId, callInfo);
      logger.info(`☎️  Call initiated: ${callId}`);

      if (onUpdate) {
        this.pollCallStatus(callId, onUpdate);
      } else {
        this.pollCallStatus(callId);
      }

      return callInfo;
    } catch (error) {
      logger.error('Failed to make outbound call:', error.message);
      throw error;
    }
  }

  async pollCallStatus(callId, onUpdate = null) {
    const pollInterval = setInterval(async () => {
      try {
        const callInfo = this.calls.get(callId);
        if (!callInfo) {
          clearInterval(pollInterval);
          return;
        }

        const response = await fetch(`${this.baseUrl}/get-call/${callId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          clearInterval(pollInterval);
          return;
        }

        const data = await response.json();
        callInfo.status = data.call_status;
        callInfo.duration = data.call_duration || 0;
        callInfo.transcript = data.transcript || null;
        callInfo.recording = data.recording_url || null;
        callInfo.summary = data.call_summary || null;

        logger.info(`☎️  Call ${callId} status: ${data.call_status}`);

        if (onUpdate) onUpdate(callInfo);

        if (['completed', 'failed', 'no_answer'].includes(data.call_status)) {
          clearInterval(pollInterval);
          logger.info(`☎️  Call ${callId} finished: ${data.call_status}`);
        }
      } catch (error) {
        logger.error(`Error polling call ${callId}:`, error.message);
      }
    }, 5000);
  }

  async getCallResults(callId) {
    const callInfo = this.calls.get(callId);
    if (!callInfo) throw new Error('Call not found');

    return {
      callId,
      phoneNumber: callInfo.phoneNumber,
      name: callInfo.name,
      purpose: callInfo.purpose,
      status: callInfo.status,
      duration: callInfo.duration,
      startTime: callInfo.startTime,
      transcript: callInfo.transcript,
      summary: callInfo.summary,
      recording: callInfo.recording,
    };
  }

  async listCalls(limit = 10) {
    const callArray = Array.from(this.calls.values());
    return callArray.slice(-limit).reverse();
  }

  async getAnalytics(timeRange = '24h') {
    const calls = Array.from(this.calls.values());
    const completed = calls.filter(c => c.status === 'completed').length;
    const failed = calls.filter(c => c.status === 'failed').length;
    const total = calls.length;

    return {
      totalCalls: total,
      completedCalls: completed,
      failedCalls: failed,
      successRate: total > 0 ? ((completed / total) * 100).toFixed(2) + '%' : 'N/A',
    };
  }
}

export { RetellIntegration };
