/**
 * SPECIALIZED AGENTS
 * 
 * Collection of domain-specific agents:
 * - Landing Page Agent (conversion optimization)
 * - Product Agent (product strategy)
 * - Marketing Agent (growth strategies)
 * - Sales Agent (conversion tactics)
 * - Finance Agent (unit economics)
 * - Analytics Agent (metrics & attribution)
 * - Ideation Agent (research & brainstorming)
 * - Video Agent (video strategy)
 * - Social Media Agent (social platforms)
 */

import { LLMAgent } from './llm-agent.js';
import logger from '../utils/logger.js';

// ============ LANDING PAGE AGENT ============
class LandingPageAgent extends LLMAgent {
  constructor(db, llm, budgetController) {
    super('landing_page_agent', db, llm, budgetController, {
      defaultTaskType: 'complex_reasoning',
      defaultMaxTokens: 3000,
      defaultTemperature: 0.7
    });
  }

  async getPrompt(taskType, context) {
    return `You are an expert landing page conversion specialist.

Focus on:
- High conversion rates (5%+)
- Psychological triggers
- Persuasive copy
- Clear value proposition
- Strong CTAs
- Trust signals`;
  }

  async executeLogic(input) {
    const { product, problem, target_audience } = input;

    const prompt = `Design a high-converting landing page for:
Product: ${product}
Problem: ${problem}
Target: ${target_audience}

Create a complete landing page strategy including:
1. Headline optimization (multiple variations)
2. Hero section structure
3. Problem/solution narrative
4. Social proof strategy
5. Objection handling
6. CTA placement and copy
7. Form fields optimization

Return as structured JSON.`;

    const response = await this.callLLM(prompt, {
      taskType: 'complex_reasoning',
      maxTokens: 3000
    });

    try {
      const parsed = JSON.parse(response.content);
      return { output: parsed, cost: response.cost, service: 'openrouter' };
    } catch (e) {
      return { output: response.content, cost: response.cost, service: 'openrouter' };
    }
  }
}

// ============ PRODUCT AGENT ============
class ProductAgent extends LLMAgent {
  constructor(db, llm, budgetController) {
    super('product_agent', db, llm, budgetController, {
      defaultTaskType: 'complex_reasoning',
      defaultMaxTokens: 2500,
      defaultTemperature: 0.7
    });
  }

  async getPrompt(taskType, context) {
    return `You are a product strategist.

Focus on:
- Product-market fit
- Feature prioritization
- User needs analysis
- Competitive positioning
- Roadmap planning`;
  }

  async executeLogic(input) {
    const { market, target_users, problem } = input;

    const prompt = `Create product strategy for:
Market: ${market}
Target Users: ${target_users}
Problem: ${problem}

Provide:
1. Product positioning
2. Core features (MVP)
3. Nice-to-have features
4. Success metrics
5. Competitive advantages

Return as structured JSON.`;

    const response = await this.callLLM(prompt, {
      taskType: 'complex_reasoning',
      maxTokens: 2500
    });

    try {
      const parsed = JSON.parse(response.content);
      return { output: parsed, cost: response.cost, service: 'openrouter' };
    } catch (e) {
      return { output: response.content, cost: response.cost, service: 'openrouter' };
    }
  }
}

// ============ MARKETING AGENT ============
class MarketingAgent extends LLMAgent {
  constructor(db, llm, budgetController) {
    super('marketing_agent', db, llm, budgetController, {
      defaultTaskType: 'complex_reasoning',
      defaultMaxTokens: 2500,
      defaultTemperature: 0.7
    });
  }

  async getPrompt(taskType, context) {
    return `You are a growth marketing strategist.

Focus on:
- Customer acquisition
- Growth channels
- Marketing mix
- Campaign strategies
- Conversion optimization`;
  }

