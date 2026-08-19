/**
 * ACTION BRIDGE
 *
 * Connects natural-language intent detection to capability execution.
 *
 * Pattern:
 *   intent → validate → invoke → format → return
 *
 * Provider failures remain failures. Conversational fallback is used only
 * when no capability was selected.
 */

import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

const FAILURE_STATUSES = new Set(['failed', 'unavailable', 'misconfigured', 'error']);
const MIN_CONFIDENCE = 0.55;

class ActionBridge {
  constructor({ registry, capabilityRegistry } = {}) {
    this.registry = capabilityRegistry || registry;
  }

  async execute(intent, options = {}) {
    const executionId = uuidv4().substring(0, 8);
    const { userId = 'unknown', vertical = null } = options;

    try {
      if (!intent?.capabilityId) {
        logger.info(
          `[${executionId}] No capability detected, using conversational fallback`
        );
        return {
          success: true,
          actionResult: null,
          conversationalResponse: intent?.fallback_response || null,
          executionId,
          source: 'conversational'
        };
      }

      if (Number(intent.confidence) < MIN_CONFIDENCE) {
        logger.info(
          `[${executionId}] Confidence ${intent.confidence} below ${MIN_CONFIDENCE}, not executing ${intent.capabilityId}`
        );
        return {
          success: true,
          actionResult: null,
          conversationalResponse:
            intent.fallback_response ||
            'I was not confident enough to run that action. Please rephrase.',
          executionId,
          source: 'conversational'
        };
      }

      const capabilityId = intent.capabilityId;
      const input = this.normalizeParameters(capabilityId, intent.parameters || {});
      logger.info(
        `[${executionId}] Executing capability: ${capabilityId} (user: ${userId}, vertical: ${vertical})`
      );

      if (!this.registry.has(capabilityId)) {
        logger.warn(`[${executionId}] Capability not registered: ${capabilityId}`);
        return {
          success: false,
          actionResult: null,
          conversationalResponse: `I don't have the ability to do that yet. (capability: ${capabilityId})`,
          executionId,
          error: 'CAPABILITY_NOT_FOUND',
          source: 'action_bridge'
        };
      }

      const resolved = this.registry.resolve(capabilityId, { vertical });
      if (!resolved || resolved.length === 0) {
        logger.warn(
          `[${executionId}] Capability unavailable or not suitable: ${capabilityId}`
        );
        return {
          success: false,
          actionResult: null,
          conversationalResponse: `That capability is not currently available. Please try again later.`,
          executionId,
          error: 'CAPABILITY_UNAVAILABLE',
          source: 'action_bridge'
        };
      }

      const provider = resolved[0];
      const validationErrors = this.validateInput(provider.inputs, input);
      if (validationErrors.length > 0) {
        logger.warn(`[${executionId}] Input validation failed: ${validationErrors.join('; ')}`);
        return {
          success: false,
          actionResult: null,
          conversationalResponse: `I need more information: ${validationErrors.join(', ')}`,
          executionId,
          error: 'INVALID_INPUT',
          source: 'action_bridge'
        };
      }

      logger.info(`[${executionId}] Invoking ${capabilityId} with input keys: ${Object.keys(input).join(',')}`);

      const startTime = Date.now();
      let invocation;
      try {
        invocation = await this.registry.invoke(capabilityId, input, {
          vertical,
          actor: `telegram:${userId}`,
          jobId: executionId,
          bypassPermissions: true
        });
      } catch (invokeError) {
        const duration = Date.now() - startTime;
        logger.error(
          `[${executionId}] Capability execution failed after ${duration}ms: ${invokeError.message}`
        );

        return {
          success: false,
          actionResult: null,
          conversationalResponse: `That action didn't work: ${invokeError.message}`,
          executionId,
          error: 'EXECUTION_FAILED',
          executionError: invokeError.message,
          duration,
          source: 'action_bridge'
        };
      }

      const duration = Date.now() - startTime;
      const payload = invocation?.result ?? invocation;
      const providerFailure = this.detectProviderFailure(payload);
      if (providerFailure) {
        logger.warn(`[${executionId}] Provider returned failure: ${providerFailure}`);
        return {
          success: false,
          actionResult: payload,
          conversationalResponse: this.formatFailure(capabilityId, payload, providerFailure),
          executionId,
          duration,
          error: 'PROVIDER_FAILED',
          executionError: providerFailure,
          source: 'action_bridge'
        };
      }

      logger.info(`[${executionId}] Capability succeeded in ${duration}ms`);
      return {
        success: true,
        actionResult: payload,
        conversationalResponse: this.formatActionResult(capabilityId, payload),
        executionId,
        duration,
        source: 'action_bridge'
      };
    } catch (error) {
      logger.error(`[${executionId}] Action bridge error: ${error.message}`);
      return {
        success: false,
        actionResult: null,
        conversationalResponse: 'Something went wrong. Please try again.',
        executionId,
        error: 'ACTION_BRIDGE_ERROR',
        bridgeError: error.message,
        source: 'action_bridge'
      };
    }
  }

