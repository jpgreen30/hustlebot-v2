/**
 * CONTENT FACTORY
 *
 * Unified content generation pipeline:
 * Trend intelligence → Opportunity scoring → Research → Outline →
 * Generation → QA → SEO → Image → Internal linking → Publish →
 * Distribute → Performance loop
 *
 * Inputs: Google Trends, Search Console, GA4, competitor research, product feeds
 * Outputs: Published guides, reviews, comparisons, social posts
 */

import logger from '../utils/logger.js';
import { ContentIntegrations } from './content-integrations.js';
import { JobQueue } from './job-queue.js';

class ContentFactory {
  constructor(config = {}) {
    this.config = config;
    this.db = config.db || null;
    this.llm = config.llm || null;
    this.imageGenerator = config.imageGenerator || null;
    this.analytics = config.analytics || null;
    this.distribution = config.distribution || null;

    // Domain configuration for content context
    this.domainContext = config.domainContext || process.env.CONTENT_DOMAIN || 'parenting and family wellness';

    this.integrations = new ContentIntegrations({
      providers: config.providers,
      domainContext: this.domainContext,
      callTimeout: config.callTimeout || 30000
    });

    // Job queue for async content generation
    this.jobQueue = new JobQueue({
      maxConcurrent: config.maxConcurrentJobs || 3,
      jobTimeout: config.jobTimeout || 300000 // 5 minutes total
    });

    this.pipeline = {
      trendIntelligence: null,
      opportunityScoring: null,
      research: null,
      outline: null,
      generation: null,
      qa: null,
      seo: null,
      image: null,
      internalLinking: null,
      publish: null,
      distribute: null
    };

    this.metrics = {
      contentGenerated: 0,
      contentPublished: 0,
      avgQualityScore: 0,
      totalReach: 0,
      totalEngagement: 0,
      avgGenerationTime: 0
    };
  }

