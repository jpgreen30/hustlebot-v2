/**
 * OPENROUTER LLM INTEGRATION
 * 
 * Smart routing between multiple models based on task type:
 * - Claude 3.5 Sonnet: Complex reasoning, coding, planning
 * - GPT-4o: Fast, general purpose, high quality
 * - Grok 2: Fast copywriting, cheap, real-time trends
 * - Gemini 2.0: Multimodal, images, budget tasks
 * - Llama 3.1 70B: Budget conscious, high volume
 * - Command R+: Long context, documents
 */

import fetch from 'node-fetch';
import logger from '../utils/logger.js';

class OpenRouterClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://openrouter.ai/api/v1';
    this.models = {
      claude_sonnet: {
        id: 'anthropic/claude-3.5-sonnet',
        cost_input: 0.003,      // $3 per 1M input tokens
        cost_output: 0.015,      // $15 per 1M output tokens
        speed: 'medium',
        quality: 'highest',
        best_for: ['complex_reasoning', 'coding', 'planning', 'course_design']
      },
      gpt_4o: {
        id: 'openai/gpt-4o',
        cost_input: 0.005,
        cost_output: 0.015,
        speed: 'medium',
        quality: 'high',
        best_for: ['fast_generation', 'analysis', 'general_purpose']
      },
      grok_2: {
        id: 'xai/grok-2',
        cost_input: 0.002,
        cost_output: 0.010,
        speed: 'fast',
        quality: 'good',
        best_for: ['fast_copywriting', 'cheap_tasks', 'real_time', 'trends']
      },
      gemini_2: {
        id: 'google/gemini-2.0-flash',
        cost_input: 0.000075,
        cost_output: 0.00030,
        speed: 'very_fast',
        quality: 'good',
        best_for: ['multimodal', 'images', 'budget_tasks', 'vision']
      },
      llama_70b: {
        id: 'meta-llama/llama-3.1-70b-instruct',
        cost_input: 0.0005,
        cost_output: 0.0015,
        speed: 'medium',
        quality: 'good',
        best_for: ['budget_conscious', 'high_volume', 'cost_effective']
      },
      command_r_plus: {
        id: 'cohere/command-r-plus',
        cost_input: 0.003,
        cost_output: 0.015,
        speed: 'medium',
        quality: 'high',
        best_for: ['long_context', 'documents', 'research', 'rag']
      }
    };

    this.requestCount = 0;
    this.totalTokensUsed = 0;
    this.totalCostIncurred = 0;
  }

  /**
   * Smart model selector based on task type and budget constraints
   */
  selectModel(taskType, context = {}) {
    const budgetTight = context.budgetTight === true;
    const isMultimodal = context.isMultimodal === true;
    const needsSpeed = context.needsSpeed === true;
    const contextLength = context.contextLength || 0;

    // Decision tree for model selection
    if (taskType === 'complex_reasoning') {
      return budgetTight ? this.models.llama_70b : this.models.claude_sonnet;
    }

    if (taskType === 'fast_copywriting') {
      return this.models.grok_2;
    }

    if (taskType === 'code_generation') {
      return this.models.claude_sonnet;
    }

    if (taskType === 'image_analysis' || isMultimodal) {
      return budgetTight ? this.models.gemini_2 : this.models.gpt_4o;
    }

    if (taskType === 'long_document_analysis' || contextLength > 100000) {
      return this.models.command_r_plus;
    }

    if (taskType === 'bulk_generation' && budgetTight) {
      return this.models.llama_70b;
    }

    if (taskType === 'real_time_trends') {
      return this.models.grok_2;
    }

    if (needsSpeed) {
      return this.models.gpt_4o;
    }

    // Default: Claude Sonnet (high quality, reliable)
    return this.models.claude_sonnet;
  }

  /**
   * Calculate cost of a request
   */
  calculateCost(model, inputTokens, outputTokens) {
    const inputCost = (inputTokens / 1_000_000) * model.cost_input;
    const outputCost = (outputTokens / 1_000_000) * model.cost_output;
    return inputCost + outputCost;
  }

  /**
   * Main completion function
   */
  async complete(prompt, options = {}) {
    try {
      const {
        taskType = 'general',
        maxTokens = 2000,
        temperature = 0.7,
        budgetTight = false,
        isMultimodal = false,
        needsSpeed = false,
        contextLength = 0
      } = options;

      // Select model
      const model = this.selectModel(taskType, {
        budgetTight,
        isMultimodal,
        needsSpeed,
        contextLength
      });

      logger.debug(`Using model: ${model.id} for task: ${taskType}`);

      // Make API request
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://hustlebot.io',
          'X-Title': 'HustleBot v2'
        },
        body: JSON.stringify({
          model: model.id,
          messages: [
            { role: 'user', content: prompt }
          ],
          max_tokens: maxTokens,
          temperature,
          top_p: 1
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`OpenRouter API error: ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();

      // Track usage
      const inputTokens = data.usage?.prompt_tokens || 0;
      const outputTokens = data.usage?.completion_tokens || 0;
      const cost = this.calculateCost(model, inputTokens, outputTokens);

      this.requestCount++;
      this.totalTokensUsed += inputTokens + outputTokens;
      this.totalCostIncurred += cost;

      logger.debug(
        `OpenRouter: ${inputTokens} in, ${outputTokens} out, $${cost.toFixed(4)} cost`
      );

      return {
        content: data.choices?.[0]?.message?.content || '',
        model: model.id,
        tokens: {
          input: inputTokens,
          output: outputTokens
        },
        cost,
        usage: data.usage
      };
    } catch (error) {
      logger.error('OpenRouter completion error:', error);
      throw error;
    }
  }

  /**
   * Stream completion (for real-time responses)
   */
  async *stream(prompt, options = {}) {
    try {
      const {
        taskType = 'general',
        maxTokens = 2000,
        temperature = 0.7
      } = options;

      const model = this.selectModel(taskType, options);

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://hustlebot.io',
          'X-Title': 'HustleBot v2'
        },
        body: JSON.stringify({
          model: model.id,
          messages: [
            { role: 'user', content: prompt }
          ],
          max_tokens: maxTokens,
          temperature,
          stream: true
        })
      });

      if (!response.ok) {
        throw new Error(`OpenRouter streaming error: ${response.statusText}`);
      }

      // Stream SSE events
      for await (const chunk of response.body) {
        const text = chunk.toString();
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }

            try {
              const json = JSON.parse(data);
              const token = json.choices?.[0]?.delta?.content || '';
              if (token) {
                yield token;
              }
            } catch (e) {
              // Ignore parsing errors
            }
          }
        }
      }
    } catch (error) {
      logger.error('OpenRouter streaming error:', error);
      throw error;
    }
  }

  /**
   * Batch completion for multiple prompts (cost-effective)
   */
  async completeBatch(prompts, options = {}) {
    try {
      const results = [];
      const costs = [];

      for (const prompt of prompts) {
        const result = await this.complete(prompt, options);
        results.push(result.content);
        costs.push(result.cost);
      }

      return {
        results,
        totalCost: costs.reduce((a, b) => a + b, 0),
        averageCost: costs.reduce((a, b) => a + b, 0) / costs.length
      };
    } catch (error) {
      logger.error('OpenRouter batch error:', error);
      throw error;
    }
  }

  /**
   * Get usage stats
   */
  getStats() {
    return {
      requests: this.requestCount,
      tokensUsed: this.totalTokensUsed,
      totalCost: parseFloat(this.totalCostIncurred.toFixed(4)),
      averageCostPerRequest: parseFloat(
        (this.totalCostIncurred / this.requestCount).toFixed(6)
      )
    };
  }

  /**
   * Reset counters
   */
  resetStats() {
    this.requestCount = 0;
    this.totalTokensUsed = 0;
    this.totalCostIncurred = 0;
  }
}

/**
 * Initialize OpenRouter client
 */
export async function initOpenRouter() {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      logger.warn('⚠️  OPENROUTER_API_KEY not set');
      return new OpenRouterClient('dummy-key');
    }

    const client = new OpenRouterClient(process.env.OPENROUTER_API_KEY);
    logger.info('✅ OpenRouter client ready');
    return client;
  } catch (error) {
    logger.error('Failed to initialize OpenRouter:', error.message);
    return new OpenRouterClient('dummy-key');
  }
}

export { OpenRouterClient };