  async executeLogic(input) {
    const { product, target_market, budget } = input;

    const prompt = `Create marketing strategy for:
Product: ${product}
Market: ${target_market}
Budget: $${budget}

Provide:
1. Ideal channels (based on budget)
2. Message by channel
3. Campaign timeline
4. Success metrics
5. Budget allocation

Return as structured JSON.`;

    const response = await this.callLLM(prompt, {
      taskType: 'complex_reasoning',
      maxTokens: 2500
    });

    try {
      const parsed = JSON.parse(response.content);
      return { output: parsed, cost: response.cost, service: 'openrouter' };
    } catch (e) {
      return { output: response.content, cost: response.cost, service: 'openrouter' };
    }
  }
}

// ============ SALES AGENT ============
class SalesAgent extends LLMAgent {
  constructor(db, llm, budgetController) {
    super('sales_agent', db, llm, budgetController, {
      defaultTaskType: 'copywriting',
      defaultMaxTokens: 2000,
      defaultTemperature: 0.7
    });
  }

  async getPrompt(taskType, context) {
    return `You are a sales strategist.

Focus on:
- Sales funnel optimization
- Objection handling
- Closing techniques
- Sales messaging
- Lead qualification`;
  }

  async executeLogic(input) {
    const { offer, target_buyer, price } = input;

    const prompt = `Create sales strategy for:
Offer: ${offer}
Buyer: ${target_buyer}
Price: $${price}

Provide:
1. Ideal customer profile
2. Sales pitch (3 versions)
3. Common objections & responses
4. Closing techniques
5. Follow-up sequences

Return as structured JSON.`;

    const response = await this.callLLM(prompt, {
      taskType: 'copywriting',
      maxTokens: 2500
    });

    try {
      const parsed = JSON.parse(response.content);
      return { output: parsed, cost: response.cost, service: 'openrouter' };
    } catch (e) {
      return { output: response.content, cost: response.cost, service: 'openrouter' };
    }
  }
}

// ============ FINANCE AGENT ============
class FinanceAgent extends LLMAgent {
  constructor(db, llm, budgetController) {
    super('finance_agent', db, llm, budgetController, {
      defaultTaskType: 'complex_reasoning',
      defaultMaxTokens: 2000,
      defaultTemperature: 0.5
    });
  }

  async getPrompt(taskType, context) {
    return `You are a financial analyst.

Focus on:
- Unit economics
- Pricing strategy
- Revenue modeling
- Cost analysis
- Profitability`;
  }

  async executeLogic(input) {
    const { cogs, revenue_per_unit, marketing_cost } = input;

    const prompt = `Analyze unit economics:
COGS: $${cogs}
Revenue/Unit: $${revenue_per_unit}
Marketing/Unit: $${marketing_cost}

Provide:
1. Gross margin
2. Net unit economics
3. Break-even point
4. LTV/CAC ratio
5. Pricing recommendations

Return as JSON.`;

    const response = await this.callLLM(prompt, {
      taskType: 'complex_reasoning',
      maxTokens: 1500
    });

    try {
      const parsed = JSON.parse(response.content);
      return { output: parsed, cost: response.cost, service: 'openrouter' };
    } catch (e) {
      return { output: response.content, cost: response.cost, service: 'openrouter' };
    }
  }
}

// ============ ANALYTICS AGENT ============
class AnalyticsAgent extends LLMAgent {
  constructor(db, llm, budgetController) {
    super('analytics_agent', db, llm, budgetController, {
      defaultTaskType: 'complex_reasoning',
      defaultMaxTokens: 2000,
      defaultTemperature: 0.5
    });
  }

  async getPrompt(taskType, context) {
    return `You are a data analyst.

Focus on:
- Metrics interpretation
- Attribution modeling
- Anomaly detection
- Forecasting
- Data storytelling`;
  }

  async executeLogic(input) {
    const { metrics, time_period } = input;

    const prompt = `Analyze metrics from ${time_period}:
${JSON.stringify(metrics)}

Provide:
1. Key insights
2. Trends & patterns
3. Anomalies
4. Forecast next period
5. Recommendations

Return as JSON.`;

    const response = await this.callLLM(prompt, {
      taskType: 'complex_reasoning',
      maxTokens: 2000
    });

    try {
      const parsed = JSON.parse(response.content);
      return { output: parsed, cost: response.cost, service: 'openrouter' };
    } catch (e) {
      return { output: response.content, cost: response.cost, service: 'openrouter' };
    }
  }
}

