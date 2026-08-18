/**
 * Retell AI Integration
 *
 * Official contract (verified 2026-08):
 *   POST https://api.retellai.com/v2/create-phone-call
 *   Auth: Authorization: Bearer <RETELL_API_KEY>
 *   Required: from_number, to_number (E.164)
 *   Optional: override_agent_id, retell_llm_dynamic_variables, metadata
 *   Response must include call_id. Never invent IDs.
 *
 *   POST https://api.retellai.com/v2/list-agents  (health / init probe)
 *   GET  https://api.retellai.com/v2/get-call/{call_id}
 */

import logger from '../utils/logger.js';

const RETELL_BASE = 'https://api.retellai.com/v2';
const TERMINAL_STATUSES = new Set(['ended', 'error', 'not_connected']);

function normalizeE164(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (trimmed.startsWith('+')) {
    const digits = `+${trimmed.slice(1).replace(/\D/g, '')}`;
    return digits.length >= 9 ? digits : null;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length >= 8) return `+${digits}`;
  return null;
}

function allowedNumbers() {
  const raw = [
    process.env.RETELL_TEST_NUMBER,
    process.env.RETELL_ALLOWED_NUMBERS
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(','))
    .map((value) => normalizeE164(value))
    .filter(Boolean);
  return [...new Set(raw)];
}

