/**
 * COPYWRITER AGENT
 * 
 * Generates high-converting copy:
 * - Headlines
 * - Landing page copy
 * - Email subject lines
 * - Ad copy
 * - Sales pages
 * 
 * Uses: Claude 3.5 Sonnet (best for compelling writing)
 */

import { LLMAgent } from './llm-agent.js';
import logger from '../utils/logger.js';

class CopywriterAgent extends LLMAgent {
  constructor(db, llm, budgetController) {
    super('copywriter', db, llm, budgetController, {
      defaultTaskType: 'copywriting',
      defaultMaxTokens: 3000,
      defaultTemperature: 0.8
    });

    this.registerTool('generate_headline', 'Generate compelling headlines', {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'What the headline is about' },
        style: { type: 'string', enum: ['benefit', 'curiosity', 'urgency', 'social_proof'] },
        quantity: { type: 'number', description: 'Number of headlines to generate' }
      },
      required: ['topic']
    }, this.generateHeadline);

    this.registerTool('generate_landing_page_copy', 'Generate full landing page copy', {
      type: 'object',
      properties: {
        product_name: { type: 'string' },
        problem: { type: 'string', description: 'Pain point the product solves' },
        solution: { type: 'string', description: 'How the product solves it' },
        target_audience: { type: 'string' },
        tone: { type: 'string', enum: ['professional', 'casual', 'urgent', 'luxury'] }
      },
      required: ['product_name', 'problem', 'solution', 'target_audience']
    }, this.generateLandingPageCopy);

    this.registerTool('generate_email_subject_lines', 'Generate email subject lines', {
      type: 'object',
      properties: {
        topic: { type: 'string' },
        campaign_type: { type: 'string', enum: ['welcome', 'promotion', 'reminder', 'urgency'] },
        quantity: { type: 'number' }
      },
      required: ['topic']
    }, this.generateEmailSubjectLines);

    this.registerTool('generate_sales_page', 'Generate complete sales page copy', {
      type: 'object',
      properties: {
        product: { type: 'string' },
        price: { type: 'number' },
        target_audience: { type: 'string' },
        main_benefit: { type: 'string' },
        pain_points: { type: 'array', items: { type: 'string' } }
      },
      required: ['product', 'target_audience', 'main_benefit']
    }, this.generateSalesPage);
  }

  async getPrompt(taskType, context) {
    const systemPrompt = `You are an expert copywriter specializing in high-converting marketing copy.

Your copy should:
- Focus on benefits, not features
- Use power words and emotional triggers
- Create urgency when appropriate
- Be clear, concise, and compelling
- Follow copywriting best practices
- Match the target audience's language

Always provide multiple options when appropriate.`;

    return systemPrompt;
  }

  /**
   * Generate headlines
   */
  async generateHeadline(input) {
    try {
      const { topic, style = 'benefit', quantity = 5 } = input;

      const prompt = `Generate ${quantity} compelling headlines about "${topic}".

Style: ${style}
- benefit: Focus on the main benefit
- curiosity: Intriguing, makes people want to learn more
- urgency: Creates FOMO, time-limited feel
- social_proof: Leverages popularity/authority

Format as JSON array of strings.`;

      const llmResponse = await this.callLLM(prompt, {
        taskType: 'copywriting',
        maxTokens: 1000
      });

      const headlines = JSON.parse(llmResponse.content);

      return {
        output: headlines,
        cost: llmResponse.cost,
        service: 'openrouter'
      };
    } catch (error) {
      logger.error('Generate headline failed:', error);
      throw error;
    }
  }

  /**
   * Generate landing page copy
   */
  async generateLandingPageCopy(input) {
    try {
      const {
        product_name,
        problem,
        solution,
        target_audience,
        tone = 'professional'
      } = input;

      const prompt = `Create a high-converting landing page copy for:

Product: ${product_name}
Problem: ${problem}
Solution: ${solution}
Target Audience: ${target_audience}
Tone: ${tone}

Structure the response as JSON with these sections:
{
  "headline": "Main headline",
  "subheadline": "Supporting text",
  "hero_section": "Opening hook",
  "problem_section": "Acknowledge the pain",
  "solution_section": "Present the solution",
  "benefits": ["benefit1", "benefit2", "benefit3"],
  "features": ["feature1", "feature2"],
  "testimonial_prompt": "How to get testimonials",
  "cta_primary": "Main call to action",
  "cta_secondary": "Secondary call to action",
  "closing": "Closing statement"
}`;

      const llmResponse = await this.callLLM(prompt, {
        taskType: 'copywriting',
        maxTokens: 3000
      });

      const copy = JSON.parse(llmResponse.content);

      return {
        output: copy,
        cost: llmResponse.cost,
        service: 'openrouter'
      };
    } catch (error) {
      logger.error('Generate landing page copy failed:', error);
      throw error;
    }
  }

  /**
   * Generate email subject lines
   */
  async generateEmailSubjectLines(input) {
    try {
      const {
        topic,
        campaign_type = 'promotion',
        quantity = 10
      } = input;

      const prompt = `Generate ${quantity} high open-rate email subject lines for:

Topic: ${topic}
Campaign Type: ${campaign_type}

Guidelines:
- Keep under 50 characters
- Create curiosity or urgency
- Personalize when possible
- Avoid spam triggers

Format as JSON array. Example:
["Subject 1", "Subject 2", ...]`;

      const llmResponse = await this.callLLM(prompt, {
        taskType: 'copywriting',
        maxTokens: 1000
      });

      const subjects = JSON.parse(llmResponse.content);

      return {
        output: subjects,
        cost: llmResponse.cost,
        service: 'openrouter'
      };
    } catch (error) {
      logger.error('Generate email subject lines failed:', error);
      throw error;
    }
  }

  /**
   * Generate complete sales page
   */
  async generateSalesPage(input) {
    try {
      const {
        product,
        price,
        target_audience,
        main_benefit,
        pain_points = []
      } = input;

      const prompt = `Create a complete high-converting sales page for:

Product: ${product}
Price: $${price}
Target Audience: ${target_audience}
Main Benefit: ${main_benefit}
Pain Points: ${pain_points.join(', ')}

Format as JSON with:
{
  "headline": "Primary headline",
  "subheadline": "Secondary headline",
  "opening": "Hook paragraph",
  "problem_agitation": "Elaborate on the pain",
  "solution_intro": "Introduce the product",
  "benefits_list": ["benefit1", "benefit2", ...],
  "features": ["feature1", "feature2", ...],
  "social_proof": "How to build social proof",
  "objection_handling": {
    "objection1": "How to overcome it",
    "objection2": "How to overcome it"
  },
  "pricing_section": "Pricing justification",
  "guarantee": "Money-back guarantee copy",
  "urgency": "Limited time offer copy",
  "cta": "Primary call to action",
  "closing": "Final push"
}`;

      const llmResponse = await this.callLLM(prompt, {
        taskType: 'copywriting',
        maxTokens: 4000
      });

      const sales_page = JSON.parse(llmResponse.content);

      return {
        output: sales_page,
        cost: llmResponse.cost,
        service: 'openrouter'
      };
    } catch (error) {
      logger.error('Generate sales page failed:', error);
      throw error;
    }
  }
}

export { CopywriterAgent };
