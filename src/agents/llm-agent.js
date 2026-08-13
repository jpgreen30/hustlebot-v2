/**
 * LLM AGENT CLASS
 * 
 * Extends BaseAgent for agents powered by LLM
 * Handles: Prompt generation, output parsing, structured responses
 */

import { BaseAgent } from './base-agent.js';
import logger from '../utils/logger.js';

class LLMAgent extends BaseAgent {
  constructor(name, db, llm, budgetController, config = {}) {
    super(name, db, llm, budgetController);
    
    this.config = {
      defaultTaskType: 'general',
      defaultMaxTokens: 2000,
      defaultTemperature: 0.7,
      ...config
    };

    this.promptTemplate = null;
    this.outputParser = null;
  }

  /**
   * Default executeLogic - calls LLM with prompt
   */
  async executeLogic(input) {
    try {
      // Get prompt
      const prompt = await this.getPrompt(input.taskType || 'general', input);

      // Call LLM
      const llmResponse = await this.callLLM(prompt, {
        taskType: input.taskType || this.config.defaultTaskType,
        maxTokens: input.maxTokens || this.config.defaultMaxTokens,
        temperature: input.temperature || this.config.defaultTemperature,
        budgetTight: input.budgetTight || false
      });

      // Parse output
      const parsed = await this.parseOutput(llmResponse.content);

      return {
        output: parsed,
        cost: llmResponse.cost,
        service: 'openrouter',
        model: llmResponse.model,
        tokens: llmResponse.tokens
      };
    } catch (error) {
      logger.error(`LLMAgent ${this.name} executeLogic failed:`, error);
      throw error;
    }
  }

  /**
   * Get prompt template - override in subclasses
   */
  async getPrompt(taskType, context) {
    throw new Error(`getPrompt must be implemented in ${this.name}`);
  }

  /**
   * Parse LLM output
   */
  async parseOutput(text) {
    if (this.outputParser) {
      return this.outputParser(text);
    }

    // Default: try JSON, fallback to string
    try {
      return JSON.parse(text);
    } catch (e) {
      return text;
    }
  }

  /**
   * Set custom output parser
   */
  setOutputParser(fn) {
    this.outputParser = fn;
  }

  /**
   * Set prompt template
   */
  setPromptTemplate(template) {
    this.promptTemplate = template;
  }

  /**
   * Format prompt with variables
   */
  formatPrompt(template, variables) {
    let prompt = template;
    for (const [key, value] of Object.entries(variables)) {
      prompt = prompt.replace(`{{${key}}}`, value);
    }
    return prompt;
  }

  /**
   * Generate structured output (JSON format)
   */
  async generateStructuredOutput(prompt, schema) {
    const jsonPrompt = `${prompt}

Please respond in valid JSON format following this schema:
${JSON.stringify(schema, null, 2)}

Return ONLY valid JSON, no other text.`;

    const response = await this.callLLM(jsonPrompt, {
      taskType: 'json_generation',
      maxTokens: this.config.defaultMaxTokens
    });

    try {
      return JSON.parse(response.content);
    } catch (e) {
      logger.error('Failed to parse structured output:', e);
      throw new Error('Invalid JSON response from LLM');
    }
  }

  /**
   * Generate multiple variations
   */
  async generateVariations(prompt, count = 3) {
    const variationPrompt = `${prompt}

Generate ${count} different variations of the above. Format as JSON array.
Return ONLY valid JSON array.`;

    const response = await this.callLLM(variationPrompt, {
      taskType: 'generation',
      maxTokens: this.config.defaultMaxTokens * 2
    });

    try {
      return JSON.parse(response.content);
    } catch (e) {
      logger.warn('Failed to parse variations:', e);
      return [response.content];
    }
  }
}

export { LLMAgent };
