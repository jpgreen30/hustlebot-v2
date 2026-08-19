/**
 * INTENT DETECTOR
 *
 * Uses OpenRouter to analyze user messages and detect:
 * - What the user is trying to accomplish (intent)
 * - Which platform capability can fulfill it
 * - What parameters are needed
 * - Confidence in the detection
 *
 * Returns structured data that maps directly to registry.invoke().
 * If no capability match, returns conversational response as fallback.
 *
 * This is the insertion point between Telegram user input and
 * capability-based action execution.
 */

import logger from '../utils/logger.js';

const INTENT_DETECTION_PROMPT = `You are analyzing a user request to determine what action they want.

The user's message is: "{userMessage}"

You have access to these capabilities:
{capabilityCatalogue}

Respond with ONLY valid JSON, no other text:

{
  "intent": "human readable description of what they want",
  "capabilityId": "one capability id from the list above, or null if no match",
  "parameters": {
    "required param names with extracted values"
  },
  "confidence": 0.0 to 1.0,
  "reasoning": "why you think this matches (or doesn't match) a capability",
  "fallback_response": "if capabilityId is null, a conversational response to send"
}

Rules:
- If the user message clearly maps to a capability, set capabilityId and extract needed parameters
- If it's vague or conversational, set capabilityId to null
- confidence should reflect how sure you are of the match
- Only include parameters that are in the user message or clearly inferable
- If capabilityId is null, provide a helpful conversational response
- "run the test workflow" / "run test workflow" maps to workflow.execute with parameters.alias="test"
- "create a video saying X" maps to video.generate with parameters.script set to X
- "call +1..." maps to voice.call with phoneNumber and script
- Respond ONLY with the JSON object, no markdown or explanation`;

class IntentDetector {
  constructor({ llm, registry } = {}) {
    this.llm = llm;
    this.registry = registry;
  }

  /**
   * Get the capability catalogue for LLM intent detection
   */
  getCapabilityCatalogue() {
    if (!this.registry) return [];

    return this.registry
      .list({ availableOnly: true })
      .map((cap) => {
        const described = this.registry.describe(cap.capabilityId);
        const preferred = described.providers[0];
        return {
          id: cap.capabilityId,
          name: preferred?.name || cap.capabilityId,
          description: preferred?.description || '',
          inputs: preferred?.inputs?.properties
            ? Object.keys(preferred.inputs.properties)
            : [],
          required: preferred?.inputs?.required || []
        };
      });
  }

  /**
   * Format catalogue for the LLM prompt
   */
  formatCatalogueForPrompt() {
    const catalogue = this.getCapabilityCatalogue();
    return catalogue
      .map((cap) => {
        const inputs = cap.inputs.length
          ? ` (inputs: ${cap.inputs.join(', ')})`
          : ' (no inputs)';
        return `- ${cap.id}: ${cap.description}${inputs}`;
      })
      .join('\n');
  }

  /**
   * Detect intent from user message
   * Returns: { intent, capabilityId, parameters, confidence, reasoning, fallback_response, error? }
   */
  async detect(userMessage, options = {}) {
    try {
      if (!this.llm) {
        logger.warn('Intent detector: LLM not available');
        return {
          intent: null,
          capabilityId: null,
          parameters: {},
          confidence: 0,
          reasoning: 'LLM not available for intent detection',
          fallback_response: 'I am currently in a limited mode. Please try again later.',
          error: 'NO_LLM'
        };
      }

      if (!userMessage || !userMessage.trim()) {
        return {
          intent: null,
          capabilityId: null,
          parameters: {},
          confidence: 0,
          reasoning: 'Empty message',
          fallback_response: 'Please send a message with what you need.',
          error: 'EMPTY_MESSAGE'
        };
      }

      logger.debug(`Detecting intent for: "${userMessage}"`);

      const catalogueText = this.formatCatalogueForPrompt();
      const prompt = INTENT_DETECTION_PROMPT
        .replace('{userMessage}', userMessage)
        .replace('{capabilityCatalogue}', catalogueText);

      // Call LLM for intent detection
      const response = await this.llm.complete(prompt, {
        taskType: 'general',
        maxTokens: 500,
        temperature: 0.3 // Low temp for consistent, deterministic parsing
      });

      logger.debug(`LLM intent response: ${response.content.substring(0, 200)}`);

      // Parse JSON response
      const parsed = this.parseIntentResponse(response.content);

      if (parsed.error) {
        logger.warn(`Intent parsing failed: ${parsed.error}`);
        return {
          intent: null,
          capabilityId: null,
          parameters: {},
          confidence: 0,
          reasoning: parsed.error,
          fallback_response: 'I could not understand what you need. Please try rephrasing.',
          error: parsed.error
        };
      }

      // Validate that capabilityId (if set) is actually registered
      if (parsed.capabilityId && !this.registry.has(parsed.capabilityId)) {
        logger.warn(`Detected capability not in registry: ${parsed.capabilityId}`);
        return {
          ...parsed,
          capabilityId: null,
          confidence: 0,
          reasoning: `Capability '${parsed.capabilityId}' not registered`,
          error: 'CAPABILITY_NOT_FOUND'
        };
      }

      logger.info(
        `✅ Intent detected: ${parsed.intent} → ${parsed.capabilityId || 'conversational'} (confidence: ${parsed.confidence})`
      );

      return parsed;
    } catch (error) {
      logger.error(`Intent detection error: ${error.message}`);
      return {
        intent: null,
        capabilityId: null,
        parameters: {},
        confidence: 0,
        reasoning: error.message,
        fallback_response: 'I encountered an error processing your request. Please try again.',
        error: 'DETECTION_ERROR'
      };
    }
  }

  /**
   * Parse JSON response from LLM intent detection
   * Returns: { intent, capabilityId, parameters, confidence, reasoning, fallback_response, error? }
   */
  parseIntentResponse(llmResponse) {
    try {
      // Try to extract JSON from the response
      // Handle cases where LLM might include extra text
      const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          error: 'NO_JSON_IN_RESPONSE',
          intent: null,
          capabilityId: null,
          parameters: {},
          confidence: 0,
          reasoning: 'LLM response did not contain valid JSON',
          fallback_response: llmResponse.substring(0, 200)
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate required fields
      const required = ['intent', 'capabilityId', 'confidence', 'fallback_response'];
      const missing = required.filter((field) => !(field in parsed));
      if (missing.length > 0) {
        return {
          error: `MISSING_FIELDS: ${missing.join(', ')}`,
          intent: parsed.intent || null,
          capabilityId: parsed.capabilityId || null,
          parameters: parsed.parameters || {},
          confidence: parsed.confidence || 0,
          reasoning: parsed.reasoning || '',
          fallback_response: parsed.fallback_response || 'Please try again.'
        };
      }

      // Normalize confidence to 0-1
      parsed.confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));

      // If capabilityId is null, ensure it's actually null (not string "null")
      if (parsed.capabilityId === 'null' || parsed.capabilityId === '') {
        parsed.capabilityId = null;
      }

      // Ensure parameters is an object
      if (!parsed.parameters || typeof parsed.parameters !== 'object') {
        parsed.parameters = {};
      }

      return parsed;
    } catch (error) {
      return {
        error: `JSON_PARSE_ERROR: ${error.message}`,
        intent: null,
        capabilityId: null,
        parameters: {},
        confidence: 0,
        reasoning: error.message,
        fallback_response: 'I could not parse my analysis. Please try again.'
      };
    }
  }
}

export { IntentDetector };