// ============ IDEATION AGENT ============
class IdeationAgent extends LLMAgent {
  constructor(db, llm, budgetController) {
    super('ideation_agent', db, llm, budgetController, {
      defaultTaskType: 'complex_reasoning',
      defaultMaxTokens: 2500,
      defaultTemperature: 0.9
    });
  }

  async getPrompt(taskType, context) {
    return `You are an innovation strategist.

Focus on:
- Market research
- Brainstorming
- Trend analysis
- Competitive intelligence
- Opportunity identification`;
  }

  async executeLogic(input) {
    const { market, problem } = input;

    const prompt = `Generate ideas for:
Market: ${market}
Problem: ${problem}

Provide:
1. 5 product ideas
2. 5 marketing angles
3. Partnerships to explore
4. Market trends
5. Competitor analysis

Return as JSON.`;

    const response = await this.callLLM(prompt, {
      taskType: 'complex_reasoning',
      maxTokens: 2500
    });

    try {
      const parsed = JSON.parse(response.content);
      return { output: parsed, cost: response.cost, service: 'openrouter' };
    } catch (e) {
      return { output: response.content, cost: response.cost, service: 'openrouter' };
    }
  }
}

// ============ VIDEO AGENT ============
class VideoAgent extends LLMAgent {
  constructor(db, llm, budgetController) {
    super('video_agent', db, llm, budgetController, {
      defaultTaskType: 'copywriting',
      defaultMaxTokens: 2500,
      defaultTemperature: 0.8
    });
  }

  async getPrompt(taskType, context) {
    return `You are a video strategist and scriptwriter.

Focus on:
- Video hooks
- Storytelling
- Pacing and timing
- Platform optimization
- Call-to-action placement`;
  }

  async executeLogic(input) {
    const { topic, platform, duration } = input;

    const prompt = `Create video strategy for:
Topic: ${topic}
Platform: ${platform}
Duration: ${duration}s

Provide:
1. Hook (first 3 seconds)
2. Story structure
3. Key messages
4. B-roll suggestions
5. CTA placement

Return as JSON.`;

    const response = await this.callLLM(prompt, {
      taskType: 'copywriting',
      maxTokens: 2500
    });

    try {
      const parsed = JSON.parse(response.content);
      return { output: parsed, cost: response.cost, service: 'openrouter' };
    } catch (e) {
      return { output: response.content, cost: response.cost, service: 'openrouter' };
    }
  }
}

// ============ SOCIAL MEDIA AGENT ============
class SocialMediaAgent extends LLMAgent {
  constructor(db, llm, budgetController) {
    super('social_media_agent', db, llm, budgetController, {
      defaultTaskType: 'fast_copywriting',
      defaultMaxTokens: 2000,
      defaultTemperature: 0.8
    });
  }

  async getPrompt(taskType, context) {
    return `You are a social media strategist.

Focus on:
- Platform-specific best practices
- Community engagement
- Viral potential
- Hashtag strategy
- Growth tactics`;
  }

  async executeLogic(input) {
    const { platforms, content_type } = input;

    const prompt = `Create social strategy for:
Platforms: ${platforms.join(', ')}
Content: ${content_type}

Provide:
1. Posting schedule
2. Content pillars
3. Hashtag strategy
4. Engagement tactics
5. Growth initiatives

Return as JSON.`;

    const response = await this.callLLM(prompt, {
      taskType: 'fast_copywriting',
      maxTokens: 2000,
      budgetTight: true
    });

    try {
      const parsed = JSON.parse(response.content);
      return { output: parsed, cost: response.cost, service: 'openrouter' };
    } catch (e) {
      return { output: response.content, cost: response.cost, service: 'openrouter' };
    }
  }
}

export {
  LandingPageAgent,
  ProductAgent,
  MarketingAgent,
  SalesAgent,
  FinanceAgent,
  AnalyticsAgent,
  IdeationAgent,
  VideoAgent,
  SocialMediaAgent
};