  normalizeParameters(capabilityId, parameters) {
    const input = { ...(parameters || {}) };
    if (capabilityId === 'voice.call') {
      input.phoneNumber = input.phoneNumber || input.phone_number || input.phone || input.to || input.number;
      input.script = input.script || input.message || input.text || input.what || input.purpose;
    }
    if (capabilityId === 'video.generate') {
      input.script = input.script || input.prompt || input.text || input.topic || input.message;
      input.topic = input.topic || input.title || input.script;
    }
    if (capabilityId === 'workflow.execute') {
      input.alias = input.alias || input.workflow || input.name || input.workflowId;
      if (!input.alias) input.alias = 'test';
    }
    if (capabilityId === 'acquisition.run' || capabilityId === 'prospect.discover') {
      input.objective = input.objective || input.query || input.text || input.message;
      input.sourceUrl = input.sourceUrl || input.url || input.source;
      input.maxOrganizations = input.maxOrganizations || input.limit || 20;
    }
    return input;
  }

  detectProviderFailure(payload) {
    if (!payload || typeof payload !== 'object') return null;
    if (payload.error && typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error;
    }
    if (FAILURE_STATUSES.has(String(payload.status || '').toLowerCase())) {
      return payload.reason || payload.message || payload.status;
    }
    return null;
  }

  validateInput(schema, input) {
    if (!schema || typeof schema !== 'object') return [];

    const errors = [];
    const required = schema.required || [];

    for (const key of required) {
      if (input?.[key] === undefined || input?.[key] === null || input?.[key] === '') {
        errors.push(`missing required field: ${key}`);
      }
    }

    return errors;
  }

  formatFailure(capabilityId, payload, detail) {
    const id = payload?.callId || payload?.video_id || payload?.session_id || payload?.executionId;
    const idBit = id ? ` Provider id: ${id}.` : '';
    return `Action failed (${capabilityId}): ${detail}.${idBit}`;
  }

  formatActionResult(capabilityId, result) {
    if (!result) return 'Action completed.';
    if (typeof result === 'string') return result;
    if (typeof result === 'number') return `Result: ${result}`;
    if (typeof result === 'boolean') return `Success: ${result}`;

    if (Array.isArray(result)) {
      if (result.length === 0) return 'No results found.';
      return result.slice(0, 3).map((r) => this.summarizeResult(r)).join('\n');
    }

    if (typeof result === 'object') {
      return this.summarizeResult(result);
    }

    return String(result);
  }

  summarizeResult(obj) {
    if (!obj || typeof obj !== 'object') return String(obj);

    const summary = [];
    if (obj.summary && typeof obj.summary === 'string') return obj.summary;
    if (obj.runId && obj.stats) {
      return `Run ${obj.runId}: ${obj.stats.uniqueOrganizations || 0} orgs, ${obj.stats.pagesSuccessful || 0} pages, workflow ${obj.workflow?.executionId || obj.workflow?.status || 'n/a'}`;
    }

    const keyFields = [
      'callId', 'video_id', 'session_id', 'executionId', 'providerExecutionId',
      'runId', 'id', 'alias', 'status', 'url', 'name', 'title', 'message', 'result'
    ];
    for (const field of keyFields) {
      const value = obj[field];
      if (value && typeof value !== 'object') {
        summary.push(`${field}: ${value}`);
        if (summary.length >= 4) break;
      }
    }

    if (summary.length === 0) {
      const keys = Object.keys(obj).slice(0, 2);
      for (const key of keys) {
        const val = obj[key];
        if (val && typeof val !== 'object') summary.push(`${key}: ${val}`);
      }
    }

    return summary.length > 0 ? summary.join(', ') : 'Action completed';
  }
}

export { ActionBridge, MIN_CONFIDENCE };
