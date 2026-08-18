/**
 * ACTION BRIDGE
 *
 * Connects natural-language intent detection to capability execution.
 *
 * Takes output from IntentDetector and:
 * 1. Validates capability exists and is available
 * 2. Invokes capability through registry
 * 3. Formats result for Telegram or conversational fallback
 * 4. Tracks execution for observability
 *
 * Pattern:
 *   intent → validate → invoke → format → return
 */

import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

class ActionBridge {
  constructor({ registry, capabilityRegistry } = {}) {
    this.registry = capabilityRegistry || registry;
  }

  /**
   * Execute an action based on detected intent
   *
   * @param {object} intent - output from IntentDetector.detect()
   * @returns {object} { success, actionResult, conversationalResponse, executionId, error? }
   */
  async execute(intent, options = {}) {
    const executionId = uuidv4().substring(0, 8);
    const { userId = 'unknown', vertical = null } = options;

    try {
      // If no capability was detected, return conversational response
      if (!intent.capabilityId) {
        logger.info(
          `[${executionId}] No capability detected, using conversational fallback`
        );
        return {
          success: true,
          actionResult: null,
          conversationalResponse: intent.fallback_response,
          executionId,
          source: 'conversational'
        };
      }

      const capabilityId = intent.capabilityId;
      logger.info(
        `[${executionId}] Executing capability: ${capabilityId} (user: ${userId}, vertical: ${vertical})`
      );

      // Validate capability exists
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

      // Check availability
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

      // Prepare input, validate against capability schema
      const input = intent.parameters || {};
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

      // Invoke capability
      logger.info(`[${executionId}] Invoking ${capabilityId} with input keys: ${Object.keys(input).join(',')}`);

      const startTime = Date.now();
      let actionResult;
      try {
        actionResult = await this.registry.invoke(capabilityId, input, { vertical });
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
      logger.info(`[${executionId}] Capability succeeded in ${duration}ms`);

      // Format result for response
      const conversationalResponse = this.formatActionResult(capabilityId, actionResult);

      return {
        success: true,
        actionResult,
        conversationalResponse,
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

  /**
   * Validate input against capability input schema
   * Returns array of validation errors (empty if valid)
   */
  validateInput(schema, input) {
    if (!schema || typeof schema !== 'object') return [];

    const errors = [];
    const props = schema.properties || {};
    const required = schema.required || [];

    for (const key of required) {
      if (input?.[key] === undefined || input?.[key] === null || input?.[key] === '') {
        errors.push(`missing required field: ${key}`);
      }
    }

    return errors;
  }

  /**
   * Format capability result into human-readable text for Telegram
   */
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
      // Return a summary of the most important fields
      return this.summarizeResult(result);
    }

    return String(result);
  }

  /**
   * Summarize a single result object (e.g., lead, content, video)
   */
  summarizeResult(obj) {
    if (!obj || typeof obj !== 'object') return String(obj);

    // Extract key fields depending on object type
    const summary = [];

    // Common fields
    const keyFields = ['id', 'name', 'email', 'title', 'status', 'result', 'message'];
    for (const field of keyFields) {
      if (obj[field]) {
        summary.push(`${field}: ${obj[field]}`);
        if (summary.length >= 2) break;
      }
    }

    if (summary.length === 0) {
      // If no key fields, just show object length or first entry
      const keys = Object.keys(obj).slice(0, 2);
      for (const key of keys) {
        const val = obj[key];
        if (val && typeof val !== 'object') {
          summary.push(`${key}: ${val}`);
        }
      }
    }

    return summary.length > 0 ? summary.join(', ') : 'Action completed';
  }
}

export { ActionBridge };
