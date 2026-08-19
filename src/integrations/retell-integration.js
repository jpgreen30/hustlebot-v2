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
 *   POST https://api.retellai.com/v2/list-agents
 *   GET  https://api.retellai.com/v2/list-phone-numbers
 *   GET  https://api.retellai.com/v2/get-call/{call_id}
 */

import logger from '../utils/logger.js';

const RETELL_BASE = 'https://api.retellai.com/v2';
const TERMINAL_STATUSES = new Set(['ended', 'error', 'not_connected']);
const DEFAULT_TEST_NUMBER = '+18184381415';

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
    process.env.RETELL_TEST_NUMBER || DEFAULT_TEST_NUMBER,
    process.env.RETELL_ALLOWED_NUMBERS
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(','))
    .map((value) => normalizeE164(value))
    .filter(Boolean);
  return [...new Set(raw)];
}

function retellErrorMessage(payload, status, statusText) {
  if (typeof payload === 'string' && payload.trim()) return payload.trim();
  return (
    payload?.error?.message ||
    payload?.error_message ||
    payload?.message ||
    (typeof payload?.error === 'string' ? payload.error : null) ||
    statusText ||
    `HTTP ${status}`
  );
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
    this.ownedNumbers = [];
    this.resolvedFromNumber = null;
    this.resolvedAgentId = null;
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
      await this.refreshOwnedNumbers().catch((error) => {
        logger.warn(`Retell list-phone-numbers failed: ${error.message}`);
      });
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

  async listPhoneNumbers() {
    const response = await fetch(`${this.baseUrl}/list-phone-numbers?limit=100`, {
      method: 'GET',
      headers: this.headers()
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Retell list-phone-numbers failed (${response.status}): ${retellErrorMessage(payload, response.status, response.statusText)}`);
    }
    return Array.isArray(payload) ? payload : payload.items || [];
  }

  async refreshOwnedNumbers() {
    this.ownedNumbers = await this.listPhoneNumbers();
    return this.ownedNumbers;
  }

  async resolveOutboundIdentity() {
    let numbers = this.ownedNumbers;
    if (!Array.isArray(numbers) || numbers.length === 0) {
      try {
        numbers = await this.refreshOwnedNumbers();
      } catch (error) {
        logger.warn(`Could not list Retell phone numbers: ${error.message}`);
        numbers = [];
      }
    }

    const envFrom = normalizeE164(this.fromNumber || process.env.RETELL_FROM_NUMBER);
    const match = numbers.find((item) => item?.phone_number === envFrom);
    const withOutbound = numbers.find((item) => Array.isArray(item?.outbound_agents) && item.outbound_agents.length > 0);
    const chosen = match || withOutbound || numbers[0] || null;

    if (!chosen && !envFrom) {
      return {
        error: 'No Retell-owned from_number on this account and RETELL_FROM_NUMBER is not set'
      };
    }

    const fromNumber = chosen?.phone_number || envFrom;
    const boundAgent =
      chosen?.outbound_agents?.[0]?.agent_id ||
      chosen?.inbound_agents?.[0]?.agent_id ||
      null;
    const envAgent = this.agentId || process.env.RETELL_AGENT_ID || null;
    const agentId = boundAgent || envAgent || null;

    this.resolvedFromNumber = fromNumber;
    this.resolvedAgentId = agentId;
    if (chosen && envFrom && chosen.phone_number !== envFrom) {
      logger.warn(`RETELL_FROM_NUMBER ${envFrom} is not on this Retell account; using ${fromNumber}`);
    }

    return { fromNumber, agentId, owned: Boolean(chosen) };
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
      purpose = 'HustleBot production test',
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

    const allow = allowedNumbers();
    if (allow.length > 0 && !allow.includes(toNumber)) {
      return {
        status: 'failed',
        error: `Number ${toNumber} is not on the authorized test allowlist`,
        provider: 'retell'
      };
    }

    const identity = await this.resolveOutboundIdentity();
    if (identity.error) {
      return {
        status: 'misconfigured',
        error: identity.error,
        provider: 'retell'
      };
    }

    const fromNumber = identity.fromNumber;
    if (!fromNumber) {
      return {
        status: 'misconfigured',
        error: 'RETELL_FROM_NUMBER not set and no Retell-owned caller ID is available',
        provider: 'retell'
      };
    }

    const overrideAgentId = agentId || identity.agentId || null;

    const attempt = async ({ includeAgent }) => {
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
      if (includeAgent && overrideAgentId) body.override_agent_id = overrideAgentId;

      logger.info(`☎️  Creating Retell outbound call to ${toNumber} from ${fromNumber}`);
      const response = await fetch(`${this.baseUrl}/create-phone-call`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({}));
      return { response, payload, body };
    };

    try {
      let { response, payload, body } = await attempt({ includeAgent: true });

      if (!response.ok && response.status === 404 && body.override_agent_id) {
        logger.warn('Retell create-phone-call 404 with override_agent_id; retrying with number-bound agent only');
        ({ response, payload, body } = await attempt({ includeAgent: false }));
      }

      if (!response.ok) {
        const message = retellErrorMessage(payload, response.status, response.statusText);
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

      const live = await this.getCall(callId);
      if (live) {
        callInfo.status = live.call_status || callInfo.status;
        callInfo.duration = live.duration_ms || live.call_duration || 0;
        callInfo.transcript = live.transcript || null;
        callInfo.recording = live.recording_url || null;
        callInfo.providerStatus = live.call_status || null;
        callInfo.metadata = { ...payload, live };
      }

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

  async listAgents() {
    const response = await fetch(`${this.baseUrl}/list-agents`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({})
    });
    if (!response.ok) {
      throw new Error(`Retell list-agents failed (${response.status})`);
    }
    return response.json();
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
    const live = await this.getCall(callId);
    if (!callInfo && !live) throw new Error('Call not found');

    return {
      callId,
      phoneNumber: callInfo?.phoneNumber || live?.to_number || null,
      name: callInfo?.name,
      purpose: callInfo?.purpose,
      status: live?.call_status || callInfo?.status || 'unknown',
      duration: live?.duration_ms || callInfo?.duration || 0,
      startTime: callInfo?.startTime,
      transcript: live?.transcript || callInfo?.transcript || null,
      summary: live?.call_analysis?.call_summary || callInfo?.summary || null,
      recording: live?.recording_url || callInfo?.recording || null,
      provider: 'retell',
      live: live || null
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
      fromNumberConfigured: Boolean(this.fromNumber || process.env.RETELL_FROM_NUMBER || this.resolvedFromNumber),
      agentConfigured: Boolean(this.agentId || this.resolvedAgentId),
      ownedNumberCount: this.ownedNumbers.length,
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
    if (!process.env.RETELL_FROM_NUMBER && !this.fromNumber && this.ownedNumbers.length === 0) {
      return {
        state: probe.state === 'HEALTHY' ? 'DEGRADED' : probe.state,
        detail: 'No Retell-owned from_number available — outbound calls cannot be placed'
      };
    }
    return { state: probe.state, detail: probe.detail };
  }
}

export { RetellIntegration, normalizeE164, DEFAULT_TEST_NUMBER };