class RetellIntegration {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.RETELL_API_KEY;
    this.baseUrl = RETELL_BASE;
    this.agentId = options.agentId || process.env.RETELL_AGENT_ID;
    this.fromNumber = options.fromNumber || process.env.RETELL_FROM_NUMBER || null;
    this.initialized = false;
    this.lastProbe = null;
    this.lastError = null;
    this.calls = new Map();
  }

  headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  isReady() {
    return Boolean(this.initialized && this.apiKey);
  }

  async initialize() {
    if (!this.apiKey) {
      logger.warn('⚠️  RETELL_API_KEY not set, Retell integration disabled');
      this.initialized = false;
      this.lastError = 'RETELL_API_KEY not set';
      return;
    }

    try {
      logger.info('☎️  Initializing Retell integration...');
      const probe = await this.probe();
      if (probe.state !== 'HEALTHY') {
        throw new Error(probe.detail || 'Retell probe failed');
      }
      this.initialized = true;
      this.lastError = null;
      logger.info('✅ Retell integration ready');
    } catch (error) {
      logger.error('Retell initialization failed:', error.message);
      this.initialized = false;
      this.lastError = error.message;
    }
  }

  async probe() {
    if (!this.apiKey) {
      this.lastProbe = {
        state: 'MISCONFIGURED',
        detail: 'RETELL_API_KEY not set',
        at: new Date().toISOString()
      };
      return this.lastProbe;
    }

    try {
      const response = await fetch(`${this.baseUrl}/list-agents`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({})
      });

      if (response.status === 401 || response.status === 403) {
        this.lastProbe = {
          state: 'MISCONFIGURED',
          detail: `Retell auth failed (${response.status})`,
          at: new Date().toISOString()
        };
        return this.lastProbe;
      }

      if (!response.ok) {
        this.lastProbe = {
          state: 'UNAVAILABLE',
          detail: `Retell list-agents HTTP ${response.status}`,
          at: new Date().toISOString()
        };
        return this.lastProbe;
      }

      this.lastProbe = {
        state: 'HEALTHY',
        detail: 'list-agents ok',
        at: new Date().toISOString()
      };
      return this.lastProbe;
    } catch (error) {
      this.lastProbe = {
        state: 'UNAVAILABLE',
        detail: error.message,
        at: new Date().toISOString()
      };
      return this.lastProbe;
    }
  }

  /**
   * Place an outbound phone call via the official create-phone-call API.
   * Throws on provider/config failure. Never fabricates a call_id.
   */
  async makeOutboundCall(options = {}) {
    if (!this.apiKey) {
      return {
        status: 'misconfigured',
        error: 'RETELL_API_KEY not set',
        provider: 'retell'
      };
    }
    if (!this.initialized) {
      return {
        status: 'unavailable',
        error: this.lastError || 'Retell integration not initialized',
        provider: 'retell'
      };
    }

    const {
      phoneNumber,
      script,
      name = 'Prospect',
      purpose = 'Business call',
      variables = {},
      agentId = null,
      onUpdate = null
    } = options;

    const toNumber = normalizeE164(phoneNumber);
    if (!toNumber) {
      return {
        status: 'failed',
        error: 'Phone number required in E.164 format',
        provider: 'retell'
      };
    }
    if (!script) {
      return {
        status: 'failed',
        error: 'Script required',
        provider: 'retell'
      };
    }

    const fromNumber = normalizeE164(this.fromNumber || process.env.RETELL_FROM_NUMBER);
    if (!fromNumber) {
      return {
        status: 'misconfigured',
        error: 'RETELL_FROM_NUMBER not set (Retell-owned E.164 caller ID)',
        provider: 'retell'
      };
    }

    const allow = allowedNumbers();
    if (allow.length > 0 && !allow.includes(toNumber)) {
      return {
        status: 'failed',
        error: `Number ${toNumber} is not on the authorized test allowlist`,
        provider: 'retell'
      };
    }

    const overrideAgentId = agentId || this.agentId || process.env.RETELL_AGENT_ID || null;

    const body = {
      from_number: fromNumber,
      to_number: toNumber,
      metadata: {
        name,
        purpose,
        source: 'hustlebot-v2',
        generatedAt: new Date().toISOString()
      },
      retell_llm_dynamic_variables: {
        script: String(script),
        name: String(name),
        purpose: String(purpose),
        ...variables
      }
    };
    if (overrideAgentId) body.override_agent_id = overrideAgentId;

    try {
      logger.info(`☎️  Creating Retell outbound call to ${toNumber}`);

      const response = await fetch(`${this.baseUrl}/create-phone-call`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body)
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          payload?.error ||
          payload?.error_message ||
          payload?.message ||
          response.statusText;
        throw new Error(`Retell create-phone-call failed (${response.status}): ${message}`);
      }

      const callId = payload.call_id;
      if (!callId) {
        throw new Error('Retell response missing call_id - protocol violation');
      }

      const callInfo = {
        callId,
        phoneNumber: toNumber,
        fromNumber,
        name,
        purpose,
        script,
        status: payload.call_status || 'registered',
        startTime: new Date().toISOString(),
        duration: 0,
        transcript: null,
        recording: null,
        provider: 'retell',
        metadata: payload
      };

      this.calls.set(callId, callInfo);
      logger.info(`☎️  Call initiated: ${callId} (${callInfo.status})`);

      if (onUpdate) this.pollCallStatus(callId, onUpdate);

      return callInfo;
    } catch (error) {
      logger.error('Failed to make outbound call:', error.message);
      return {
        status: 'failed',
        error: error.message,
        provider: 'retell'
      };
    }
  }

  /**
   * Compatibility alias used by existing HTTP routes / voice workflow builder.
   */
  async initiateOutboundCall(agentId, phoneNumber, callContext = {}) {
    return this.makeOutboundCall({
      phoneNumber,
      agentId,
      script:
        callContext.script ||
        callContext.greeting ||
        callContext.custom_greeting ||
        'Hello from HustleBot.',
      name: callContext.name,
      purpose: callContext.purpose,
      variables: callContext.variables || {}
    });
  }

  async pollCallStatus(callId, onUpdate = null) {
    const pollInterval = setInterval(async () => {
      try {
        const callInfo = this.calls.get(callId);
        if (!callInfo) {
          clearInterval(pollInterval);
          return;
        }

        const data = await this.getCall(callId);
        if (!data) {
          clearInterval(pollInterval);
          return;
        }

        callInfo.status = data.call_status || callInfo.status;
        callInfo.duration = data.duration_ms || data.call_duration || 0;
        callInfo.transcript = data.transcript || null;
        callInfo.recording = data.recording_url || null;
        callInfo.summary = data.call_analysis?.call_summary || data.call_summary || null;

        logger.info(`☎️  Call ${callId} status: ${callInfo.status}`);
        if (onUpdate) onUpdate(callInfo);

        if (TERMINAL_STATUSES.has(callInfo.status)) {
          clearInterval(pollInterval);
          logger.info(`☎️  Call ${callId} finished: ${callInfo.status}`);
        }
      } catch (error) {
        logger.error(`Error polling call ${callId}: ${error.message}`);
      }
    }, 5000);

    if (typeof pollInterval.unref === 'function') pollInterval.unref();
    const stop = setTimeout(() => clearInterval(pollInterval), 15 * 60 * 1000);
    if (typeof stop.unref === 'function') stop.unref();
  }

  async getCall(callId) {
    const response = await fetch(`${this.baseUrl}/get-call/${callId}`, {
      method: 'GET',
      headers: this.headers()
    });
    if (!response.ok) return null;
    return response.json();
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
      recording: callInfo.recording
    };
  }

  async listCalls(limit = 10) {
    return Array.from(this.calls.values()).slice(-limit).reverse();
  }

  async getAnalytics(timeRange = '24h') {
    const calls = Array.from(this.calls.values());
    const completed = calls.filter((c) => c.status === 'ended').length;
    const failed = calls.filter((c) => c.status === 'error').length;
    const total = calls.length;
    return {
      timeRange,
      totalCalls: total,
      completedCalls: completed,
      failedCalls: failed,
      successRate: total > 0 ? `${((completed / total) * 100).toFixed(2)}%` : 'N/A'
    };
  }

  getStatus() {
    return {
      initialized: this.initialized,
      configured: Boolean(this.apiKey),
      fromNumberConfigured: Boolean(this.fromNumber || process.env.RETELL_FROM_NUMBER),
      agentConfigured: Boolean(this.agentId),
      lastProbe: this.lastProbe,
      lastError: this.lastError,
      totalCalls: this.calls.size
    };
  }

  async getHealth() {
    const probe = this.lastProbe || (await this.probe());
    if (!this.apiKey) {
      return { state: 'MISCONFIGURED', detail: 'RETELL_API_KEY not set' };
    }
    if (!process.env.RETELL_FROM_NUMBER && !this.fromNumber) {
      return {
        state: probe.state === 'HEALTHY' ? 'DEGRADED' : probe.state,
        detail: 'RETELL_FROM_NUMBER missing — outbound calls cannot be placed'
      };
    }
    return { state: probe.state, detail: probe.detail };
  }
}

export { RetellIntegration, normalizeE164 };
