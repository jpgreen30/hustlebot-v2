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
- If it's vague, conversational, or a general question, set capabilityId to null
- Do NOT use knowledge.search for ordinary questions or "what is X" chat. That capability is only for searching an internal knowledge base when the user asks to look something up.
- confidence should reflect how sure you are of the match
- Only include parameters that are in the user message or clearly inferable
- If capabilityId is null, provide a helpful conversational response
- "run the test workflow" / "run test workflow" maps to workflow.execute with parameters.alias="test"
- "create a video saying X" maps to video.generate with parameters.script set to X
- "call +1..." maps to voice.call with phoneNumber and script
- "find exhibitors", "build a prospect list", "scrape this conference", "acquire companies from this page" maps to acquisition.run. Put the full user message in parameters.objective and any URL in parameters.sourceUrl. Default maxOrganizations to 20.
- "research them", "qualify them", "rank the best", "decision makers", "prepare an outreach campaign", "prepare a campaign", "do not contact anyone" maps to campaign.prepare. Put the full user message in parameters.objective and any URL in parameters.sourceUrl.
- "show me the campaign", "who are the top 10", "show me the decision makers", "why is X ranked", "how many have verified contact", "pause the campaign", "resume the campaign", "show me outreach results" maps to campaign.control with parameters.query set to the user message.
- "start outreach" maps to campaign.control with action start. It must never skip approval.
- Do not map acquisition or campaign objectives to knowledge.search or web.scrape alone when the user wants a prospect list or outreach prep
- Respond ONLY with the JSON object, no markdown or explanation`;

class IntentDetector {
  constructor({ llm, registry, fabric, router } = {}) {
    this.llm = llm;
    this.registry = registry;
    this.fabric = fabric || null;
    this.router = router || null;
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

      const hinted = this.hintToolInspectIntent(userMessage)
        || this.hintObjectiveControlIntent(userMessage)
        || this.hintObjectiveRunIntent(userMessage)
        || this.hintCampaignControlIntent(userMessage)
        || this.hintCampaignIntent(userMessage)
        || this.hintAcquisitionIntent(userMessage);
      if (hinted) {
        logger.info(`✅ Intent hinted: ${hinted.intent} → ${hinted.capabilityId}`);
        return hinted;
      }

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

  hintCampaignControlIntent(userMessage) {
    const text = String(userMessage || '').trim();
    if (!text) return null;
    const isPrepObjective = /(prepare (an |the )?(outreach )?campaign|research them|do not contact anyone|find the best people|score the contacts)/i.test(text)
      && !/^(show|who|why|how many|pause|resume|start outreach)/i.test(text);
    if (isPrepObjective) return null;

    const start = /^(start outreach|begin outreach|launch outreach)\b/i.test(text);
    const pause = /^pause (the )?campaign\b/i.test(text);
    const resume = /^resume (the )?campaign\b/i.test(text);
    const showCampaign = /show me the .*(campaign)|what(?:'s| is) (the )?(qentrax )?campaign/i.test(text);
    const top = /(?:who are |show me )?(the )?top\s+\d+/i.test(text) && !/prepare/i.test(text);
    const dms = /decision makers/i.test(text) && /show|who|list/i.test(text);
    const why = /why is .+(ranked|high|scored)/i.test(text);
    const verified = /how many.+(verified|contact)/i.test(text);
    const results = /outreach results/i.test(text);
    if (!(start || pause || resume || showCampaign || top || dms || why || verified || results)) {
      return null;
    }
    return {
      intent: start
        ? 'Request campaign execution (approval still required)'
        : 'Inspect or control a prepared campaign',
      capabilityId: 'campaign.control',
      parameters: {
        query: text,
        action: start ? 'start outreach' : pause ? 'pause campaign' : resume ? 'resume campaign' : text
      },
      confidence: 0.93,
      reasoning: 'deterministic campaign-control hint',
      fallback_response: ''
    };
  }

  hintToolInspectIntent(userMessage) {
    const text = String(userMessage || '').trim();
    if (!text) return null;
    if (!/(what tools do you have|what mcp servers|is apollo healthy|what can you use for web research|which model planned|refresh your tools|what did this (objective )?cost)/i.test(text)) {
      return null;
    }
    const capabilityId = /refresh your tools/i.test(text) ? 'mcp.refresh' : 'fabric.inspect';
    return {
      intent: 'Inspect tools, models, or MCP health',
      capabilityId,
      parameters: { query: text, q: text },
      confidence: 0.95,
      reasoning: 'deterministic tool-fabric introspection hint',
      fallback_response: ''
    };
  }

  hintObjectiveControlIntent(userMessage) {
    const text = String(userMessage || '').trim();
    if (!text) return null;
    if (!/(what are you working on|show me the plan|why did you|what failed|try another way|skip that step|^stop\b|^resume\b|^pause\b|what(?:'s| is) blocking|how much has this cost|what did this (objective )?cost|don'?t call anyone|finish everything except outreach|finish without outreach|what are your agents doing|who is working|show me the (research )?workers|why did you delegate|which model is each agent using|what tools did they use|stop all workers|how much work is left)/i.test(text)) {
      return null;
    }
    return {
      intent: 'Inspect or control a MacGyver objective',
      capabilityId: 'objective.control',
      parameters: { query: text, action: text },
      confidence: 0.94,
      reasoning: 'deterministic objective-control hint',
      fallback_response: ''
    };
  }

  hintObjectiveRunIntent(userMessage) {
    const text = String(userMessage || '').trim();
    if (!text) return null;
    if (/prepare (an |the )?(outreach )?campaign/i.test(text)) return null;
    const looks = /(find|research|rank|qualify|discover).{0,120}(compan|exhibitor|prospect|roofer|decision maker|logistics)/i.test(text)
      || (/(do not contact|don't contact)/i.test(text) && /(find|research|rank)/i.test(text))
      || /(logistics|freight|3pl|trucking).{0,80}(compan|compar)/i.test(text)
      || /comparison of their services/i.test(text)
      || /current utc time|what time is it/i.test(text)
      || /competitive landscape|strategic opportunit/i.test(text)
      || /across .{8,}.+\band\b/i.test(text);
    if (!looks) return null;
    const urlMatch = text.match(/https?:\/\/[^\s)]+/i);
    const parameters = { objective: text, rawRequest: text };
    if (urlMatch) parameters.sourceUrl = urlMatch[0].replace(/[.,;]+$/, '');
    return {
      intent: 'Run a MacGyver objective from the capability catalogue',
      capabilityId: 'objective.run',
      parameters,
      confidence: 0.92,
      reasoning: 'deterministic objective.run hint — not campaign.prepare',
      fallback_response: ''
    };
  }

  hintCampaignIntent(userMessage) {
    const text = String(userMessage || '');
    if (!text.trim()) return null;
    const looksLikeCampaign = /(prepare (an |the )?outreach|prepare (a |the )?campaign|outreach campaign)/i.test(text);
    if (!looksLikeCampaign) return null;
    const urlMatch = text.match(/https?:\/\/[^\s)]+/i);
    const parameters = {
      objective: text.trim(),
      maxOrganizations: 20,
      qualificationProfile: /qentrax/i.test(text) ? 'qentrax-buyer' : undefined
    };
    if (urlMatch) parameters.sourceUrl = urlMatch[0].replace(/[.,;]+$/, '');
    if (!parameters.qualificationProfile) delete parameters.qualificationProfile;
    return {
      intent: 'Prepare a qualified outreach campaign without contacting anyone',
      capabilityId: 'campaign.prepare',
      parameters,
      confidence: 0.9,
      reasoning: 'deterministic campaign-prepare hint',
      fallback_response: ''
    };
  }

  hintAcquisitionIntent(userMessage) {
    const text = String(userMessage || '');
    if (!text.trim()) return null;
    const looksLikeAcquisition = /(exhibitor|prospect list|scrape this|crawl this|find companies|vendor director|acquisition|outreach-ready|affiliate summit)/i.test(text);
    if (!looksLikeAcquisition) return null;
    const urlMatch = text.match(/https?:\/\/[^\s)]+/i);
    const parameters = {
      objective: text.trim(),
      maxOrganizations: 20,
      maxPages: 12
    };
    if (urlMatch) parameters.sourceUrl = urlMatch[0].replace(/[.,;]+$/, '');
    return {
      intent: 'Run the acquisition pipeline against a public source',
      capabilityId: 'acquisition.run',
      parameters,
      confidence: 0.86,
      reasoning: 'deterministic acquisition hint',
      fallback_response: ''
    };
  }
}

export { IntentDetector };
