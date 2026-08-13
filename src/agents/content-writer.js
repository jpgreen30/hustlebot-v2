/**
 * CONTENT WRITER AGENT
 * 
 * Generates volume content:
 * - Blog posts
 * - Social media posts
 * - Email sequences
 * - Video scripts
 * - Articles
 * 
 * Uses: Grok 2 (fast, cheap, good quality)
 */

import { LLMAgent } from './llm-agent.js';
import logger from '../utils/logger.js';

class ContentWriterAgent extends LLMAgent {
  constructor(db, llm, budgetController) {
    super('content_writer', db, llm, budgetController, {
      defaultTaskType: 'fast_copywriting',
      defaultMaxTokens: 3000,
      defaultTemperature: 0.8
    });

    this.registerTool('generate_blog_post', 'Generate SEO blog post', {
      type: 'object',
      properties: {
        topic: { type: 'string' },
        keyword: { type: 'string' },
        word_count: { type: 'number', default: 2000 },
        style: { type: 'string', enum: ['informative', 'how-to', 'listicle', 'opinion'] }
      },
      required: ['topic', 'keyword']
    }, this.generateBlogPost);

    this.registerTool('generate_social_posts', 'Generate platform-specific social posts', {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'What to post about' },
        platform: { type: 'string', enum: ['twitter', 'linkedin', 'instagram', 'tiktok', 'facebook'] },
        quantity: { type: 'number', default: 5 },
        hashtags: { type: 'boolean', default: true }
      },
      required: ['content', 'platform']
    }, this.generateSocialPosts);

    this.registerTool('generate_email_sequence', 'Generate email sequence', {
      type: 'object',
      properties: {
        sequence_type: { type: 'string', enum: ['welcome', 'nurture', 'sales', 'reactivation'] },
        product: { type: 'string' },
        num_emails: { type: 'number', default: 5 }
      },
      required: ['sequence_type', 'product']
    }, this.generateEmailSequence);

    this.registerTool('generate_video_script', 'Generate video script with timing', {
      type: 'object',
      properties: {
        topic: { type: 'string' },
        duration_seconds: { type: 'number' },
        style: { type: 'string', enum: ['tutorial', 'story', 'product_demo', 'educational'] }
      },
      required: ['topic', 'duration_seconds']
    }, this.generateVideoScript);
  }

  async getPrompt(taskType, context) {
    return `You are an expert content writer. Generate high-quality, engaging content that drives results.

Focus on:
- Clear, compelling writing
- Optimized for the platform
- Engaging and shareable
- Action-oriented

Write in a conversational, authentic tone.`;
  }

  async generateBlogPost(input) {
    try {
      const {
        topic,
        keyword,
        word_count = 2000,
        style = 'how-to'
      } = input;

      const prompt = `Write a ${word_count}-word blog post about "${topic}".

Target keyword: ${keyword}
Style: ${style}

Include:
1. SEO-optimized title with keyword
2. Meta description
3. Compelling introduction
4. Main sections with subheadings
5. Key takeaways
6. Call to action
7. Internal linking suggestions

Format as JSON:
{
  "title": "...",
  "meta_description": "...",
  "content": "Full blog post content",
  "keywords": ["keyword1", "keyword2"],
  "internal_links": ["page1", "page2"],
  "word_count": ${word_count}
}`;

      const llmResponse = await this.callLLM(prompt, {
        taskType: 'fast_copywriting',
        maxTokens: 4000,
        budgetTight: true
      });

      const blog = JSON.parse(llmResponse.content);

      return {
        output: blog,
        cost: llmResponse.cost,
        service: 'openrouter'
      };
    } catch (error) {
      logger.error('Generate blog post failed:', error);
      throw error;
    }
  }

  async generateSocialPosts(input) {
    try {
      const {
        content,
        platform,
        quantity = 5,
        hashtags = true
      } = input;

      const platformGuides = {
        twitter: 'Keep under 280 chars. Use humor/engagement.',
        linkedin: 'Professional, thought-leadership focused.',
        instagram: 'Visual-first, use emojis, call to action.',
        tiktok: 'Trending sounds/hooks, short & punchy, Gen-Z friendly.',
        facebook: 'Longer form OK, community focus, shareable.'
      };

      const prompt = `Generate ${quantity} ${platform} posts about: "${content}"

Platform guidelines: ${platformGuides[platform]}
Include hashtags: ${hashtags}

Format as JSON array:
[
  {
    "post": "The actual post text",
    "hashtags": ["#tag1", "#tag2"] ${!hashtags ? '(empty)' : ''}
  },
  ...
]`;

      const llmResponse = await this.callLLM(prompt, {
        taskType: 'fast_copywriting',
        maxTokens: 2000,
        budgetTight: true
      });

      const posts = JSON.parse(llmResponse.content);

      return {
        output: posts,
        cost: llmResponse.cost,
        service: 'openrouter'
      };
    } catch (error) {
      logger.error('Generate social posts failed:', error);
      throw error;
    }
  }

  async generateEmailSequence(input) {
    try {
      const {
        sequence_type,
        product,
        num_emails = 5
      } = input;

      const sequences = {
        welcome: 'Day 1: Welcome + value. Day 3: Product features. Day 5: Social proof. Day 7: Offer. Day 10: Last chance.',
        nurture: 'Educate → Build trust → Demonstrate value → Social proof → Call to action',
        sales: 'Hook → Problem → Solution → Social proof → Price → Guarantee → CTA',
        reactivation: 'Why we miss you → Whats new → Special offer → Limited time → Final push'
      };

      const prompt = `Generate a ${num_emails}-email ${sequence_type} sequence for ${product}.

Sequence arc: ${sequences[sequence_type]}

Return as JSON:
{
  "sequence_type": "${sequence_type}",
  "emails": [
    {
      "day": 1,
      "subject_line": "...",
      "preview": "...",
      "body": "Complete email content",
      "cta": "Call to action",
      "goal": "What this email achieves"
    },
    ...
  ]
}`;

      const llmResponse = await this.callLLM(prompt, {
        taskType: 'fast_copywriting',
        maxTokens: 3000,
        budgetTight: true
      });

      const sequence = JSON.parse(llmResponse.content);

      return {
        output: sequence,
        cost: llmResponse.cost,
        service: 'openrouter'
      };
    } catch (error) {
      logger.error('Generate email sequence failed:', error);
      throw error;
    }
  }

  async generateVideoScript(input) {
    try {
      const {
        topic,
        duration_seconds,
        style = 'educational'
      } = input;

      const prompt = `Write a ${duration_seconds}-second video script about "${topic}".

Style: ${style}
Pacing: ~150 words per minute

Format as JSON:
{
  "title": "Video title",
  "duration": ${duration_seconds},
  "hook": "First 5 seconds - grab attention",
  "sections": [
    {
      "timestamp": "0:00-0:10",
      "voiceover": "Script text",
      "visuals": "What should be on screen",
      "b_roll": "Background footage suggestions"
    },
    ...
  ],
  "cta": "Call to action",
  "music_suggestions": ["song style", "tempo"],
  "word_count": estimated count
}`;

      const llmResponse = await this.callLLM(prompt, {
        taskType: 'fast_copywriting',
        maxTokens: 2500,
        budgetTight: true
      });

      const script = JSON.parse(llmResponse.content);

      return {
        output: script,
        cost: llmResponse.cost,
        service: 'openrouter'
      };
    } catch (error) {
      logger.error('Generate video script failed:', error);
      throw error;
    }
  }
}

export { ContentWriterAgent };
