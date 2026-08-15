/**
 * HUSTLEBOT v2 - Minimal Working Server
 *
 * A simplified, production-ready server that:
 * 1. Starts Express server
 * 2. Optionally connects to Supabase
 * 3. Optionally starts Telegram bot
 * 4. Gracefully handles failures
 */

import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import logger from './utils/logger.js';
import { ProviderAbstraction } from './core/provider-abstraction.js';
import { ContentFactory } from './factories/content-factory.js';
import { EmailFactory } from './factories/email-factory.js';
import { LeadFactory } from './factories/lead-factory.js';
import { KnowledgeFactory } from './factories/knowledge-factory.js';
import { SiteFactory } from './factories/site-factory.js';
import { VideoFactory } from './factories/video-factory.js';
import { CommerceFactory } from './factories/commerce-factory.js';
import { BrandFactory } from './factories/brand-factory.js';
import { Mailbox } from './core/mailbox.js';
import { WorkflowRegistry } from './core/workflow-registry.js';
import { N8NIntegration } from './integrations/n8n-integration.js';

class HustleBotServer {
  constructor() {
    this.app = null;
    this.server = null;
    this.port = process.env.PORT || 3000;
    this.providers = null;
    this.contentFactory = null;
    this.emailFactory = null;
    this.leadFactory = null;
    this.knowledgeFactory = null;
    this.siteFactory = null;
    this.videoFactory = null;
    this.commerceFactory = null;
    this.brandFactory = null;
    this.mailbox = null;
    this.workflowRegistry = null;
    this.n8nIntegration = null;
  }

