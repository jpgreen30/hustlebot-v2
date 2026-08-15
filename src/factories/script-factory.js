/**
 * Script Generation Factory
 * Coordinates Claude + ChatGPT to generate AI call scripts
 * Integrates with Retell for outbound calls
 */

import logger from '../utils/logger.js';

class ScriptFactory {
  constructor(options = {}) {
    this.mailbox = options.mailbox;
    this.llm = options.llm;
    this.retell = options.retell;
    this.initialized = false;
  }

  async initialize() {
    if (!this.mailbox || !this.llm) {
      logger.warn('⚠️  Script factory requires mailbox and LLM');
      return;
    }
    this.initialized = true;
    logger.info('📝 Script factory initialized');
  }

  /**
   * Generate a script using Claude + ChatGPT collaboration
   *
   * Flow:
   * 1. Claude generates initial script draft
   * 2. Claude sends to ChatGPT for refinement feedback
   * 3. ChatGPT responds with improvements
   * 4. Claude finalizes script
   *
   * @param {Object} options
   * @param {string} options.purpose - Purpose of call (e.g., "lead qualification")
   * @param {string} options.context - Context/details
   * @param {string} options.tone - Tone (professional, casual, friendly)
   * @param {number} options.maxDuration - Estimated call duration in seconds
   */
  async generateScript(options) {
    const { purpose, context, tone = 'professional', maxDuration = 300 } = options;

    if (!this.initialized) {
      throw new Error('Script factory not initialized');
    }

    try {
      logger.info(`📝 Generating script for: ${purpose}`);

      // Step 1: Claude generates initial script
      const initialScript = await this.llm.complete(
        `Generate an AI voice call script for the following:
Purpose: ${purpose}
Context: ${context}
Tone: ${tone}
Max Duration: ${maxDuration} seconds

Requirements:
- Natural conversational flow
- Professional but personable
- Include opening, main points, objection handling, closing
- Mark speaker changes with [AI]: or [Customer]:
- Keep it concise and engaging

Generate the script:`,
        { taskType: 'script-generation', maxTokens: 2000 }
      );

      logger.info('📝 Initial script generated');

      // Step 2: Send to ChatGPT for refinement via mailbox
      const feedbackRequestId = await this.mailbox.send({
        from: 'claude',
        to: 'chatgpt',
        subject: `Refine script for: ${purpose}`,
        content: `Please review and improve this call script:\n\n${initialScript.content}\n\nProvide specific suggestions for:
1. Natural conversation flow
2. Objection handling effectiveness
3. Conversational tone improvements
4. Call closure strategy`,
      });

      logger.info('📝 Sent to ChatGPT for refinement');

      // Step 3: Wait for ChatGPT's response (with timeout)
      let refinedScript = initialScript.content;
      let refinementFeedback = '';

      try {
        // Poll for response (timeout after 30 seconds)
        const startTime = Date.now();
        const timeout = 30000;

        while (Date.now() - startTime < timeout) {
          const messages = await this.mailbox.getMessages('claude', {
            from: 'chatgpt',
            unreadOnly: true,
          });

          const refinementReply = messages.find(m => m.inReplyTo === feedbackRequestId);

          if (refinementReply) {
            refinementFeedback = refinementReply.content;
            logger.info('📝 Received refinement from ChatGPT');
            break;
          }

          // Wait before checking again
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Step 4: Claude incorporates feedback and finalizes
        if (refinementFeedback) {
          const finalScript = await this.llm.complete(
            `Here is the original script:\n\n${initialScript.content}\n\nHere is feedback from ChatGPT for improvement:\n\n${refinementFeedback}\n\nPlease incorporate this feedback and provide the finalized script. Keep the same format with [AI]: and [Customer]: markers.`,
            { taskType: 'script-generation', maxTokens: 2000 }
          );

          refinedScript = finalScript.content;
        }
      } catch (error) {
        logger.warn('⚠️  Could not get ChatGPT feedback, using initial script:', error.message);
      }

      logger.info('✅ Script generation complete');

      return {
        purpose,
        script: refinedScript,
        context,
        tone,
        estimatedDuration: maxDuration,
        generatedAt: new Date().toISOString(),
        collaborators: ['claude', 'chatgpt'],
      };
    } catch (error) {
      logger.error('Script generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Generate script and immediately make outbound call
   */
  async generateAndCall(options) {
    if (!this.retell) {
      throw new Error('Retell integration required for making calls');
    }

    const { phoneNumber, name, purpose, context, tone } = options;

    try {
      // Generate script
      const scriptData = await this.generateScript({
        purpose,
        context,
        tone: tone || 'professional',
      });

      logger.info(`☎️  Making outbound call to ${phoneNumber}`);

      // Make call with generated script
      const callResult = await this.retell.makeOutboundCall({
        phoneNumber,
        script: scriptData.script,
        name,
        purpose,
      });

      logger.info(`✅ Call initiated: ${callResult.callId}`);

      return {
        callId: callResult.callId,
        script: scriptData.script,
        phoneNumber,
        name,
        purpose,
      };
    } catch (error) {
      logger.error('Generate and call failed:', error.message);
      throw error;
    }
  }

  /**
   * Get scripts generated
   */
  async listScripts(limit = 10) {
    // In a real system, this would query a database
    // For now, return empty (implement with persistent storage)
    return [];
  }
}

export { ScriptFactory };
