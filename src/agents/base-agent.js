/**
 * BASE AGENT CLASS
 * 
 * Foundation for all 13 specialized agents
 * Handles: LLM calls, cost tracking, error handling, retries
 */

import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

class BaseAgent {
  constructor(name, db, llm, budgetController) {
    this.name = name;
    this.db = db;
    this.llm = llm;
    this.budgetController = budgetController;
    this.id = uuidv4();
    this.tools = [];
    this.executionCount = 0;
    this.totalCost = 0;
  }

  /**
   * Wire runtime dependencies after construction.
   *
   * Subclasses (voice workflow builder/refiner, conversation, call script
   * writer) call super.initialize(llm, storage) before registering their
   * tools. Without this method that call throws and the agent is skipped.
   *
   * Note: this deliberately does not touch this.db, which execute() uses
   * for logAgentExecution.
   */
  async initialize(llm = null, storage = null) {
    if (llm) this.llm = llm;
    if (storage) this.storage = storage;
    this.initialized = true;
    logger.debug(`Agent ${this.name} initialized`);
    return this;
  }

  /**
   * Main execution method - override in subclasses
   */
  async execute(input) {
    const startTime = Date.now();
    
    try {
      logger.debug(`Agent ${this.name} executing with input:`, input);

      // Validate input
      this.validateInput(input);

      // Execute agent logic
      const result = await this.executeLogic(input);

      // Track execution
      const executionTime = Date.now() - startTime;
      this.executionCount++;

      // Log execution
      if (input.projectId) {
        await this.db.logAgentExecution(
          this.name,
          input.projectId,
          input,
          result,
          executionTime
        );
      }

      logger.info(
        `✅ Agent ${this.name} completed in ${executionTime}ms (cost: $${(result.cost || 0).toFixed(4)})`
      );

      return {
        success: true,
        result: result.output || result,
        cost: result.cost || 0,
        service: result.service || 'agent',
        executionTime,
        agentName: this.name
      };
    } catch (error) {
      logger.error(`Agent ${this.name} failed:`, error);
      throw error;
    }
  }

  /**
   * Override this in subclasses
   */
  async executeLogic(input) {
    throw new Error(`executeLogic not implemented for ${this.name}`);
  }

  /**
   * Validate input structure
   */
  validateInput(input) {
    if (!input) {
      throw new Error('Input cannot be empty');
    }
  }

  /**
   * Call LLM with smart model selection
   */
  async callLLM(prompt, options = {}) {
    try {
      const {
        taskType = 'general',
        maxTokens = 2000,
        temperature = 0.7,
        budgetTight = false
      } = options;

      const llmResponse = await this.llm.complete(prompt, {
        taskType,
        maxTokens,
        temperature,
        budgetTight
      });

      this.totalCost += llmResponse.cost;

      return llmResponse;
    } catch (error) {
      logger.error(`LLM call failed for ${this.name}:`, error);
      throw error;
    }
  }

  /**
   * Stream LLM response (for real-time)
   */
  async *streamLLM(prompt, options = {}) {
    try {
      for await (const chunk of this.llm.stream(prompt, options)) {
        yield chunk;
      }
    } catch (error) {
      logger.error(`LLM stream failed for ${this.name}:`, error);
      throw error;
    }
  }

  /**
   * Get agent capabilities as MCP tools
   */
  getTools() {
    return this.tools.map((tool) => ({
      name: `${this.name}_${tool.name}`,
      description: tool.description,
      inputSchema: tool.inputSchema,
      execute: tool.execute.bind(this)
    }));
  }

  /**
   * Register a tool capability
   */
  registerTool(name, description, inputSchema, executeFn) {
    this.tools.push({
      name,
      description,
      inputSchema,
      execute: executeFn
    });
  }

  /**
   * Check if agent can execute a specific tool
   */
  canExecute(toolName) {
    return this.tools.some((t) => toolName === `${this.name}_${t.name}`);
  }

  /**
   * Get execution statistics
   */
  getStats() {
    return {
      name: this.name,
      executions: this.executionCount,
      totalCost: parseFloat(this.totalCost.toFixed(4)),
      averageCost: this.executionCount > 0 
        ? parseFloat((this.totalCost / this.executionCount).toFixed(4))
        : 0,
      tools: this.tools.length
    };
  }

  /**
   * Parse LLM output (override in subclasses if needed)
   */
  parseLLMOutput(text) {
    // Try to parse JSON first
    try {
      return JSON.parse(text);
    } catch (e) {
      // Return as string if not JSON
      return text;
    }
  }

  /**
   * Generate prompt (override in subclasses)
   */
  async getPrompt(taskType, context) {
    throw new Error(`getPrompt not implemented for ${this.name}`);
  }

  /**
   * Retry logic for failed operations
   */
  async retryWithBackoff(fn, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === maxRetries - 1) {
          throw error;
        }

        const delay = Math.pow(2, i) * 1000; // Exponential backoff
        logger.warn(
          `Retry ${i + 1}/${maxRetries} for ${this.name} after ${delay}ms`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
}

export { BaseAgent };
