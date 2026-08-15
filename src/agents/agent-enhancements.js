/**
 * AGENT ENHANCEMENTS
 *
 * Mixin capabilities for all agents:
 * - Integration access (payments, social, images, email, etc.)
 * - Analytics & learning (track performance, generate playbooks)
 * - Memory system (store learnings, recall patterns)
 * - Cost optimization (track spend, stay within budget)
 * - Scheduling (schedule future tasks)
 * - Data enrichment (company/person data)
 */

import logger from '../utils/logger.js';

/**
 * Enhanced Agent Mixin
 * Add to any agent class to unlock Phase 4-5 capabilities
 */
class EnhancedAgentMixin {
  /**
   * Initialize enhancements with integrations and features
   */
  initializeEnhancements(integrations, features, mailbox) {
    this.integrations = integrations || {};
    this.features = features || {};
    this.mailbox = mailbox;
    this.learnings = new Map();
    this.performanceMetrics = {
      executionsCompleted: 0,
      averageQuality: 0,
      successRate: 0,
      totalValue: 0
    };

    // Register enhancement tools
    this.registerEnhancementTools();

    logger.info(`✨ Enhanced capabilities enabled for ${this.name}`);
  }

  /**
   * Register all enhancement tools
   */
  registerEnhancementTools() {
    // Integration tools
    if (this.integrations.payment) {
      this.registerTool('create_payment_intent', 'Create payment for customer', {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'Amount in USD' },
          currency: { type: 'string', default: 'usd' },
          metadata: { type: 'object', description: 'Custom metadata' }
        },
        required: ['amount']
      }, this.executeCreatePaymentIntent.bind(this));
    }

    if (this.integrations.social) {
      this.registerTool('schedule_social_post', 'Schedule post on social media', {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Post content' },
          platforms: { type: 'array', items: { type: 'string' }, description: 'Platforms' },
          scheduleTime: { type: 'string', description: 'ISO timestamp' }
        },
        required: ['content', 'platforms']
      }, this.executeScheduleSocialPost.bind(this));
    }

    if (this.integrations.image) {
      this.registerTool('generate_images', 'Generate AI images', {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Image description' },
          width: { type: 'number', default: 512 },
          height: { type: 'number', default: 512 },
          numOutputs: { type: 'number', default: 1 }
        },
        required: ['prompt']
      }, this.executeGenerateImages.bind(this));
    }

    if (this.integrations.email) {
      this.registerTool('send_email', 'Send email campaign', {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient email' },
          subject: { type: 'string' },
          html: { type: 'string', description: 'HTML content' },
          campaign_type: { type: 'string', enum: ['transactional', 'campaign', 'automation'] }
        },
        required: ['to', 'subject', 'html']
      }, this.executeSendEmail.bind(this));
    }

    if (this.integrations.scraping) {
      this.registerTool('scrape_webpage', 'Scrape and extract webpage data', {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to scrape' },
          extract_emails: { type: 'boolean', description: 'Extract emails' },
          extract_data: { type: 'boolean', description: 'Extract structured data' }
        },
        required: ['url']
      }, this.executeScrapeWebpage.bind(this));
    }

    if (this.integrations.enrichment) {
      this.registerTool('enrich_company', 'Enrich company data', {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Company domain' }
        },
        required: ['domain']
      }, this.executeEnrichCompany.bind(this));

      this.registerTool('enrich_person', 'Enrich person data', {
        type: 'object',
        properties: {
          email: { type: 'string', description: 'Email address' },
          name: { type: 'string', description: 'Full name (optional)' }
        },
        required: ['email']
      }, this.executeEnrichPerson.bind(this));
    }

    // Analytics tools
    if (this.features.analytics) {
      this.registerTool('track_performance', 'Track agent performance', {
        type: 'object',
        properties: {
          metric_name: { type: 'string' },
          value: { type: 'number' },
          tags: { type: 'array', items: { type: 'string' } }
        },
        required: ['metric_name', 'value']
      }, this.executeTrackPerformance.bind(this));
    }

    // Cost optimization tools
    if (this.features.cost) {
      this.registerTool('check_budget', 'Check budget remaining', {
        type: 'object',
        properties: {},
        required: []
      }, this.executeCheckBudget.bind(this));

      this.registerTool('log_cost', 'Log operation cost', {
        type: 'object',
        properties: {
          service: { type: 'string' },
          amount: { type: 'number' }
        },
        required: ['service', 'amount']
      }, this.executeLogCost.bind(this));
    }

    // Memory tools
    if (this.features.memory) {
      this.registerTool('save_learning', 'Save learning for future use', {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'What did you learn?' },
          description: { type: 'string' },
          result: { type: 'object', description: 'Outcome of the learning' },
          success_rate: { type: 'number', description: 'Success rate 0-1' }
        },
        required: ['title', 'description']
      }, this.executeSaveLearning.bind(this));

      this.registerTool('recall_pattern', 'Recall past successful patterns', {
        type: 'object',
        properties: {
          context: { type: 'string', description: 'What are you trying to do?' }
        },
        required: ['context']
      }, this.executeRecallPattern.bind(this));
    }

    // Scheduling tools
    if (this.features.scheduling) {
      this.registerTool('schedule_task', 'Schedule task for future execution', {
        type: 'object',
        properties: {
          task_name: { type: 'string' },
          cron_expression: { type: 'string', description: 'e.g., "0 * * * *" for hourly' },
          payload: { type: 'object', description: 'Task data' }
        },
        required: ['task_name', 'cron_expression']
      }, this.executeScheduleTask.bind(this));
    }
  }

  // ============ INTEGRATION EXECUTORS ============

  async executeCreatePaymentIntent(args) {
    try {
      const { amount, currency, metadata } = args;
      const result = await this.integrations.payment.createPaymentIntent(amount, currency, metadata);

      // Track cost
      await this.executeLogCost({ service: 'stripe', amount: 0.10 });

      logger.info(`💳 Payment intent created: $${amount}`);
      return result;
    } catch (error) {
      logger.error(`Payment creation failed: ${error.message}`);
      throw error;
    }
  }

  async executeScheduleSocialPost(args) {
    try {
      const { content, platforms, scheduleTime } = args;
      const result = await this.integrations.social.schedulePost(content, platforms, scheduleTime);

      await this.executeLogCost({ service: 'postiz', amount: 0.05 });

      logger.info(`📱 Social post scheduled for ${platforms.join(', ')}`);
      return result;
    } catch (error) {
      logger.error(`Social post scheduling failed: ${error.message}`);
      throw error;
    }
  }

  async executeGenerateImages(args) {
    try {
      const { prompt, width, height, numOutputs } = args;
      const result = await this.integrations.image.generateImage(prompt, { width, height, numOutputs });

      await this.executeLogCost({ service: 'replicate', amount: 0.02 * numOutputs });

      logger.info(`🖼️  Images generated: ${numOutputs}`);
      return result;
    } catch (error) {
      logger.error(`Image generation failed: ${error.message}`);
      throw error;
    }
  }

  async executeSendEmail(args) {
    try {
      const { to, subject, html, campaign_type } = args;
      const result = await this.integrations.email.sendEmail(to, subject, html);

      await this.executeLogCost({ service: 'brevo', amount: 0.001 });

      logger.info(`📧 Email sent to ${to}`);
      return result;
    } catch (error) {
      logger.error(`Email sending failed: ${error.message}`);
      throw error;
    }
  }

  async executeScrapeWebpage(args) {
    try {
      const { url, extract_emails, extract_data } = args;
      const result = await this.integrations.scraping.scrapePage(url);

      await this.executeLogCost({ service: 'firecrawl', amount: 0.05 });

      logger.info(`🕷️  Scraped ${url}`);
      return result;
    } catch (error) {
      logger.error(`Web scraping failed: ${error.message}`);
      throw error;
    }
  }

  async executeEnrichCompany(args) {
    try {
      const { domain } = args;
      const result = await this.integrations.enrichment.enrichCompany(domain);

      await this.executeLogCost({ service: 'clearbit', amount: 0.03 });

      logger.info(`🏢 Company enriched: ${domain}`);
      return result;
    } catch (error) {
      logger.error(`Company enrichment failed: ${error.message}`);
      throw error;
    }
  }

  async executeEnrichPerson(args) {
    try {
      const { email, name } = args;
      const result = await this.integrations.enrichment.enrichPerson(email, name);

      await this.executeLogCost({ service: 'clearbit', amount: 0.01 });

      logger.info(`👤 Person enriched: ${email}`);
      return result;
    } catch (error) {
      logger.error(`Person enrichment failed: ${error.message}`);
      throw error;
    }
  }

  // ============ ANALYTICS EXECUTORS ============

  async executeTrackPerformance(args) {
    try {
      const { metric_name, value, tags } = args;
      const result = await this.features.analytics.trackEvent(this.name, metric_name, {
        value,
        tags,
        agent: this.name
      });

      this.performanceMetrics.executionsCompleted++;
      this.performanceMetrics.totalValue += value;

      logger.info(`📊 Performance tracked: ${metric_name} = ${value}`);
      return result;
    } catch (error) {
      logger.error(`Performance tracking failed: ${error.message}`);
      throw error;
    }
  }

  // ============ COST OPTIMIZATION EXECUTORS ============

  async executeCheckBudget(args) {
    try {
      const status = this.features.cost.getStatus();
      logger.info(`💰 Budget status: $${status.remaining} remaining`);
      return status;
    } catch (error) {
      logger.error(`Budget check failed: ${error.message}`);
      throw error;
    }
  }

  async executeLogCost(args) {
    try {
      const { service, amount } = args;
      const result = await this.features.cost.logTransaction(service, amount, {
        agent: this.name
      });

      logger.info(`💳 Cost logged: ${service} - $${amount}`);
      return result;
    } catch (error) {
      logger.error(`Cost logging failed: ${error.message}`);
      throw error;
    }
  }

  // ============ MEMORY EXECUTORS ============

  async executeSaveLearning(args) {
    try {
      const { title, description, result, success_rate } = args;

      const learning = {
        id: `learn_${this.name}_${Date.now()}`,
        title,
        description,
        result,
        success_rate: success_rate || 0.5,
        agent: this.name,
        timestamp: new Date()
      };

      this.learnings.set(learning.id, learning);

      // Also save to memory system
      await this.features.memory.recordLearning(title, description, result, {
        agent: this.name,
        successRate: success_rate
      });

      logger.info(`📚 Learning saved: ${title}`);
      return learning;
    } catch (error) {
      logger.error(`Learning save failed: ${error.message}`);
      throw error;
    }
  }

  async executeRecallPattern(args) {
    try {
      const { context } = args;

      // Search learnings for relevant patterns
      const relevantLearnings = Array.from(this.learnings.values())
        .filter(l => l.description.toLowerCase().includes(context.toLowerCase()))
        .sort((a, b) => b.success_rate - a.success_rate)
        .slice(0, 5);

      logger.info(`🔍 Recalled ${relevantLearnings.length} patterns for: ${context}`);

      return {
        context,
        patterns: relevantLearnings,
        count: relevantLearnings.length
      };
    } catch (error) {
      logger.error(`Pattern recall failed: ${error.message}`);
      throw error;
    }
  }

  // ============ SCHEDULING EXECUTORS ============

  async executeScheduleTask(args) {
    try {
      const { task_name, cron_expression, payload } = args;

      const result = await this.features.scheduling.scheduleRecurring(
        `${this.name}_${task_name}`,
        cron_expression,
        payload
      );

      logger.info(`⏰ Task scheduled: ${task_name}`);
      return result;
    } catch (error) {
      logger.error(`Task scheduling failed: ${error.message}`);
      throw error;
    }
  }

  // ============ HELPER METHODS ============

  /**
   * Get enhanced agent capabilities
   */
  getEnhancedCapabilities() {
    const capabilities = {
      integrations: {
        payment: !!this.integrations.payment,
        social: !!this.integrations.social,
        image: !!this.integrations.image,
        email: !!this.integrations.email,
        scraping: !!this.integrations.scraping,
        enrichment: !!this.integrations.enrichment
      },
      features: {
        analytics: !!this.features.analytics,
        cost_optimization: !!this.features.cost,
        memory: !!this.features.memory,
        scheduling: !!this.features.scheduling
      },
      performance: this.performanceMetrics,
      learningsCount: this.learnings.size
    };

    return capabilities;
  }

  /**
   * Send message to another agent via mailbox
   */
  async sendToAgent(targetAgent, message, priority = 'normal') {
    if (!this.mailbox) {
      logger.warn(`Mailbox not available for ${this.name}`);
      return null;
    }

    return await this.mailbox.send(this.name, targetAgent, message, { priority });
  }

  /**
   * Receive messages from mailbox
   */
  async receiveMessages() {
    if (!this.mailbox) {
      return [];
    }

    return await this.mailbox.receive(this.name);
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport() {
    return {
      agent: this.name,
      capabilities: this.getEnhancedCapabilities(),
      performanceMetrics: this.performanceMetrics,
      toolsAvailable: this.tools.length,
      learningsRecorded: this.learnings.size,
      generatedAt: new Date()
    };
  }
}

export { EnhancedAgentMixin };