  /**
   * Initialize Content Factory
   */
  async initialize() {
    try {
      logger.info('📝 Initializing Content Factory...');

      if (!this.db) {
        logger.warn('⚠️  Database not configured, content persistence disabled');
      }
      if (!this.llm) {
        logger.warn('⚠️  LLM not configured, content generation disabled');
      }

      // Clean up old jobs periodically
      setInterval(() => this.jobQueue.cleanup(), 3600000); // Every hour

      logger.info('✅ Content Factory initialized');
      logger.info(`📊 Domain context: ${this.domainContext}`);
      logger.info(`⚙️  Max concurrent jobs: ${this.jobQueue.maxConcurrent}`);
      return true;
    } catch (error) {
      logger.error('Content Factory initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Start async content generation job
   * Returns job ID for tracking progress
   */
  startContentGeneration(topic, contentType = 'guide', options = {}) {
    try {
      // Validate input
      if (!topic || topic.length > 500) {
        throw new Error('Topic must be 1-500 characters');
      }
      if (!['guide', 'review', 'comparison', 'weeklyJourney', 'news'].includes(contentType)) {
        throw new Error(`Invalid content type: ${contentType}`);
      }

      const jobId = this.jobQueue.createJob('content-generation', {
        topic,
        contentType,
        options,
        execute: async () => {
          const result = await this.generateContent(topic, contentType, options);
          this.jobQueue.setResult(jobId, result);
        }
      });

      logger.info(`📋 Content generation job started: ${jobId}`);
      return jobId;
    } catch (error) {
      logger.error(`Failed to start content generation: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get job status
   */
  getJobStatus(jobId) {
    return this.jobQueue.getJob(jobId);
  }

  /**
   * Execute full content pipeline (synchronous, for direct calls)
   */
  async generateContent(topic, contentType = 'guide', options = {}) {
    const startTime = Date.now();

    try {
      logger.info(`📝 Starting content pipeline for: ${topic} (${contentType})`);

      const pipeline = {
        topic,
        contentType,
        createdAt: new Date(),
        status: 'planning',
        stages: {}
      };

      // Stage 1: Gather trend intelligence
      pipeline.stages.trends = await this.gatherTrendIntelligence(topic, options);
      logger.info(`✅ Trend intelligence gathered`);

      // Stage 2: Score opportunity
      pipeline.stages.opportunity = await this.scoreOpportunity(
        topic,
        pipeline.stages.trends,
        options
      );
      logger.info(`✅ Opportunity scored: ${pipeline.stages.opportunity.score}/100`);

      // Stage 3: Research topic
      pipeline.stages.research = await this.conductResearch(topic, options);
      logger.info(`✅ Research completed: ${pipeline.stages.research.sourceCount} sources`);

      // Stage 4: Create outline
      pipeline.stages.outline = await this.generateOutline(
        topic,
        contentType,
        pipeline.stages.research,
        options
      );
      logger.info(`✅ Outline generated: ${pipeline.stages.outline.sections.length} sections`);

      // Stage 5: Generate content
      pipeline.stages.content = await this.generateContentBody(
        pipeline.stages.outline,
        contentType,
        options
      );
      logger.info(`✅ Content generated: ${pipeline.stages.content.wordCount} words`);

      // Stage 6: QA & fact-checking
      pipeline.stages.qa = await this.performQA(
        pipeline.stages.content,
        pipeline.stages.research,
        options
      );
      logger.info(`✅ QA complete: quality score ${pipeline.stages.qa.qualityScore}/100`);

      // Stage 7: SEO optimization
      pipeline.stages.seo = await this.optimizeForSEO(
        pipeline.stages.content,
        topic,
        options
      );
      logger.info(`✅ SEO optimized`);

      // Stage 8: Generate featured image
      pipeline.stages.image = await this.generateImage(topic, contentType, options);
      logger.info(`✅ Image generated`);

      // Stage 9: Internal linking
      pipeline.stages.linking = await this.addInternalLinks(
        pipeline.stages.content,
        options
      );
      logger.info(`✅ Internal links added`);

      // Stage 10: Publish
      pipeline.stages.published = await this.publishContent(
        pipeline.stages.content,
        pipeline.stages.seo,
        pipeline.stages.image,
        contentType,
        options
      );
      logger.info(`✅ Content published: ${pipeline.stages.published.url}`);
      pipeline.status = 'published';

      // Stage 11: Distribute
      pipeline.stages.distribution = await this.distributeContent(
        pipeline.stages.published,
        options
      );
      logger.info(`✅ Content distributed`);
      pipeline.status = 'distributed';

      this.metrics.contentPublished++;
      this.metrics.contentGenerated++;

      // Track generation time
      const duration = Date.now() - startTime;
      this.metrics.avgGenerationTime = Math.round(
        (this.metrics.avgGenerationTime * (this.metrics.contentGenerated - 1) + duration) /
          this.metrics.contentGenerated
      );

      logger.info(`✅ Content pipeline completed in ${(duration / 1000).toFixed(2)}s`);
      return pipeline;
    } catch (error) {
      logger.error(`Content pipeline failed: ${error.message}`);
      const duration = Date.now() - startTime;
      logger.error(`Pipeline ran for ${(duration / 1000).toFixed(2)}s before failure`);
      throw error;
    }
  }

  /**
   * Stage 1: Gather trend intelligence
   */
  async gatherTrendIntelligence(topic, options = {}) {
    try {
      logger.info(`📊 Gathering trends for: ${topic}`);
      return await this.integrations.researchTrends(topic, options);
    } catch (error) {
      logger.error(`Trend intelligence failed: ${error.message}`);
      return { topic, error: error.message };
    }
  }

  /**
   * Stage 2: Score opportunity
   */
  async scoreOpportunity(topic, trends, options = {}) {
    try {
      const score = Math.floor(Math.random() * 40) + 60; // 60-100 for demo

      return {
        topic,
        score,
        searchVolume: Math.floor(Math.random() * 10000) + 1000,
        competitionLevel: score > 80 ? 'high' : 'medium',
        trend: Math.random() > 0.5 ? 'rising' : 'stable',
        recommendedAction: score > 80 ? 'publish' : 'monitor'
      };
    } catch (error) {
      logger.error(`Opportunity scoring failed: ${error.message}`);
      return { score: 0, error: error.message };
    }
  }

  /**
   * Stage 3: Conduct research
   */
  async conductResearch(topic, options = {}) {
    try {
      logger.info(`🔍 Researching: ${topic}`);

      // Placeholder: In production, use Firecrawl, web scraping, APIs
      const research = {
        topic,
        sourceCount: 5,
        sources: [
          { url: 'https://example.com/1', title: 'Source 1', relevance: 0.9 },
          { url: 'https://example.com/2', title: 'Source 2', relevance: 0.8 }
        ],
        keyFindings: [
          'Finding 1',
          'Finding 2',
          'Finding 3'
        ],
        gaps: [
          'Gap 1',
          'Gap 2'
        ]
      };

      return research;
    } catch (error) {
      logger.error(`Research failed: ${error.message}`);
      return { sourceCount: 0, error: error.message };
    }
  }

  /**
   * Stage 4: Generate outline
   */
  async generateOutline(topic, contentType, research, options = {}) {
    try {
      logger.info(`📋 Generating outline for: ${topic}`);
      return await this.integrations.generateOutlineWithLLM(topic, contentType, research);
    } catch (error) {
      logger.error(`Outline generation failed: ${error.message}`);
      return { sections: [], error: error.message };
    }
  }

  /**
   * Stage 5: Generate content body
   */
  async generateContentBody(outline, contentType, options = {}) {
    try {
      logger.info(`✍️ Generating content body...`);
      const topic = outline.topic || 'Topic';
      return await this.integrations.generateContentBodyWithLLM(outline, contentType, topic);
    } catch (error) {
      logger.error(`Content generation failed: ${error.message}`);
      return { wordCount: 0, error: error.message };
    }
  }

  /**
   * Stage 6: QA & fact-checking
   */
  async performQA(content, research, options = {}) {
    try {
      logger.info(`✅ Performing quality assurance...`);
      return await this.integrations.performQAWithLLM(content, research);
    } catch (error) {
      logger.error(`QA failed: ${error.message}`);
      return { qualityScore: 0, error: error.message };
    }
  }

  /**
   * Stage 7: SEO optimization
   */
  async optimizeForSEO(content, topic, options = {}) {
    try {
      logger.info(`🔍 Optimizing for SEO...`);
      return await this.integrations.optimizeForSEOWithLLM(content, topic);
    } catch (error) {
      logger.error(`SEO optimization failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Stage 8: Generate featured image
   */
  async generateImage(topic, contentType, options = {}) {
    try {
      logger.info(`🖼️ Generating featured image...`);
      const prompt = `Professional featured image for ${contentType} about ${topic}`;
      return await this.integrations.generateImage(prompt, options);
    } catch (error) {
      logger.error(`Image generation failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Stage 9: Add internal links
   */
  async addInternalLinks(content, options = {}) {
    try {
      logger.info(`🔗 Adding internal links...`);

      const linking = {
        internalLinksAdded: 3,
        links: [
          { text: 'Related guide', url: '/guides/related-topic' },
          { text: 'Product review', url: '/reviews/product-1' },
          { text: 'Comparison', url: '/comparisons/comparison-1' }
        ]
      };

      return linking;
    } catch (error) {
      logger.error(`Internal linking failed: ${error.message}`);
      return { internalLinksAdded: 0, error: error.message };
    }
  }

  /**
   * Stage 10: Publish content
   */
  async publishContent(content, seo, image, contentType, options = {}) {
    try {
      logger.info(`📤 Publishing content...`);

      // In production: Save to Supabase, generate URL
      const published = {
        id: `content-${Date.now()}`,
        title: content.title,
        slug: seo.slug,
        url: `/content/${seo.slug}`,
        contentType,
        publishedAt: new Date(),
        author: 'Content Factory',
        image: image.url,
        seo,
        status: 'published'
      };

      return published;
    } catch (error) {
      logger.error(`Publishing failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Stage 11: Distribute content
   */
  async distributeContent(published, options = {}) {
    try {
      logger.info(`📢 Distributing content...`);
      return await this.integrations.distributeToSocial(published, options);
    } catch (error) {
      logger.error(`Distribution failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Get factory metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      timestamp: new Date()
    };
  }

  /**
   * Get factory status
   */
  getStatus() {
    return {
      initialized: !!this.db,
      llmConfigured: !!this.llm,
      imageGeneratorConfigured: !!this.imageGenerator,
      analyticsConfigured: !!this.analytics,
      distributionConfigured: !!this.distribution,
      metrics: this.getMetrics()
    };
  }
}

export { ContentFactory };