  async initialize() {
    logger.info('🚀 Initializing HustleBot v2...');

    try {
      // Initialize Express
      logger.info('🌐 Setting up Express server...');
      this.app = express();
      this.setupMiddleware();
      this.setupRoutes();
      logger.info('✅ Express server ready');

      // Try to initialize Supabase (graceful failure)
      try {
        logger.info('📦 Connecting to Supabase...');
        const { initSupabase } = await import('./db/supabase.js');
        const db = await initSupabase();
        logger.info('✅ Supabase connected');
        this.db = db;
      } catch (error) {
        logger.warn('⚠️  Supabase connection failed, continuing without DB:', error.message);
      }

      // Try to initialize OpenRouter (graceful failure)
      try {
        logger.info('🧠 Initializing OpenRouter...');
        const { initOpenRouter } = await import('./llm/openrouter.js');
        const llm = await initOpenRouter();
        logger.info('✅ OpenRouter ready');
        this.llm = llm;
      } catch (error) {
        logger.warn('⚠️  OpenRouter initialization failed, continuing:', error.message);
      }

      // Try to initialize Deepgram voice (graceful failure)
      try {
        logger.info('🎤 Initializing Deepgram voice...');
        const { initDeepgram } = await import('./voice/deepgram.js');
        const voice = await initDeepgram();
        if (voice) {
          this.voice = voice;
          logger.info('✅ Deepgram voice ready');
        }
      } catch (error) {
        logger.warn('⚠️  Deepgram initialization failed, continuing:', error.message);
      }

      // Initialize Provider Abstraction (storage + streaming)
      try {
        logger.info('🔌 Initializing provider abstraction...');
        this.providers = new ProviderAbstraction();
        await this.providers.initialize();
        logger.info('✅ Provider abstraction ready');
      } catch (error) {
        logger.warn('⚠️  Provider abstraction initialization failed, continuing:', error.message);
      }

      // Initialize Mailbox and Workflow Registry (core systems)
      try {
        logger.info('📬 Initializing Mailbox system...');
        this.mailbox = new Mailbox({ db: this.db });
        await this.mailbox.initialize();
        logger.info('✅ Mailbox ready');
      } catch (error) {
        logger.warn('⚠️  Mailbox initialization failed, continuing:', error.message);
      }

      try {
        logger.info('🔄 Initializing Workflow Registry...');
        this.workflowRegistry = new WorkflowRegistry({ db: this.db });
        await this.workflowRegistry.initialize();
        logger.info('✅ Workflow Registry ready');
      } catch (error) {
        logger.warn('⚠️  Workflow Registry initialization failed, continuing:', error.message);
      }

      // Initialize Content Factory
      try {
        logger.info('📝 Initializing Content Factory...');
        this.contentFactory = new ContentFactory({
          db: this.db,
          llm: this.llm,
          providers: this.providers,
          imageGenerator: this.providers,
          domainContext: process.env.CONTENT_DOMAIN || 'parenting and family wellness',
          maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS || '3'),
          callTimeout: parseInt(process.env.CONTENT_CALL_TIMEOUT || '30000')
        });
        await this.contentFactory.initialize();
        logger.info('✅ Content Factory ready');
      } catch (error) {
        logger.warn('⚠️  Content Factory initialization failed, continuing:', error.message);
      }

      // Initialize Phase 2 Factories
      try {
        logger.info('📧 Initializing Email Factory...');
        this.emailFactory = new EmailFactory({
          db: this.db,
          domainContext: process.env.CONTENT_DOMAIN || 'parenting and family wellness'
        });
        await this.emailFactory.initialize();
        logger.info('✅ Email Factory ready');
      } catch (error) {
        logger.warn('⚠️  Email Factory initialization failed, continuing:', error.message);
      }

      try {
        logger.info('🎯 Initializing Lead Factory...');
        this.leadFactory = new LeadFactory({
          db: this.db
        });
        await this.leadFactory.initialize();
        logger.info('✅ Lead Factory ready');
      } catch (error) {
        logger.warn('⚠️  Lead Factory initialization failed, continuing:', error.message);
      }

      // Initialize Phase 3 Factories
      try {
        logger.info('🧠 Initializing Knowledge Factory...');
        this.knowledgeFactory = new KnowledgeFactory({
          db: this.db
        });
        await this.knowledgeFactory.initialize();
        logger.info('✅ Knowledge Factory ready');
      } catch (error) {
        logger.warn('⚠️  Knowledge Factory initialization failed, continuing:', error.message);
      }

      try {
        logger.info('🌐 Initializing Site Factory...');
        this.siteFactory = new SiteFactory({
          db: this.db,
          llm: this.llm,
          imageGenerator: this.providers
        });
        await this.siteFactory.initialize();
        logger.info('✅ Site Factory ready');
      } catch (error) {
        logger.warn('⚠️  Site Factory initialization failed, continuing:', error.message);
      }

      try {
        logger.info('🎬 Initializing Video Factory...');
        this.videoFactory = new VideoFactory({
          db: this.db,
          llm: this.llm
        });
        await this.videoFactory.initialize();
        logger.info('✅ Video Factory ready');
      } catch (error) {
        logger.warn('⚠️  Video Factory initialization failed, continuing:', error.message);
      }

      try {
        logger.info('🛒 Initializing Commerce Factory...');
        this.commerceFactory = new CommerceFactory({
          db: this.db
        });
        await this.commerceFactory.initialize();
        logger.info('✅ Commerce Factory ready');
      } catch (error) {
        logger.warn('⚠️  Commerce Factory initialization failed, continuing:', error.message);
      }

      try {
        logger.info('🎨 Initializing Brand Factory...');
        this.brandFactory = new BrandFactory({
          db: this.db,
          imageGenerator: this.providers
        });
        await this.brandFactory.initialize();
        logger.info('✅ Brand Factory ready');
      } catch (error) {
        logger.warn('⚠️  Brand Factory initialization failed, continuing:', error.message);
      }

      // Initialize n8n Integration
      try {
        logger.info('🔗 Initializing n8n Integration...');
        this.n8nIntegration = new N8NIntegration();
        await this.n8nIntegration.initialize();
        logger.info('✅ n8n Integration ready');
      } catch (error) {
        logger.warn('⚠️  n8n Integration initialization failed, continuing:', error.message);
      }

      // Try to initialize Telegram bot (graceful failure)
      if (process.env.TELEGRAM_BOT_TOKEN) {
        try {
          logger.info('📱 Initializing Telegram bot...');
          const { Telegraf } = await import('telegraf');
          this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
          this.setupTelegramHandlers();

          // Register commands with Telegram so they show in UI
          try {
            await this.bot.telegram.setMyCommands([
              { command: 'start', description: 'Welcome & quick start' },
              { command: 'help', description: 'Show available commands' },
              { command: 'status', description: 'Check service status' }
            ]);
            logger.info('✅ Commands registered with Telegram');
          } catch (error) {
            logger.warn('⚠️  Could not register commands:', error.message);
          }

          logger.info('✅ Telegram bot ready');
        } catch (error) {
          logger.warn('⚠️  Telegram bot initialization failed:', error.message);
        }
      } else {
        logger.warn('⚠️  TELEGRAM_BOT_TOKEN not set, skipping bot initialization');
      }

      logger.info('🎉 HustleBot v2 initialized successfully!');
      return true;
    } catch (error) {
      logger.error('❌ Initialization failed:', error);
      throw error;
    }
  }

  setupMiddleware() {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'hustlebot-v2'
      });
    });

    // Status endpoint
    this.app.get('/api/status', (req, res) => {
      const providerStatus = this.providers ? this.providers.getProviderStatus() : null;
      const storageStatus = this.providers ? this.providers.getProviderStatus().storage.status : null;
      const contentStatus = this.contentFactory ? this.contentFactory.getStatus() : null;

      res.json({
        status: 'running',
        version: '2.0.0',
        database: this.db ? 'connected' : 'disconnected',
        llm: this.llm ? 'ready' : 'unavailable',
        telegram: this.bot ? 'connected' : 'disconnected',
        voice: this.voice ? 'ready' : 'unavailable',
        providers: providerStatus,
        storage: storageStatus,
        factories: {
          content: this.contentFactory ? 'ready' : 'unavailable',
          email: this.emailFactory ? 'ready' : 'unavailable',
          lead: this.leadFactory ? 'ready' : 'unavailable',
          knowledge: this.knowledgeFactory ? 'ready' : 'unavailable',
          site: this.siteFactory ? 'ready' : 'unavailable',
          video: this.videoFactory ? 'ready' : 'unavailable',
          commerce: this.commerceFactory ? 'ready' : 'unavailable',
          brand: this.brandFactory ? 'ready' : 'unavailable'
        },
        systems: {
          mailbox: this.mailbox ? 'ready' : 'unavailable',
          workflows: this.workflowRegistry ? 'ready' : 'unavailable'
        },
        bot_token_set: !!process.env.TELEGRAM_BOT_TOKEN,
        deepgram_key_set: !!process.env.DEEPGRAM_API_KEY,
        features: {
          text_chat: !!this.bot,
          ai_responses: !!this.llm,
          voice_messages: !!this.voice,
          image_generation: !!this.llm,
          streaming: !!this.providers,
          content_generation: !!this.contentFactory,
          email_automation: !!this.emailFactory,
          lead_generation: !!this.leadFactory,
          site_building: !!this.siteFactory,
          video_generation: !!this.videoFactory,
          ecommerce: !!this.commerceFactory,
          brand_management: !!this.brandFactory,
          agent_coordination: !!this.mailbox,
          workflow_automation: !!this.workflowRegistry
        },
        timestamp: new Date().toISOString()
      });
    });

    // Streaming LLM endpoint
    this.app.post('/api/stream', async (req, res) => {
      try {
        if (!this.providers) {
          return res.status(503).json({ error: 'Provider abstraction not initialized' });
        }

        const { prompt, provider, options } = req.body;

        if (!prompt) {
          return res.status(400).json({ error: 'prompt required' });
        }

        // Set streaming headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const selectedProvider = provider || this.providers.llmProvider;
        const streamOptions = { ...options, provider: selectedProvider };

        try {
          const streamGenerator = this.providers.getStreamingGenerator(prompt, streamOptions);

          // Stream chunks to client
          for await (const chunk of streamGenerator) {
            if (chunk.type === 'chunk') {
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            } else if (chunk.type === 'complete') {
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
              res.write('data: [DONE]\n\n');
            } else if (chunk.type === 'error') {
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            }
          }

          res.end();
        } catch (error) {
          logger.error(`Streaming error: ${error.message}`);
          res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
          res.end();
        }
      } catch (error) {
        logger.error(`Stream endpoint error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });


    // Content Factory endpoints
    this.app.post('/api/content/generate', async (req, res) => {
      try {
        if (!this.contentFactory) {
          return res.status(503).json({ error: 'Content Factory not initialized' });
        }

        const { topic, contentType = 'guide', options = {} } = req.body;

        if (!topic) {
          return res.status(400).json({ error: 'topic required' });
        }

        const result = await this.contentFactory.generateContent(topic, contentType, options);
        res.json(result);
      } catch (error) {
        logger.error(`Content generation error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/content/status', (req, res) => {
      if (!this.contentFactory) {
        return res.status(503).json({ error: 'Content Factory not initialized' });
      }

      res.json(this.contentFactory.getStatus());
    });

    this.app.get('/api/content/metrics', (req, res) => {
      if (!this.contentFactory) {
        return res.status(503).json({ error: 'Content Factory not initialized' });
      }

      res.json(this.contentFactory.getMetrics());
    });

    // Async content generation (job-based)
    this.app.post('/api/content/generate-async', (req, res) => {
      try {
        if (!this.contentFactory) {
          return res.status(503).json({ error: 'Content Factory not initialized' });
        }

        const { topic, contentType = 'guide', options = {} } = req.body;

        if (!topic) {
          return res.status(400).json({ error: 'topic required' });
        }

        const jobId = this.contentFactory.startContentGeneration(topic, contentType, options);
        res.json({
          jobId,
          status: 'queued',
          message: `Content generation job started. Check status at /api/content/job/${jobId}`
        });
      } catch (error) {
        logger.error(`Async content generation error: ${error.message}`);
        res.status(400).json({ error: error.message });
      }
    });

    // Check job status
    this.app.get('/api/content/job/:jobId', (req, res) => {
      try {
        if (!this.contentFactory) {
          return res.status(503).json({ error: 'Content Factory not initialized' });
        }

        const job = this.contentFactory.getJobStatus(req.params.jobId);

        if (!job) {
          return res.status(404).json({ error: 'Job not found' });
        }

        res.json(job);
      } catch (error) {
        logger.error(`Job status error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // Job queue stats
    this.app.get('/api/content/queue-stats', (req, res) => {
      try {
        if (!this.contentFactory) {
          return res.status(503).json({ error: 'Content Factory not initialized' });
        }

        res.json(this.contentFactory.jobQueue.getStats());
      } catch (error) {
        logger.error(`Queue stats error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // Email Factory endpoints
    this.app.post('/api/email/create-sequence', async (req, res) => {
      try {
        if (!this.emailFactory) {
          return res.status(503).json({ error: 'Email Factory not initialized' });
        }

        const { sequenceType = 'onboarding', context = {} } = req.body;
        const result = await this.emailFactory.createSequence(sequenceType, context);
        res.json(result);
      } catch (error) {
        logger.error(`Email sequence error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/email/generate', async (req, res) => {
      try {
        if (!this.emailFactory) {
          return res.status(503).json({ error: 'Email Factory not initialized' });
        }

        const { template = 'welcome', recipient = {}, context = {} } = req.body;
        const result = await this.emailFactory.generateEmail(template, recipient, context);
        res.json(result);
      } catch (error) {
        logger.error(`Email generation error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/email/send', async (req, res) => {
      try {
        if (!this.emailFactory) {
          return res.status(503).json({ error: 'Email Factory not initialized' });
        }

        const { email, options = {} } = req.body;
        const result = await this.emailFactory.sendEmail(email, options);
        res.json(result);
      } catch (error) {
        logger.error(`Email send error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/email/status', (req, res) => {
      if (!this.emailFactory) {
        return res.status(503).json({ error: 'Email Factory not initialized' });
      }
      res.json(this.emailFactory.getStatus());
    });

    // Lead Factory endpoints
    this.app.post('/api/leads/process', async (req, res) => {
      try {
        if (!this.leadFactory) {
          return res.status(503).json({ error: 'Lead Factory not initialized' });
        }

        const { source, criteria = {} } = req.body;
        const result = await this.leadFactory.processLeads(source, criteria);
        res.json(result);
      } catch (error) {
        logger.error(`Lead processing error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/leads/status', (req, res) => {
      if (!this.leadFactory) {
        return res.status(503).json({ error: 'Lead Factory not initialized' });
      }
      res.json(this.leadFactory.getStatus());
    });

    // Knowledge Factory endpoints
    this.app.post('/api/knowledge/add-memory', async (req, res) => {
      try {
        if (!this.knowledgeFactory) {
          return res.status(503).json({ error: 'Knowledge Factory not initialized' });
        }

        const { entityId, memory, metadata = {} } = req.body;
        const result = await this.knowledgeFactory.addMemory(entityId, memory, metadata);
        res.json(result);
      } catch (error) {
        logger.error(`Memory add error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/knowledge/search', async (req, res) => {
      try {
        if (!this.knowledgeFactory) {
          return res.status(503).json({ error: 'Knowledge Factory not initialized' });
        }

        const { query, entityId = null } = req.body;
        const result = await this.knowledgeFactory.searchKnowledge(query, entityId);
        res.json(result);
      } catch (error) {
        logger.error(`Knowledge search error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/knowledge/status', (req, res) => {
      if (!this.knowledgeFactory) {
        return res.status(503).json({ error: 'Knowledge Factory not initialized' });
      }
      res.json(this.knowledgeFactory.getStatus());
    });

    // Site Factory endpoints
    this.app.post('/api/sites/generate', async (req, res) => {
      try {
        if (!this.siteFactory) {
          return res.status(503).json({ error: 'Site Factory not initialized' });
        }

        const { topic, options = {} } = req.body;
        const result = await this.siteFactory.generateLandingPage(topic, options);
        res.json(result);
      } catch (error) {
        logger.error(`Site generation error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/sites/deploy', async (req, res) => {
      try {
        if (!this.siteFactory) {
          return res.status(503).json({ error: 'Site Factory not initialized' });
        }

        const { pageId } = req.body;
        const result = await this.siteFactory.deployPage(pageId);
        res.json(result);
      } catch (error) {
        logger.error(`Site deployment error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/sites/status', (req, res) => {
      if (!this.siteFactory) {
        return res.status(503).json({ error: 'Site Factory not initialized' });
      }
      res.json(this.siteFactory.getStatus());
    });

    // Video Factory endpoints
    this.app.post('/api/videos/generate-script', async (req, res) => {
      try {
        if (!this.videoFactory) {
          return res.status(503).json({ error: 'Video Factory not initialized' });
        }

        const { topic, options = {} } = req.body;
        const result = await this.videoFactory.generateScript(topic, options);
        res.json(result);
      } catch (error) {
        logger.error(`Video script generation error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/videos/create', async (req, res) => {
      try {
        if (!this.videoFactory) {
          return res.status(503).json({ error: 'Video Factory not initialized' });
        }

        const { scriptId } = req.body;
        const result = await this.videoFactory.createVideo(scriptId);
        res.json(result);
      } catch (error) {
        logger.error(`Video creation error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/videos/status', (req, res) => {
      if (!this.videoFactory) {
        return res.status(503).json({ error: 'Video Factory not initialized' });
      }
      res.json(this.videoFactory.getStatus());
    });

    // Commerce Factory endpoints
    this.app.post('/api/commerce/create-product', async (req, res) => {
      try {
        if (!this.commerceFactory) {
          return res.status(503).json({ error: 'Commerce Factory not initialized' });
        }

        const { productData = {} } = req.body;
        const result = await this.commerceFactory.createProduct(productData);
        res.json(result);
      } catch (error) {
        logger.error(`Product creation error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/commerce/process-order', async (req, res) => {
      try {
        if (!this.commerceFactory) {
          return res.status(503).json({ error: 'Commerce Factory not initialized' });
        }

        const { cartId, customerData = {} } = req.body;
        const result = await this.commerceFactory.processOrder(cartId, customerData);
        res.json(result);
      } catch (error) {
        logger.error(`Order processing error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/commerce/analytics', async (req, res) => {
      try {
        if (!this.commerceFactory) {
          return res.status(503).json({ error: 'Commerce Factory not initialized' });
        }

        const result = await this.commerceFactory.getRevenueAnalytics();
        res.json(result);
      } catch (error) {
        logger.error(`Analytics error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/commerce/status', (req, res) => {
      if (!this.commerceFactory) {
        return res.status(503).json({ error: 'Commerce Factory not initialized' });
      }
      res.json(this.commerceFactory.getStatus());
    });

    // Brand Factory endpoints
    this.app.post('/api/brand/create', async (req, res) => {
      try {
        if (!this.brandFactory) {
          return res.status(503).json({ error: 'Brand Factory not initialized' });
        }

        const { brandData = {} } = req.body;
        const result = await this.brandFactory.createBrand(brandData);
        res.json(result);
      } catch (error) {
        logger.error(`Brand creation error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/brand/generate-guidelines', async (req, res) => {
      try {
        if (!this.brandFactory) {
          return res.status(503).json({ error: 'Brand Factory not initialized' });
        }

        const { brandId } = req.body;
        const result = await this.brandFactory.generateBrandGuidelines(brandId);
        res.json(result);
      } catch (error) {
        logger.error(`Guidelines generation error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/brand/status', (req, res) => {
      if (!this.brandFactory) {
        return res.status(503).json({ error: 'Brand Factory not initialized' });
      }
      res.json(this.brandFactory.getStatus());
    });

    // Mailbox endpoints
    this.app.post('/api/mailbox/send', async (req, res) => {
      try {
        if (!this.mailbox) {
          return res.status(503).json({ error: 'Mailbox not initialized' });
        }

        const { to, message, options = {} } = req.body;
        const result = await this.mailbox.send(to, message, options);
        res.json(result);
      } catch (error) {
        logger.error(`Mailbox send error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/mailbox/receive/:queue', async (req, res) => {
      try {
        if (!this.mailbox) {
          return res.status(503).json({ error: 'Mailbox not initialized' });
        }

        const result = await this.mailbox.receive(req.params.queue, req.query.limit || 10);
        res.json(result);
      } catch (error) {
        logger.error(`Mailbox receive error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/mailbox/status', (req, res) => {
      if (!this.mailbox) {
        return res.status(503).json({ error: 'Mailbox not initialized' });
      }
      res.json(this.mailbox.getStats());
    });

    // Workflow Registry endpoints
    this.app.post('/api/workflows/register', async (req, res) => {
      try {
        if (!this.workflowRegistry) {
          return res.status(503).json({ error: 'Workflow Registry not initialized' });
        }

        const { workflowDef } = req.body;
        const result = await this.workflowRegistry.registerWorkflow(workflowDef);
        res.json(result);
      } catch (error) {
        logger.error(`Workflow registration error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/workflows/:workflowId/execute', async (req, res) => {
      try {
        if (!this.workflowRegistry) {
          return res.status(503).json({ error: 'Workflow Registry not initialized' });
        }

        const { inputs = {} } = req.body;
        const result = await this.workflowRegistry.executeWorkflow(req.params.workflowId, inputs);
        res.json(result);
      } catch (error) {
        logger.error(`Workflow execution error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/workflows', async (req, res) => {
      try {
        if (!this.workflowRegistry) {
          return res.status(503).json({ error: 'Workflow Registry not initialized' });
        }

        const result = await this.workflowRegistry.listWorkflows();
        res.json(result);
      } catch (error) {
        logger.error(`Workflow list error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/workflows/status', (req, res) => {
      if (!this.workflowRegistry) {
        return res.status(503).json({ error: 'Workflow Registry not initialized' });
      }
      res.json(this.workflowRegistry.getStats());
    });

    // n8n Integration endpoints
    this.app.post('/api/n8n/send-event', async (req, res) => {
      try {
        if (!this.n8nIntegration) {
          return res.status(503).json({ error: 'n8n Integration not initialized' });
        }

        const { eventType, data = {}, options = {} } = req.body;
        const result = await this.n8nIntegration.sendEvent(eventType, data, options);
        res.json(result);
      } catch (error) {
        logger.error(`n8n event error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/n8n/test', async (req, res) => {
      try {
        if (!this.n8nIntegration) {
          return res.status(503).json({ error: 'n8n Integration not initialized' });
        }

        const result = await this.n8nIntegration.testConnection();
        res.json(result);
      } catch (error) {
        logger.error(`n8n test error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/n8n/history', (req, res) => {
      if (!this.n8nIntegration) {
        return res.status(503).json({ error: 'n8n Integration not initialized' });
      }

      const limit = parseInt(req.query.limit || 50);
      res.json(this.n8nIntegration.getHistory(limit));
    });

    this.app.get('/api/n8n/status', (req, res) => {
      if (!this.n8nIntegration) {
        return res.status(503).json({ error: 'n8n Integration not initialized' });
      }
      res.json(this.n8nIntegration.getStatus());
    });

    // Debug endpoint
    this.app.get('/api/debug', (req, res) => {
      res.json({
        bot_initialized: !!this.bot,
        bot_token_exists: !!process.env.TELEGRAM_BOT_TOKEN,
        port: this.port,
        timestamp: new Date().toISOString()
      });
    });

    // Telegram webhook - always register the route
    this.app.post('/api/telegram/webhook', async (req, res) => {
      try {
        logger.info('📨 Webhook received:', JSON.stringify(req.body).substring(0, 200));

        if (!this.bot) {
          logger.warn('⚠️  Bot not initialized, cannot process update');
          return res.status(503).json({ ok: false, error: 'Bot not ready' });
        }

        await this.bot.handleUpdate(req.body);
        res.json({ ok: true });
      } catch (error) {
        logger.error('Webhook error:', error);
        res.status(500).json({ ok: false, error: error.message });
      }
    });

    // Default route
    this.app.get('/', (req, res) => {
      res.json({
        name: 'HustleBot v2',
        description: 'AI-powered business automation platform',
        status: 'running',
        endpoints: {
          health: '/health',
          status: '/api/status',
          streaming: 'POST /api/stream',
          content_factory: {
            generate_sync: 'POST /api/content/generate (blocking)',
            generate_async: 'POST /api/content/generate-async (returns jobId)',
            job_status: 'GET /api/content/job/:jobId',
            queue_stats: 'GET /api/content/queue-stats',
            factory_status: 'GET /api/content/status',
            metrics: 'GET /api/content/metrics'
          },
          email_factory: {
            create_sequence: 'POST /api/email/create-sequence',
            generate: 'POST /api/email/generate',
            send: 'POST /api/email/send',
            status: 'GET /api/email/status'
          },
          lead_factory: {
            process: 'POST /api/leads/process',
            status: 'GET /api/leads/status'
          },
          knowledge_factory: {
            add_memory: 'POST /api/knowledge/add-memory',
            search: 'POST /api/knowledge/search',
            status: 'GET /api/knowledge/status'
          },
          site_factory: {
            generate: 'POST /api/sites/generate',
            deploy: 'POST /api/sites/deploy',
            status: 'GET /api/sites/status'
          },
          video_factory: {
            generate_script: 'POST /api/videos/generate-script',
            create: 'POST /api/videos/create',
            status: 'GET /api/videos/status'
          },
          commerce_factory: {
            create_product: 'POST /api/commerce/create-product',
            process_order: 'POST /api/commerce/process-order',
            analytics: 'GET /api/commerce/analytics',
            status: 'GET /api/commerce/status'
          },
          brand_factory: {
            create: 'POST /api/brand/create',
            generate_guidelines: 'POST /api/brand/generate-guidelines',
            status: 'GET /api/brand/status'
          },
          mailbox: {
            send: 'POST /api/mailbox/send',
            receive: 'GET /api/mailbox/receive/:queue',
            status: 'GET /api/mailbox/status'
          },
          workflows: {
            register: 'POST /api/workflows/register',
            execute: 'POST /api/workflows/:workflowId/execute',
            list: 'GET /api/workflows',
            status: 'GET /api/workflows/status'
          },
          n8n_integration: {
            send_event: 'POST /api/n8n/send-event',
            test: 'GET /api/n8n/test',
            history: 'GET /api/n8n/history',
            status: 'GET /api/n8n/status'
          }
        }
      });
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not found',
        path: req.path
      });
    });

    // Error handler
    this.app.use((err, req, res, next) => {
      logger.error('Express error:', err);
      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    });
  }

  setupTelegramHandlers() {
    if (!this.bot) return;

    logger.info('📱 Setting up Telegram command handlers...');

    // Handle /start command
    this.bot.command('start', async (ctx) => {
      try {
        logger.info(`/start command from user ${ctx.from.id}`);
        await ctx.reply('👋 Welcome to HustleBot v2!\n\n📚 Send /help for available commands.');
      } catch (error) {
        logger.error('Error handling /start:', error);
      }
    });

    // Handle /help command
    this.bot.command('help', async (ctx) => {
      try {
        logger.info(`/help command from user ${ctx.from.id}`);
        const helpMessage = `
<b>🤖 HustleBot v2 Commands</b>

<b>Core Commands:</b>
/start - Welcome & quick start
/help - This message
/status - Check service status

<b>Features Coming Soon:</b>
• Landing page builder
• Lead generation
• Content creation
• Video production
• E-commerce automation

For more info, visit https://hustlebot.io
`;
        await ctx.reply(helpMessage, { parse_mode: 'HTML' });
      } catch (error) {
        logger.error('Error handling /help:', error);
      }
    });

    // Handle /status command
    this.bot.command('status', async (ctx) => {
      try {
        logger.info(`/status command from user ${ctx.from.id}`);
        await ctx.reply('✅ HustleBot v2 is running and ready!\n\nMore features coming soon...');
      } catch (error) {
        logger.error('Error handling /status:', error);
      }
    });

    // Handle text messages (must come after command handlers)
    this.bot.on('message', async (ctx) => {
      try {
        const userMessage = ctx.message.text || '';
        logger.info(`Message from user ${ctx.from.id}: ${userMessage}`);

        // Show "typing" indicator
        await ctx.sendChatAction('typing');

        // Try to get AI response
        if (this.llm) {
          try {
            const response = await this.llm.complete(userMessage, {
              taskType: 'general',
              maxTokens: 1000,
              temperature: 0.7
            });

            logger.info(`AI response for user ${ctx.from.id}: ${response.tokens.input} in, ${response.tokens.output} out, $${response.cost.toFixed(4)} cost`);
            await ctx.reply(response.content);
          } catch (error) {
            logger.error('LLM error:', error.message);
            await ctx.reply('⚠️ AI service temporarily unavailable. Please try again later.');
          }
        } else {
          logger.warn('LLM not initialized, using fallback response');
          await ctx.reply('Got your message! The AI service is loading. Please try again in a moment.');
        }
      } catch (error) {
        logger.error('Error handling message:', error);
        await ctx.reply('❌ Something went wrong. Please try again.');
      }
    });

    // Handle voice messages
    this.bot.on('voice', async (ctx) => {
      try {
        logger.info(`🎤 Voice message from user ${ctx.from.id}`);

        if (!this.voice) {
          logger.error('Voice service not initialized');
          await ctx.reply('⚠️ Voice service not available. Deepgram not configured.');
          return;
        }

        // Show "recording" indicator
        await ctx.sendChatAction('record_audio');

        try {
          // Download voice file
          logger.info('Downloading voice file...');
          const voiceFile = await ctx.telegram.getFile(ctx.message.voice.file_id);
          const audioUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${voiceFile.file_path}`;
          const audioResponse = await fetch(audioUrl);
          const audioBuffer = await audioResponse.buffer();
          logger.info(`Audio buffer size: ${audioBuffer.length} bytes`);

          // Convert voice to text
          logger.info('Converting speech to text...');
          const { text } = await this.voice.speechToText(audioBuffer, 'audio/ogg');
          logger.info(`✅ Transcribed: "${text}"`);

          // Show "typing" indicator
          await ctx.sendChatAction('typing');

          // For now, just echo back the transcription
          logger.info('Sending transcription back...');
          await ctx.reply(`🎤 You said: "${text}"\n\n(Full AI response coming soon...)`);

          // Try to get AI response (but don't fail if it doesn't work)
          try {
            if (this.llm) {
              logger.info('Getting AI response...');
              const response = await this.llm.complete(text, {
                taskType: 'general',
                maxTokens: 500
              });

              logger.info(`✅ AI response ready: ${response.tokens.output} tokens`);
              await ctx.reply(`🤖 AI: ${response.content}`);
            } else {
              logger.warn('LLM not available');
            }
          } catch (llmError) {
            logger.error('LLM error (non-fatal):', llmError.message);
            logger.info('Voice transcription worked though!');
          }
        } catch (stepError) {
          logger.error('Step error:', stepError.message, stepError.stack);
          await ctx.reply(`❌ Error: ${stepError.message}`);
        }
      } catch (error) {
        logger.error('Voice message error:', error.message, error.stack);
        await ctx.reply(`❌ Voice error: ${error.message}`);
      }
    });

    // Error handling
    this.bot.catch((err, ctx) => {
      logger.error('Telegram bot error:', err);
      if (ctx) {
        logger.error(`Error context: ${ctx.from?.id} - ${ctx.message?.text || 'voice/unknown'}`);
      }
    });

    logger.info('✅ Telegram handlers registered (text + voice)');
  }

  async start() {
    try {
      await this.initialize();

      this.server = this.app.listen(this.port, () => {
        logger.info(`🚀 Server listening on port ${this.port}`);
        logger.info(`📊 Health check: http://localhost:${this.port}/health`);
        logger.info(`🌐 Status: http://localhost:${this.port}/api/status`);
      });
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }
}

// Start server
const server = new HustleBotServer();
server.start();

export default server;
