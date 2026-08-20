/**
 * HUSTLEBOT v2 - Minimal Working Server
 *
 * A simplified, production-ready server that:
 * 1. Starts Express server
 * 2. Optionally connects to Supabase
 * 3. Optionally starts Telegram bot
 * 4. Gracefully handles failures
 */

console.log('[IMPORT] Starting module imports...');

import 'dotenv/config';
console.log('[IMPORT] dotenv loaded');

import express from 'express';
console.log('[IMPORT] express loaded');

import helmet from 'helmet';
console.log('[IMPORT] helmet loaded');

import cors from 'cors';
console.log('[IMPORT] cors loaded');

import logger from './utils/logger.js';
console.log('[IMPORT] logger loaded');

import { ProviderAbstraction } from './core/provider-abstraction.js';
console.log('[IMPORT] ProviderAbstraction loaded');

import { ContentFactory } from './factories/content-factory.js';
console.log('[IMPORT] ContentFactory loaded');
import { EmailFactory } from './factories/email-factory.js';
import { LeadFactory } from './factories/lead-factory.js';
import { KnowledgeFactory } from './factories/knowledge-factory.js';
import { SiteFactory } from './factories/site-factory.js';
import { VideoFactory } from './factories/video-factory.js';
import { CommerceFactory } from './factories/commerce-factory.js';
import { BrandFactory } from './factories/brand-factory.js';
import { Mailbox } from './core/mailbox.js';
import { WorkflowRegistry } from './core/workflow-registry.js';
import { CapabilityRegistry } from './core/capability-registry.js';
import { registerPlatformCapabilities } from './core/platform-capabilities.js';
import { Planner } from './core/planner.js';
import { JobQueue } from './factories/job-queue.js';
import { ApprovalGate } from './core/approval-gate.js';
import { mountMcpEndpoint } from './mcp/http-transport.js';
import { N8NIntegration } from './integrations/n8n-integration.js';
import { PaymentIntegration } from './integrations/payment-integration.js';
import { SocialIntegration } from './integrations/social-integration.js';
import { ImageIntegration } from './integrations/image-integration.js';
import { ShopifyIntegration } from './integrations/shopify-integration.js';
import { EmailIntegration } from './integrations/email-integration.js';
import { DeploymentIntegration } from './integrations/deployment-integration.js';
import { ScrapingIntegration } from './integrations/scraping-integration.js';
import { EnrichmentIntegration } from './integrations/enrichment-integration.js';
import { RetellIntegration } from './integrations/retell-integration.js';
import { SchedulingEngine } from './features/scheduling-engine.js';
import { AnalyticsEngine } from './features/analytics-engine.js';
import { CostOptimizer } from './features/cost-optimizer.js';
import { MemorySystem } from './features/memory-system.js';
import { VoiceWorkflowBuilderAgent } from './agents/voice-workflow-builder-agent.js';
import { TranscriptProcessor } from './core/transcript-processor.js';
import { VoiceWorkflowRefinerAgent } from './agents/voice-workflow-refiner-agent.js';
import { WorkflowRefinementManager } from './core/workflow-refinement-manager.js';
import { VoiceConversationAgent } from './agents/voice-conversation-agent.js';
import { ConversationManager } from './core/conversation-manager.js';
import { TelegramCommandCenter } from './telegram/command-center.js';
import { RedisMailbox } from './core/mailbox-redis.js';
import { IntentDetector } from './core/intent-detector.js';
import { ActionBridge } from './core/action-bridge.js';
import { collectDay1Health, formatDay1StatusText, isStatusRequest } from './core/health-status.js';
import { requireActionAuth, rateLimitActions } from './core/action-auth.js';
import { FirecrawlProvider } from './providers/firecrawl.js';
import { CustomSpider } from './providers/spider.js';
import { WebSearchProvider } from './providers/web-search.js';
import { AcquisitionEngine } from './acquisition/engine.js';
import { AcquisitionStore } from './acquisition/store.js';
import { ProspectEnricher } from './acquisition/enrich.js';
import { registerAcquisitionCapabilities } from './acquisition/register.js';
import { BrowserRenderProvider } from './providers/browser.js';
import { ApolloProvider } from './providers/apollo.js';
import { IntelligenceEngine, handleCampaignControlHttp } from './intelligence/engine.js';
import { CompanyResearcher } from './intelligence/research.js';
import { ContactDiscovery } from './intelligence/contacts.js';
import { EnrichmentRouter } from './intelligence/enrichment.js';
import { registerIntelligenceCapabilities } from './intelligence/register.js';
import { OutreachExecutor } from './outreach/execute.js';
import { OutreachEventLog } from './outreach/events.js';
import { OutreachEmailProvider } from './outreach/email.js';
import { SuppressionStore } from './outreach/suppression.js';
import { CampaignOrchestrator } from './outreach/orchestrate.js';
import { EmailValidator, PhoneValidator } from './intelligence/validation.js';
import { MacGyverEngine } from './objective/engine.js';
import { OrgDiscovery } from './objective/discover.js';
import { registerObjectiveCapabilities } from './objective/register.js';
import { matchObjectiveControl, matchObjectiveRun } from './objective/control.js';
import { ToolFabric, registerFabricCapabilities } from './fabric/index.js';
import { LlmRouter } from './llm/router.js';
import { DurableRuntime } from './runtime/runtime.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HUSTLEBOT_DATA_DIR = process.env.HUSTLEBOT_DATA_DIR || join(dirname(fileURLToPath(import.meta.url)), '.data');

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
    // Phase 4 Integrations
    this.paymentIntegration = null;
    this.socialIntegration = null;
    this.imageIntegration = null;
    this.shopifyIntegration = null;
    this.emailIntegration = null;
    this.deploymentIntegration = null;
    this.scrapingIntegration = null;
    this.enrichmentIntegration = null;
    this.retellIntegration = null;
    // Phase 5 Features
    this.schedulingEngine = null;
    this.analyticsEngine = null;
    this.capabilityRegistry = null;
    this.planner = null;
    this.jobQueue = null;
    this.approvalGate = null;
    this.toolFabric = null;
    this.llmRouter = null;
    this.commandCenter = null;
    this.costOptimizer = null;
    this.memorySystem = null;
    // Phase 6 Features
    this.voiceWorkflowBuilder = null;
    this.transcriptProcessor = null;
    // Phase 7 Features
    this.voiceWorkflowRefiner = null;
    this.refinementManager = null;
    // Phase 8 Features
    this.voiceConversationAgent = null;
    this.conversationManager = null;
    // Action routing (Intent → Capability execution)
    this.intentDetector = null;
    this.actionBridge = null;
    this.day1Actions = [];
    this.firecrawlProvider = null;
    this.spiderProvider = null;
    this.webSearchProvider = null;
    this.acquisitionStore = null;
    this.prospectEnricher = null;
    this.acquisitionEngine = null;
    this.actionAuth = null;
    this.actionRateLimit = null;
    this.browserProvider = null;
    this.apolloProvider = null;
    this.companyResearcher = null;
    this.contactDiscovery = null;
    this.enrichmentRouter = null;
    this.intelligenceEngine = null;
    this.outreachExecutor = null;
    this.outreachEvents = null;
    this.orgDiscovery = null;
    this.macgyverEngine = null;
    this.durableRuntime = null;
    // Diagnostics
    this.initializationErrors = [];
  }

  createApp() {
    logger.info('🌐 Setting up Express server...');
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    logger.info('✅ Express server ready');
    return this.app;
  }

  async initialize() {
    logger.info('🚀 Initializing HustleBot v2...');

    try {
      // Express app should already be created
      if (!this.app) {
        this.createApp();
      }

      // Try to initialize Supabase (graceful failure)
      try {
        logger.info('📦 Connecting to Supabase...');
        const { initSupabase } = await import('./db/supabase.js');
        const db = await initSupabase();
        logger.info('✅ Supabase connected');
        this.db = db;
      } catch (error) {
        logger.warn('⚠️  Supabase connection failed, continuing without DB:', error.message);
        this.initializationErrors.push({ module: 'supabase', error: error.message });
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
        this.initializationErrors.push({ module: 'openrouter', error: error.message });
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
        this.initializationErrors.push({ module: 'providers', error: error.message });
      }

      // Initialize Mailbox and Workflow Registry (core systems)
      try {
        logger.info('📬 Initializing Mailbox system...');
        // Use Redis mailbox if available, otherwise use database mailbox
        if (process.env.REDIS_URL) {
          logger.info('📬 Using Redis-based bidirectional mailbox');
          this.mailbox = new RedisMailbox(process.env.REDIS_URL);
        } else {
          logger.info('📬 Using database mailbox (single-direction)');
          this.mailbox = new Mailbox({ db: this.db });
        }
        // Add 5-second timeout to mailbox init so we don't block server startup
        logger.info('📬 Connecting to mailbox (5s timeout)...');
        await Promise.race([
          this.mailbox.initialize(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Mailbox init timeout - continuing without mailbox')), 5000)
          )
        ]);
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
          callTimeout: parseInt(process.env.CONTENT_CALL_TIMEOUT || '30000'),
          // Reuse the mailbox's Redis connection so queued jobs survive a
          // restart. Without it the queue falls back to in-memory storage.
          redis: this.mailbox?.redis || null
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

      // Initialize Phase 4 Integrations
      try {
        logger.info('💳 Initializing Payment Integration...');
        this.paymentIntegration = new PaymentIntegration();
        await this.paymentIntegration.initialize();
        logger.info('✅ Payment Integration ready');
      } catch (error) {
        logger.warn('⚠️  Payment Integration initialization failed, continuing:', error.message);
      }

      try {
        logger.info('📱 Initializing Social Integration...');
        this.socialIntegration = new SocialIntegration();
        await this.socialIntegration.initialize();
        logger.info('✅ Social Integration ready');
      } catch (error) {
        logger.warn('⚠️  Social Integration initialization failed, continuing:', error.message);
      }

      try {
        logger.info('🖼️  Initializing Image Integration...');
        this.imageIntegration = new ImageIntegration();
        await this.imageIntegration.initialize();
        logger.info('✅ Image Integration ready');
      } catch (error) {
        logger.warn('⚠️  Image Integration initialization failed, continuing:', error.message);
      }

      try {
        logger.info('🛍️  Initializing Shopify Integration...');
        this.shopifyIntegration = new ShopifyIntegration();
        await this.shopifyIntegration.initialize();
        logger.info('✅ Shopify Integration ready');
      } catch (error) {
        logger.warn('⚠️  Shopify Integration initialization failed, continuing:', error.message);
      }

      try {
        logger.info('📧 Initializing Email Integration...');
        this.emailIntegration = new EmailIntegration();
        await this.emailIntegration.initialize();
        logger.info('✅ Email Integration ready');
      } catch (error) {
        logger.warn('⚠️  Email Integration initialization failed, continuing:', error.message);
      }

      try {
        logger.info('🚀 Initializing Deployment Integration...');
        this.deploymentIntegration = new DeploymentIntegration();
        await this.deploymentIntegration.initialize();
        logger.info('✅ Deployment Integration ready');
      } catch (error) {
        logger.warn('⚠️  Deployment Integration initialization failed, continuing:', error.message);
      }

      try {
        logger.info('🕷️  Initializing acquisition providers...');
        this.firecrawlProvider = new FirecrawlProvider();
        this.spiderProvider = new CustomSpider();
        this.webSearchProvider = new WebSearchProvider();
        this.acquisitionStore = new AcquisitionStore();
        this.prospectEnricher = new ProspectEnricher({ scraper: this.spiderProvider });
        this.scrapingIntegration = new ScrapingIntegration({ provider: this.firecrawlProvider });
        await this.scrapingIntegration.initialize();
        this.enrichmentIntegration = new EnrichmentIntegration({ publicEnricher: this.prospectEnricher });
        await this.enrichmentIntegration.initialize();
        this.acquisitionEngine = new AcquisitionEngine({
          firecrawl: this.firecrawlProvider,
          spider: this.spiderProvider,
          search: this.webSearchProvider,
          store: this.acquisitionStore,
          enricher: this.prospectEnricher,
          n8n: this.n8nIntegration
        });
        logger.info('✅ Acquisition providers ready');
      } catch (error) {
        logger.warn('⚠️  Acquisition initialization failed, continuing:', error.message);
        this.initializationErrors.push({ module: 'acquisition', error: error.message });
      }

      try {
        logger.info('📞 Initializing Retell Integration...');
        this.retellIntegration = new RetellIntegration();
        await this.retellIntegration.initialize();
        logger.info('✅ Retell Integration ready');
      } catch (error) {
        logger.warn('⚠️  Retell Integration initialization failed, continuing:', error.message);
      }

      // Initialize Phase 6 Features (Voice Workflow Builder)
      try {
        logger.info('🎙️  Initializing Voice Workflow Builder Agent...');
        this.voiceWorkflowBuilder = new VoiceWorkflowBuilderAgent(
          { retell: this.retellIntegration },
          this.workflowRegistry
        );
        await this.voiceWorkflowBuilder.initialize(this.llm, this.providers);
        logger.info('✅ Voice Workflow Builder ready');
      } catch (error) {
        logger.warn('⚠️  Voice Workflow Builder initialization failed, continuing:', error.message);
      }

      try {
        logger.info('📝 Initializing Transcript Processor...');
        this.transcriptProcessor = new TranscriptProcessor();
        logger.info('✅ Transcript Processor ready');
      } catch (error) {
        logger.warn('⚠️  Transcript Processor initialization failed, continuing:', error.message);
      }

      // Initialize Phase 7 Features (Voice Workflow Refinement)
      try {
        logger.info('🔧 Initializing Voice Workflow Refiner Agent...');
        this.voiceWorkflowRefiner = new VoiceWorkflowRefinerAgent(
          this.workflowRegistry,
          null
        );
        await this.voiceWorkflowRefiner.initialize(this.llm, this.providers);
        logger.info('✅ Voice Workflow Refiner ready');
      } catch (error) {
        logger.warn('⚠️  Voice Workflow Refiner initialization failed, continuing:', error.message);
      }

      try {
        logger.info('📋 Initializing Workflow Refinement Manager...');
        this.refinementManager = new WorkflowRefinementManager(this.workflowRegistry);
        logger.info('✅ Workflow Refinement Manager ready');
      } catch (error) {
        logger.warn('⚠️  Workflow Refinement Manager initialization failed, continuing:', error.message);
      }

      // Initialize Phase 8 Features (Voice Conversation Agent)
      try {
        logger.info('💬 Initializing Conversation Manager...');
        this.conversationManager = new ConversationManager(this.workflowRegistry);
        logger.info('✅ Conversation Manager ready');
      } catch (error) {
        logger.warn('⚠️  Conversation Manager initialization failed, continuing:', error.message);
      }

      try {
        logger.info('🗣️  Initializing Voice Conversation Agent...');
        this.voiceConversationAgent = new VoiceConversationAgent(this.voiceWorkflowRefiner);
        await this.voiceConversationAgent.initialize(this.llm, this.providers);
        logger.info('✅ Voice Conversation Agent ready');
      } catch (error) {
        logger.warn('⚠️  Voice Conversation Agent initialization failed, continuing:', error.message);
      }

      // Initialize Phase 5 Features
      try {
        logger.info('⏰ Initializing Scheduling Engine...');
        this.schedulingEngine = new SchedulingEngine();
        await this.schedulingEngine.initialize();
        logger.info('✅ Scheduling Engine ready');
      } catch (error) {
        logger.warn('⚠️  Scheduling Engine initialization failed, continuing:', error.message);
      }

      try {
        logger.info('📊 Initializing Analytics Engine...');
        this.analyticsEngine = new AnalyticsEngine();
        await this.analyticsEngine.initialize();
        logger.info('✅ Analytics Engine ready');
      } catch (error) {
        logger.warn('⚠️  Analytics Engine initialization failed, continuing:', error.message);
      }

      try {
        logger.info('💰 Initializing Cost Optimizer...');
        this.costOptimizer = new CostOptimizer();
        await this.costOptimizer.initialize();
        logger.info('✅ Cost Optimizer ready');
      } catch (error) {
        logger.warn('⚠️  Cost Optimizer initialization failed, continuing:', error.message);
      }

      try {
        logger.info('🧠 Initializing Memory System...');
        this.memorySystem = new MemorySystem();
        await this.memorySystem.initialize();
        logger.info('✅ Memory System ready');
      } catch (error) {
        logger.warn('⚠️  Memory System initialization failed, continuing:', error.message);
      }

      // Capability registry after the services it binds, but before Telegram,
      // which it does not depend on.
      try {
        logger.info('🔧 Initializing Capability Registry...');
        this.capabilityRegistry = new CapabilityRegistry({
          onInvocation: (record) => {
            // Seam the audit log will also hang off. For now capability spend
            // is attributed to the cost optimizer, tagged with the job and
            // project so it can be joined back later.
            if (record.success && record.cost > 0 && this.costOptimizer) {
              this.costOptimizer
                .logTransaction(`capability:${record.capabilityId}`, record.cost, {
                  provider: record.provider,
                  jobId: record.jobId,
                  projectId: record.projectId,
                  actor: record.actor,
                  latencyMs: record.latencyMs
                })
                .catch((error) =>
                  logger.error(`Failed to log capability spend: ${error.message}`)
                );
            }
          }
        });
        registerPlatformCapabilities(this.capabilityRegistry, this);
        registerAcquisitionCapabilities(this.capabilityRegistry, {
          firecrawlProvider: this.firecrawlProvider,
          spiderProvider: this.spiderProvider,
          webSearchProvider: this.webSearchProvider,
          acquisitionEngine: this.acquisitionEngine,
          acquisitionStore: this.acquisitionStore,
          prospectEnricher: this.prospectEnricher
        });
        logger.info('✅ Capability Registry ready');
      } catch (error) {
        logger.warn('⚠️  Capability Registry initialization failed, continuing:', error.message);
      }

      // Human approval layer, before the planner that depends on it.
      try {
        logger.info('🔐 Initializing Approval Gate...');
        this.approvalGate = new ApprovalGate({
          registry: this.capabilityRegistry,
          redis: this.mailbox?.redis || null,
          dataDir: HUSTLEBOT_DATA_DIR,
          spendThreshold: parseFloat(process.env.APPROVAL_SPEND_THRESHOLD || '5'),
          campaignThreshold: parseInt(process.env.APPROVAL_CAMPAIGN_THRESHOLD || '100'),
          ttlMs: parseInt(process.env.APPROVAL_TTL_MS || String(24 * 60 * 60 * 1000)),
          // Only ever true deliberately, for a non-production environment.
          autoApprove: process.env.APPROVAL_AUTO_APPROVE === 'true',
          onRequest: async (record) => {
            if (this.commandCenter?.notifyApprovalRequest) {
              await this.commandCenter.notifyApprovalRequest(record);
            }
          },
          onDecision: (record) => {
            logger.info(
              `📝 AUDIT approval ${record.id} ${record.status} by ${record.decidedBy} ` +
              `for ${record.capabilityId}${record.graphId ? ` (plan ${record.graphId})` : ''}`
            );
            const campaignId = record.input?.campaignId;
            if (campaignId && this.intelligenceEngine?.getCampaign) {
              const campaign = this.intelligenceEngine.getCampaign(campaignId);
              if (campaign) {
                this.intelligenceEngine.persistCampaign({
                  ...campaign,
                  approval: { ...(campaign.approval || {}), id: record.id, status: record.status }
                });
                this.intelligenceEngine.refreshApproval?.(this.intelligenceEngine.getCampaign(campaignId));
              }
            }
          }
        });
        await this.approvalGate.initialize();
        logger.info('✅ Approval Gate ready');
      } catch (error) {
        logger.warn('⚠️  Approval Gate initialization failed, continuing:', error.message);
      }

      try {
        logger.info('🧠 Initializing Day-4 contact intelligence + outreach...');
        this.browserProvider = new BrowserRenderProvider({ firecrawl: this.firecrawlProvider });
        this.apolloProvider = new ApolloProvider();
        this.companyResearcher = new CompanyResearcher({ scraper: this.spiderProvider });
        this.contactDiscovery = new ContactDiscovery({
          scraper: this.spiderProvider,
          apollo: this.apolloProvider
        });
        this.enrichmentRouter = new EnrichmentRouter({
          publicWeb: this.prospectEnricher,
          apollo: this.apolloProvider,
          order: String(process.env.ENRICHMENT_PROVIDER_ORDER || 'PUBLIC_WEB,APOLLO')
            .split(',')
            .map((name) => name.trim())
            .filter(Boolean)
        });
        this.outreachEvents = new OutreachEventLog();
        this.suppressionStore = new SuppressionStore();
        this.outreachEmail = new OutreachEmailProvider();
        await this.outreachEmail.resolveSender().catch((error) => {
          logger.warn(`Brevo sender resolve failed: ${error.message}`);
        });
        this.emailValidator = new EmailValidator();
        this.phoneValidator = new PhoneValidator();
        this.outreachExecutor = new OutreachExecutor({
          approvalGate: this.approvalGate,
          retell: this.retellIntegration,
          email: this.outreachEmail,
          events: this.outreachEvents,
          suppression: this.suppressionStore
        });
        this.intelligenceEngine = new IntelligenceEngine({
          browser: this.browserProvider,
          firecrawl: this.firecrawlProvider,
          spider: this.spiderProvider,
          acquisition: this.acquisitionEngine,
          researcher: this.companyResearcher,
          contacts: this.contactDiscovery,
          enricher: this.enrichmentRouter,
          apollo: this.apolloProvider,
          store: this.acquisitionStore,
          events: this.outreachEvents,
          approvalGate: this.approvalGate,
          n8n: this.n8nIntegration,
          suppression: this.suppressionStore
        });
        this.outreachExecutor.engine = this.intelligenceEngine;
        this.outreachExecutor.n8n = this.n8nIntegration;
        this.campaignOrchestrator = new CampaignOrchestrator({
          engine: this.intelligenceEngine,
          executor: this.outreachExecutor,
          suppression: this.suppressionStore,
          n8n: this.n8nIntegration,
          events: this.outreachEvents
        });
        if (this.capabilityRegistry) {
          registerIntelligenceCapabilities(this.capabilityRegistry, {
            browserProvider: this.browserProvider,
            companyResearcher: this.companyResearcher,
            contactDiscovery: this.contactDiscovery,
            intelligenceEngine: this.intelligenceEngine,
            outreachExecutor: this.outreachExecutor,
            apolloProvider: this.apolloProvider,
            enrichmentRouter: this.enrichmentRouter,
            emailValidator: this.emailValidator,
            phoneValidator: this.phoneValidator,
            emailProvider: this.outreachEmail,
            campaignOrchestrator: this.campaignOrchestrator
          });
        }
        logger.info(
          `✅ Day-4 intelligence ready (apollo=${this.apolloProvider.isAvailable() ? 'configured' : 'UNAVAILABLE'}, email=${this.outreachEmail.isAvailable() ? 'configured' : 'UNAVAILABLE'})`
        );
        this.orgDiscovery = new OrgDiscovery({
          browser: this.browserProvider,
          search: this.webSearchProvider,
          spider: this.spiderProvider,
          acquisition: this.acquisitionEngine
        });
        this.macgyverEngine = new MacGyverEngine({
          registry: this.capabilityRegistry,
          approvalGate: this.approvalGate,
          n8n: this.n8nIntegration,
          email: this.outreachEmail
        });
        if (this.capabilityRegistry) {
          registerObjectiveCapabilities(this.capabilityRegistry, {
            orgDiscovery: this.orgDiscovery,
            companyResearcher: this.companyResearcher,
            contactDiscovery: this.contactDiscovery,
            macgyverEngine: this.macgyverEngine
          });
        }
        try {
          this.llmRouter = new LlmRouter({ client: this.llm });
          this.toolFabric = new ToolFabric({
            registry: this.capabilityRegistry,
            n8n: this.n8nIntegration
          });
          await this.toolFabric.boot();
          registerFabricCapabilities(this.capabilityRegistry, this.toolFabric);
          this.macgyverEngine.router = this.llmRouter;
          this.macgyverEngine.fabric = this.toolFabric;
          logger.info(
            `✅ Day-5 MacGyver + Day-6 fabric/router ready (visible=${this.toolFabric.stats().visible}, quarantined=${this.toolFabric.stats().quarantined})`
          );
        } catch (error) {
          logger.warn('⚠️  Day-6 fabric/router failed, MacGyver continues:', error.message);
          this.initializationErrors.push({ module: 'tool-fabric', error: error.message });
          logger.info('✅ Day-5 MacGyver objective engine ready');
        }
      } catch (error) {
        logger.warn('⚠️  Intelligence initialization failed, continuing:', error.message);
        this.initializationErrors.push({ module: 'intelligence', error: error.message });
      }

      // Planning swarm: objective in, execution graph out, run durably.
      try {
        logger.info('🧠 Initializing Planner...');

        // Platform-level durable queue, separate from the content factory's.
        this.jobQueue = new JobQueue({
          redis: this.mailbox?.redis || null,
          dataDir: HUSTLEBOT_DATA_DIR,
          namespace: 'jobs:platform',
          maxConcurrent: parseInt(process.env.MAX_CONCURRENT_PLANS || '2'),
          jobTimeout: parseInt(process.env.PLAN_TIMEOUT_MS || '600000')
        });

        this.planner = new Planner({
          registry: this.capabilityRegistry,
          llm: this.llm,
          jobQueue: this.jobQueue,
          approvalGate: this.approvalGate
        });

        // Registered before start() so a graph recovered from a restart has
        // a handler waiting for it.
        this.jobQueue.registerHandler('plan.execute', this.planner.planExecutionHandler());
        await this.jobQueue.start();

        try {
          this.durableRuntime = new DurableRuntime({
            dataDir: HUSTLEBOT_DATA_DIR,
            jobQueue: this.jobQueue,
            engine: this.macgyverEngine,
            approvalGate: this.approvalGate,
            n8n: this.n8nIntegration,
            redis: this.mailbox?.redis || null,
            telegram: this.bot
          });
          await this.durableRuntime.start();
          logger.info('✅ Day-8 durable runtime ready');
        } catch (error) {
          logger.warn('⚠️  Day-8 durable runtime failed, continuing:', error.message);
          this.initializationErrors.push({ module: 'durable-runtime', error: error.message });
        }

        logger.info('✅ Planner ready');
      } catch (error) {
        logger.warn('⚠️  Planner initialization failed, continuing:', error.message);
      }

      // Initialize Intent Detector and Action Bridge for Telegram action routing
      try {
        logger.info('🔗 Initializing action routing (Intent Detector + Action Bridge)...');
        this.intentDetector = new IntentDetector({
          llm: this.llm,
          registry: this.capabilityRegistry,
          fabric: this.toolFabric,
          router: this.llmRouter
        });
        this.actionBridge = new ActionBridge({
          capabilityRegistry: this.capabilityRegistry
        });
        logger.info('✅ Action routing ready');
      } catch (error) {
        logger.warn('⚠️  Action routing initialization failed, continuing:', error.message);
        this.intentDetector = null;
        this.actionBridge = null;
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
              { command: 'status', description: 'Check service status' },
              { command: 'menu', description: 'Command center' },
              { command: 'generate', description: 'Generate content' },
              { command: 'leads', description: 'Lead management' },
              { command: 'workflows', description: 'Workflow automation' },
              { command: 'analytics', description: 'View analytics' },
              { command: 'system', description: 'System status' },
              { command: 'approvals', description: 'Review pending approvals' },
              { command: 'agents', description: 'Check AI agent status' },
              { command: 'deepseek', description: 'Ask DeepSeek AI' },
              { command: 'kimi', description: 'Ask Kimi AI' },
              { command: 'chatgpt', description: 'Ask ChatGPT' },
              { command: 'grok', description: 'Ask Grok AI' }
            ]);
            logger.info('✅ Commands registered with Telegram');
          } catch (error) {
            logger.warn('⚠️  Could not register commands:', error.message);
          }

          // Launch the bot (start polling).
          //
          // Deliberately not awaited: Telegraf's launch() promise does not
          // settle until the bot STOPS, so awaiting it parks the rest of
          // initialize() until shutdown. That is why startup hit the 30s
          // timeout on every boot and anything registered after this point
          // never ran during normal operation.
          this.bot
            .launch()
            .then(() => logger.info('📱 Telegram bot polling stopped'))
            .catch((error) => logger.warn('⚠️  Telegram polling error:', error.message));
          logger.info('✅ Telegram bot launched and polling');
        } catch (error) {
          logger.warn('⚠️  Telegram bot initialization failed:', error.message);
        }
      } else {
        logger.warn('⚠️  TELEGRAM_BOT_TOKEN not set, skipping bot initialization');
      }

      logger.info('🎉 HustleBot v2 initialized successfully!');
      logger.info('[INIT] ✅ initialize() method returning true - initialization complete');
      return true;
    } catch (error) {
      logger.error('❌ Initialization failed:', error);
      this.initializationErrors.push({ module: 'core', error: error.message, stack: error.stack });
      throw error;
    }
  }

  setupMiddleware() {
    this.app.use(helmet());
    this.app.use(cors());

    // The MCP transport reads the raw request stream itself, so the JSON
    // parser must not consume it first - doing so hangs every MCP call.
    const jsonParser = express.json();
    this.app.use((req, res, next) => {
      if (req.path.startsWith('/mcp/')) return next();
      return jsonParser(req, res, next);
    });

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
      const runtime = this.durableRuntime?.health?.() || { state: 'UNAVAILABLE', detail: 'not initialized' };
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'hustlebot-v2',
        revision: process.env.RENDER_GIT_COMMIT || null,
        api: 'HEALTHY',
        durableRuntime: runtime.state,
        runtime
      });
    });

    // Diagnostics endpoint
    this.app.get('/api/diagnostics', (req, res) => {
      const diag = {
        timestamp: new Date().toISOString(),
        environment: {
          node_env: process.env.NODE_ENV,
          vercel: !!process.env.VERCEL,
          port: this.port
        },
        initialization: {
          app: !!this.app,
          providers: !!this.providers,
          db: !!this.db,
          llm: !!this.llm,
          voice: !!this.voice,
          bot: !!this.bot
        },
        factories: {
          content: !!this.contentFactory,
          email: !!this.emailFactory,
          lead: !!this.leadFactory,
          knowledge: !!this.knowledgeFactory,
          site: !!this.siteFactory,
          video: !!this.videoFactory,
          commerce: !!this.commerceFactory,
          brand: !!this.brandFactory
        },
        systems: {
          mailbox: !!this.mailbox,
          workflows: !!this.workflowRegistry,
          n8n: !!this.n8nIntegration
        },
        integrations: {
          payment: !!this.paymentIntegration,
          social: !!this.socialIntegration,
          image: !!this.imageIntegration,
          shopify: !!this.shopifyIntegration,
          email: !!this.emailIntegration,
          deployment: !!this.deploymentIntegration,
          scraping: !!this.scrapingIntegration,
          enrichment: !!this.enrichmentIntegration
        },
        features: {
          scheduling: !!this.schedulingEngine,
          analytics: !!this.analyticsEngine,
          cost_optimization: !!this.costOptimizer,
          memory: !!this.memorySystem
        },
        phase8: {
          voice_conversation_agent: !!this.voiceConversationAgent,
          conversation_manager: !!this.conversationManager
        },
        phase7: {
          voice_workflow_refiner: !!this.voiceWorkflowRefiner,
          refinement_manager: !!this.refinementManager
        },
        phase6: {
          voice_workflow_builder: !!this.voiceWorkflowBuilder,
          transcript_processor: !!this.transcriptProcessor
        },
        initialization_errors: this.initializationErrors || []
      };
      res.json(diag);
    });

    // Status endpoint
    this.app.get('/api/status', async (req, res) => {
      const providerStatus = this.providers ? this.providers.getProviderStatus() : null;
      const storageStatus = this.providers ? this.providers.getProviderStatus().storage.status : null;
      const contentStatus = this.contentFactory ? this.contentFactory.getStatus() : null;
      const day1 = await collectDay1Health(this).catch((error) => ({
        error: error.message
      }));

      res.json({
        status: 'running',
        version: '2.0.0',
        revision: process.env.RENDER_GIT_COMMIT || null,
        branch: process.env.RENDER_GIT_BRANCH || null,
        day1,
        day1Actions: this.day1Actions.slice(0, 10),
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
          workflows: this.workflowRegistry ? 'ready' : 'unavailable',
          n8n: this.n8nIntegration ? 'ready' : 'unavailable'
        },
        integrations: {
          payment: this.paymentIntegration ? 'ready' : 'unavailable',
          social: this.socialIntegration ? 'ready' : 'unavailable',
          image: this.imageIntegration ? 'ready' : 'unavailable',
          shopify: this.shopifyIntegration ? 'ready' : 'unavailable',
          email: this.emailIntegration ? 'ready' : 'unavailable',
          deployment: this.deploymentIntegration ? 'ready' : 'unavailable',
          scraping: this.scrapingIntegration ? 'ready' : 'unavailable',
          enrichment: this.enrichmentIntegration ? 'ready' : 'unavailable'
        },
        features: {
          scheduling: this.schedulingEngine ? 'ready' : 'unavailable',
          analytics: this.analyticsEngine ? 'ready' : 'unavailable',
          cost_optimization: this.costOptimizer ? 'ready' : 'unavailable',
          memory: this.memorySystem ? 'ready' : 'unavailable'
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

    // ---- Remote MCP endpoint -----------------------------------------------
    // Exposes the same tools as `npm run mcp`, but reachable over the public
    // URL so Claude/ChatGPT connectors can use them. No token, no mount.
    this.mcpEndpoint = mountMcpEndpoint(this.app, this);

    // ---- Human approval layer ----------------------------------------------

    this.app.get('/api/approvals', async (req, res) => {
      try {
        if (!this.approvalGate) return res.status(503).json({ error: 'Approval layer not initialized' });
        const { status, graphId } = req.query;
        const approvals = status || graphId
          ? await this.approvalGate.list({ status, graphId })
          : await this.approvalGate.listPending();
        res.json({ stats: await this.approvalGate.getStats(), approvals });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/approvals/:id', async (req, res) => {
      try {
        if (!this.approvalGate) return res.status(503).json({ error: 'Approval layer not initialized' });
        const record = await this.approvalGate.get(req.params.id);
        if (!record) return res.status(404).json({ error: 'Unknown approval request' });
        res.json(record);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // approve / reject / modify. `by` is required - a decision with no
    // decider is not an audit record.
    this.app.post('/api/approvals/:id/:decision', async (req, res) => {
      try {
        if (!this.approvalGate) return res.status(503).json({ error: 'Approval layer not initialized' });

        const { decision } = req.params;
        if (!['approve', 'reject', 'modify'].includes(decision)) {
          return res.status(400).json({ error: `Unknown decision: ${decision}` });
        }

        const { by, notes, inputs } = req.body || {};
        if (!by) return res.status(400).json({ error: 'by is required to record who decided' });

        const record = await this.approvalGate.decide(req.params.id, {
          decision,
          by,
          notes,
          modifiedInputs: inputs
        });

        // A decision is only useful if the paused plan moves.
        let resumed = null;
        if (record.graphId && this.planner) {
          resumed = await this.planner
            .resume(record.graphId, { actor: by })
            .catch((error) => ({ error: error.message }));
        }

        res.json({ approval: record, resumed });
      } catch (error) {
        logger.error(`Approval decision error: ${error.message}`);
        res.status(400).json({ error: error.message });
      }
    });

    // ---- Planning ----------------------------------------------------------

    // Decompose an objective into an execution graph WITHOUT running it, so
    // the plan, its cost, and the approvals it needs can be reviewed first.
    this.app.post('/api/plan', async (req, res) => {
      try {
        if (!this.planner) {
          return res.status(503).json({ error: 'Planner not initialized' });
        }
        const { objective, vertical, projectId, context } = req.body || {};
        if (!objective) return res.status(400).json({ error: 'objective required' });

        const { graph, estimate, approvals, source } = await this.planner.plan(objective, {
          vertical,
          projectId,
          context
        });

        res.json({
          graphId: graph.id,
          source,
          estimate,
          approvals,
          plan: graph.toJSON(),
          text: graph.toText()
        });
      } catch (error) {
        logger.error(`Planning error: ${error.message}`);
        res.status(400).json({ error: error.message });
      }
    });

    // Plan and run. async=true queues it durably and returns a job id.
    this.app.post('/api/plan/execute', async (req, res) => {
      try {
        if (!this.planner) {
          return res.status(503).json({ error: 'Planner not initialized' });
        }
        const {
          objective, graphId, vertical, projectId,
          permissions = [], approvedNodes = [], maxCost, async: runAsync = true
        } = req.body || {};

        let graph;
        if (graphId) {
          graph = this.planner.getGraph(graphId);
          if (!graph) return res.status(404).json({ error: `Unknown graph: ${graphId}` });
        } else {
          if (!objective) return res.status(400).json({ error: 'objective or graphId required' });
          ({ graph } = await this.planner.plan(objective, { vertical, projectId }));
        }

        const context = { permissions, vertical, projectId, actor: 'api' };

        if (runAsync) {
          const jobId = await this.planner.runAsJob(graph, context, { approvedNodes, maxCost });
          return res.json({
            graphId: graph.id,
            jobId,
            status: 'queued',
            message: `Plan queued. Check status at /api/jobs/${jobId}`
          });
        }

        const summary = await this.planner.execute(graph, context, { approvedNodes, maxCost });
        res.json({ graphId: graph.id, ...summary });
      } catch (error) {
        logger.error(`Plan execution error: ${error.message}`);
        res.status(400).json({ error: error.message });
      }
    });

    // Platform job queue (plans and anything else queued at platform level).
    this.app.get('/api/jobs/:jobId', async (req, res) => {
      try {
        if (!this.jobQueue) return res.status(503).json({ error: 'Job queue not initialized' });
        const job = await this.jobQueue.getJob(req.params.jobId);
        if (!job) return res.status(404).json({ error: 'Job not found' });
        res.json(job);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/jobs', async (req, res) => {
      try {
        if (!this.jobQueue) return res.status(503).json({ error: 'Job queue not initialized' });
        const stats = await this.jobQueue.getStats();
        const jobs = await this.jobQueue.listJobs({
          status: req.query.status,
          limit: Number(req.query.limit || 50)
        });
        res.json({ ...stats, jobs });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/plans', (req, res) => {
      if (!this.planner) return res.status(503).json({ error: 'Planner not initialized' });
      res.json({ plans: this.planner.listGraphs() });
    });

    this.app.get('/api/plans/:graphId', (req, res) => {
      if (!this.planner) return res.status(503).json({ error: 'Planner not initialized' });
      const graph = this.planner.getGraph(req.params.graphId);
      if (!graph) return res.status(404).json({ error: `Unknown graph: ${req.params.graphId}` });
      res.json({ ...graph.toJSON(), text: graph.toText() });
    });

    // ---- Capability registry ----------------------------------------------

    // What the platform can do, and which of it is usable right now.
    this.app.get('/api/capabilities', (req, res) => {
      try {
        if (!this.capabilityRegistry) {
          return res.status(503).json({ error: 'Capability Registry not initialized' });
        }
        const { vertical, provider, availableOnly } = req.query;
        res.json({
          stats: this.capabilityRegistry.getStats(),
          capabilities: this.capabilityRegistry.list({
            vertical,
            provider,
            availableOnly: availableOnly === 'true'
          })
        });
      } catch (error) {
        logger.error(`Capability list error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // Full metadata for one capability: cost, latency, permissions,
    // failure modes, fallback, and observed reliability per provider.
    this.app.get('/api/capabilities/:capabilityId', (req, res) => {
      try {
        if (!this.capabilityRegistry) {
          return res.status(503).json({ error: 'Capability Registry not initialized' });
        }
        const described = this.capabilityRegistry.describe(req.params.capabilityId);
        if (!described) {
          return res.status(404).json({ error: `Unknown capability: ${req.params.capabilityId}` });
        }
        res.json(described);
      } catch (error) {
        logger.error(`Capability describe error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // Run a capability by id, letting the registry pick and fall back.
    this.actionAuth = requireActionAuth();
    this.actionRateLimit = rateLimitActions({ windowMs: 60_000, max: 40 });

    this.app.post('/api/capabilities/:capabilityId/invoke', this.actionAuth, this.actionRateLimit, async (req, res) => {
      try {
        if (!this.capabilityRegistry) {
          return res.status(503).json({ error: 'Capability Registry not initialized' });
        }

        const { input = {}, context = {} } = req.body || {};
        const result = await this.capabilityRegistry.invoke(
          req.params.capabilityId,
          input,
          { ...context, actor: context.actor || 'api' }
        );
        res.json(result);
      } catch (error) {
        logger.error(`Capability invoke error: ${error.message}`);
        const unknown = /Unknown capability/.test(error.message);
        res.status(unknown ? 404 : 400).json({ error: error.message });
      }
    });

    // Async content generation (job-based)
    this.app.post('/api/content/generate-async', async (req, res) => {
      try {
        if (!this.contentFactory) {
          return res.status(503).json({ error: 'Content Factory not initialized' });
        }

        const { topic, contentType = 'guide', options = {} } = req.body;

        if (!topic) {
          return res.status(400).json({ error: 'topic required' });
        }

        const jobId = await this.contentFactory.startContentGeneration(topic, contentType, options);
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
    this.app.get('/api/content/job/:jobId', async (req, res) => {
      try {
        if (!this.contentFactory) {
          return res.status(503).json({ error: 'Content Factory not initialized' });
        }

        const job = await this.contentFactory.getJobStatus(req.params.jobId);

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
    this.app.get('/api/content/queue-stats', async (req, res) => {
      try {
        if (!this.contentFactory) {
          return res.status(503).json({ error: 'Content Factory not initialized' });
        }

        res.json(await this.contentFactory.jobQueue.getStats());
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
    this.app.post('/api/n8n/send-event', this.actionAuth, this.actionRateLimit, async (req, res) => {
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

    this.app.get('/api/day1/actions', (req, res) => {
      res.json({
        revision: process.env.RENDER_GIT_COMMIT || null,
        actions: this.day1Actions.slice(0, 20)
      });
    });

    this.app.post('/api/day1/chat', this.actionAuth, this.actionRateLimit, async (req, res) => {
      try {
        const text = String(req.body?.text || '').trim();
        if (!text) {
          return res.status(400).json({ error: 'text required' });
        }
        const source = req.body?.source === 'voice' ? 'voice' : 'text';
        const result = await this.processNaturalLanguage(text, {
          userId: req.body?.userId || 'api',
          source: `api:${source}`
        });
        res.json(result);
      } catch (error) {
        logger.error(`Day-1 chat error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/acquisition/runs', this.actionAuth, (req, res) => {
      if (!this.acquisitionEngine) return res.status(503).json({ error: 'Acquisition engine not initialized' });
      res.json({ runs: this.acquisitionEngine.listRuns(Number(req.query.limit || 20)) });
    });

    this.app.get('/api/acquisition/runs/:runId', this.actionAuth, (req, res) => {
      if (!this.acquisitionEngine) return res.status(503).json({ error: 'Acquisition engine not initialized' });
      const run = this.acquisitionEngine.getRun(req.params.runId);
      if (!run) return res.status(404).json({ error: `Unknown run: ${req.params.runId}` });
      const prospects = this.acquisitionStore?.listProspects({ runId: req.params.runId }) || [];
      res.json({ run, prospects });
    });

    this.app.post('/api/acquisition/run', this.actionAuth, this.actionRateLimit, async (req, res) => {
      try {
        if (!this.acquisitionEngine) {
          return res.status(503).json({ error: 'Acquisition engine not initialized' });
        }
        const result = await this.acquisitionEngine.run(req.body || {});
        res.json(result);
      } catch (error) {
        logger.error(`Acquisition run error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/campaigns', this.actionAuth, (req, res) => {
      if (!this.intelligenceEngine) return res.status(503).json({ error: 'Intelligence engine not initialized' });
      res.json({ campaigns: this.intelligenceEngine.listCampaigns(Number(req.query.limit || 20)) });
    });

    this.app.get('/api/campaigns/:campaignId', this.actionAuth, (req, res) => {
      if (!this.intelligenceEngine) return res.status(503).json({ error: 'Intelligence engine not initialized' });
      const campaign = this.intelligenceEngine.getCampaign(req.params.campaignId);
      if (!campaign) return res.status(404).json({ error: `Unknown campaign: ${req.params.campaignId}` });
      res.json({ campaign });
    });

    this.app.post('/api/campaign/prepare', this.actionAuth, this.actionRateLimit, async (req, res) => {
      try {
        if (!this.intelligenceEngine) {
          return res.status(503).json({ error: 'Intelligence engine not initialized' });
        }
        const result = await this.intelligenceEngine.prepare(req.body || {});
        res.json(result);
      } catch (error) {
        logger.error(`Campaign prepare error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/campaign/control', this.actionAuth, this.actionRateLimit, async (req, res) => {
      try {
        await handleCampaignControlHttp(this.intelligenceEngine, req, res);
      } catch (error) {
        logger.error(`Campaign control error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/campaign/test', this.actionAuth, this.actionRateLimit, async (req, res) => {
      try {
        if (!this.intelligenceEngine) {
          return res.status(503).json({ error: 'Intelligence engine not initialized' });
        }
        res.json(await this.intelligenceEngine.prepareTestCampaign(req.body || {}));
      } catch (error) {
        logger.error(`Test campaign error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/campaign/orchestrate', this.actionAuth, this.actionRateLimit, async (req, res) => {
      try {
        if (!this.campaignOrchestrator) {
          return res.status(503).json({ error: 'Campaign orchestrator not initialized' });
        }
        const result = await this.campaignOrchestrator.run(req.body || {});
        const status = result.allowed === false || result.status === 'blocked' ? 403 : 200;
        res.status(status).json(result);
      } catch (error) {
        logger.error(`Campaign orchestrate error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/outreach/execute', this.actionAuth, this.actionRateLimit, async (req, res) => {
      try {
        if (!this.outreachExecutor) {
          return res.status(503).json({ error: 'Outreach executor not initialized' });
        }
        const result = await this.outreachExecutor.execute(req.body || {});
        const status = result.allowed === false ? 403 : 200;
        res.status(status).json(result);
      } catch (error) {
        logger.error(`Outreach execute error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/objectives', this.actionAuth, (req, res) => {
      if (!this.macgyverEngine) return res.status(503).json({ error: 'MacGyver engine not initialized' });
      res.json({ objectives: this.macgyverEngine.list(Number(req.query.limit || 20)) });
    });

    this.app.get('/api/objectives/catalogue', this.actionAuth, (req, res) => {
      if (!this.macgyverEngine) return res.status(503).json({ error: 'MacGyver engine not initialized' });
      res.json({ catalogue: this.macgyverEngine.catalogue({ availableOnly: req.query.availableOnly !== 'false' }) });
    });

    this.app.get('/api/objectives/:objectiveId', this.actionAuth, (req, res) => {
      if (!this.macgyverEngine) return res.status(503).json({ error: 'MacGyver engine not initialized' });
      const record = this.macgyverEngine.get(req.params.objectiveId);
      if (!record) return res.status(404).json({ error: `Unknown objective: ${req.params.objectiveId}` });
      res.json({ objective: record });
    });

    this.app.post('/api/objectives', this.actionAuth, this.actionRateLimit, async (req, res) => {
      try {
        if (!this.macgyverEngine) return res.status(503).json({ error: 'MacGyver engine not initialized' });
        const body = req.body || {};
        if (body.wait === false) {
          const started = this.macgyverEngine.begin(body);
          started.promise.catch((error) => logger.error(`MacGyver background run failed: ${error.message}`));
          return res.json({
            status: 'accepted',
            objectiveId: started.objective.objectiveId,
            message: 'Objective started'
          });
        }
        const result = await this.macgyverEngine.run(body);
        res.json(result);
      } catch (error) {
        logger.error(`Objective run error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/objectives/:objectiveId/control', this.actionAuth, this.actionRateLimit, async (req, res) => {
      try {
        if (!this.macgyverEngine) return res.status(503).json({ error: 'MacGyver engine not initialized' });
        res.json(await this.macgyverEngine.control({ ...(req.body || {}), objectiveId: req.params.objectiveId }));
      } catch (error) {
        logger.error(`Objective control error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/tools', this.actionAuth, (req, res) => {
      if (!this.toolFabric) return res.status(503).json({ error: 'Tool fabric not initialized' });
      const inspect = this.toolFabric.inspect(req.query.q || 'tools');
      res.json({
        stats: this.toolFabric.stats(),
        inspect,
        catalogue: this.macgyverEngine?.catalogue({ availableOnly: req.query.availableOnly !== 'false' }) || []
      });
    });

    this.app.get('/api/mcp', this.actionAuth, (req, res) => {
      if (!this.toolFabric) return res.status(503).json({ error: 'Tool fabric not initialized' });
      res.json({
        servers: this.toolFabric.mcpRegistry.list(),
        stats: this.toolFabric.stats(),
        tools: this.toolFabric.snapshot()
      });
    });

    this.app.post('/api/mcp/refresh', this.actionAuth, this.actionRateLimit, async (req, res) => {
      try {
        if (!this.toolFabric) return res.status(503).json({ error: 'Tool fabric not initialized' });
        const result = await this.toolFabric.refresh(req.body?.serverId);
        res.json(result);
      } catch (error) {
        logger.error(`MCP refresh error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/tools/health', this.actionAuth, this.actionRateLimit, (req, res) => {
      if (!this.toolFabric) return res.status(503).json({ error: 'Tool fabric not initialized' });
      const provider = req.body?.provider;
      const state = req.body?.state;
      if (!provider) return res.status(400).json({ error: 'provider required' });
      if (state === 'UNAVAILABLE') this.toolFabric.forceProviderDown(provider);
      else this.toolFabric.restoreProvider(provider);
      res.json({ overlay: this.toolFabric.healthOverlay(), provider, state: state || 'HEALTHY' });
    });

    this.app.get('/api/llm', this.actionAuth, (req, res) => {
      if (!this.llmRouter) return res.status(503).json({ error: 'LLM router not initialized' });
      const taskClass = req.query.taskClass || 'PLANNING';
      res.json({
        models: this.llmRouter.list(),
        lastRoute: this.llmRouter.lastRoute,
        sample: this.llmRouter.select({ taskClass })
      });
    });

    this.app.get('/api/specialists', this.actionAuth, (req, res) => {
      if (!this.macgyverEngine) return res.status(503).json({ error: 'MacGyver engine not initialized' });
      const record = this.macgyverEngine.get(req.query.objectiveId || 'latest');
      res.json({
        objectiveId: record?.objectiveId || null,
        delegation: record?.delegation || null,
        specialists: record?.specialists || [],
        arbitration: record?.arbitration || null,
        critic: record?.critic || null
      });
    });

    this.app.get('/api/schedules', this.actionAuth, (req, res) => {
      if (!this.durableRuntime) return res.status(503).json({ error: 'Durable runtime not initialized' });
      res.json(this.durableRuntime.scheduler.inspect());
    });

    this.app.post('/api/schedules', this.actionAuth, this.actionRateLimit, (req, res) => {
      if (!this.durableRuntime) return res.status(503).json({ error: 'Durable runtime not initialized' });
      const created = this.durableRuntime.scheduler.create(req.body || {});
      const status = created.blocked ? 403 : 200;
      res.status(status).json(created);
    });

    this.app.post('/api/schedules/:scheduleId/:action', this.actionAuth, this.actionRateLimit, (req, res) => {
      if (!this.durableRuntime) return res.status(503).json({ error: 'Durable runtime not initialized' });
      const { scheduleId, action } = req.params;
      let rec = null;
      if (action === 'pause') rec = this.durableRuntime.scheduler.pause(scheduleId);
      else if (action === 'resume') rec = this.durableRuntime.scheduler.resume(scheduleId);
      else if (action === 'cancel') rec = this.durableRuntime.scheduler.cancel(scheduleId);
      else if (action === 'delete') rec = this.durableRuntime.scheduler.remove(scheduleId);
      else return res.status(400).json({ error: `Unknown action ${action}` });
      if (!rec) return res.status(404).json({ error: 'Schedule not found' });
      res.json(rec);
    });

    this.app.get('/api/memory', this.actionAuth, (req, res) => {
      if (!this.durableRuntime) return res.status(503).json({ error: 'Durable runtime not initialized' });
      const items = req.query.q
        ? this.durableRuntime.memory.recall({ query: req.query.q, limit: Number(req.query.limit || 10) })
        : this.durableRuntime.memory.list(Number(req.query.limit || 20));
      res.json({ memories: items });
    });

    this.app.get('/api/runtime', this.actionAuth, async (req, res) => {
      if (!this.durableRuntime) return res.status(503).json({ error: 'Durable runtime not initialized' });
      const snapshot = this.durableRuntime.snapshot();
      snapshot.queue = this.jobQueue ? await this.jobQueue.getStats() : null;
      snapshot.jobs = this.jobQueue ? await this.jobQueue.listJobs({ limit: 20 }) : [];
      snapshot.approvals = this.approvalGate ? await this.approvalGate.list({ status: 'pending' }).catch(() => []) : [];
      res.json(snapshot);
    });

    this.app.get('/day8', async (req, res) => {
      const runtime = this.durableRuntime?.health?.() || {};
      const snapshot = this.durableRuntime?.snapshot?.() || {};
      const stats = this.jobQueue ? await this.jobQueue.getStats() : {};
      const email = this.outreachEmail?.isAvailable?.() ? 'configured' : 'UNAVAILABLE';
      res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>HustleBot Day-8</title>
<style>body{font-family:ui-sans-serif,system-ui;background:#0f1419;color:#e7ecf1;margin:0;padding:32px;max-width:1040px}h1{margin:0 0 8px}code,pre{background:#1b232c;padding:12px;border-radius:8px;display:block;overflow:auto} .ok{color:#7dce82}.bad{color:#ff8b8b}</style>
</head><body>
<h1>HustleBot Day-8 Durable Runtime</h1>
<p>Jobs, leases, scheduler, and operational memory survive process restarts. MacGyver remains the brain. n8n records.</p>
<p>Email: <span class="${email === 'configured' ? 'ok' : 'bad'}">${email}</span>
 · Runtime: <span class="${runtime.state === 'HEALTHY' ? 'ok' : 'bad'}">${runtime.state || 'UNAVAILABLE'}</span>
 · Queue backend: ${stats.backend || 'n/a'}</p>
<h2>Startup recovery</h2>
<pre>${JSON.stringify(runtime.startup || this.durableRuntime?.startupReport || {}, null, 2)}</pre>
<h2>Queue</h2>
<pre>${JSON.stringify(stats, null, 2)}</pre>
<h2>Schedules</h2>
<pre>${JSON.stringify(snapshot.schedules || {}, null, 2)}</pre>
<h2>Memory / journal</h2>
<pre>${JSON.stringify({ memories: snapshot.memories, journalTail: snapshot.journalTail }, null, 2)}</pre>
</body></html>`);
    });

    this.app.get('/day7', (req, res) => {
      const objectives = this.macgyverEngine?.list(8) || [];
      const latest = this.macgyverEngine?.latest?.() || null;
      const email = this.outreachEmail?.isAvailable?.() ? 'configured' : 'UNAVAILABLE';
      res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>HustleBot Day-7</title>
<style>body{font-family:ui-sans-serif,system-ui;background:#0f1419;color:#e7ecf1;margin:0;padding:32px;max-width:1040px}h1{margin:0 0 8px}code,pre{background:#1b232c;padding:12px;border-radius:8px;display:block;overflow:auto} .ok{color:#7dce82}.bad{color:#ff8b8b}</style>
</head><body>
<h1>HustleBot Day-7 Specialists</h1>
<p>MacGyver remains the supervisor. Specialists are bounded, least-privilege, and terminate with the objective.</p>
<p>Email: <span class="${email === 'configured' ? 'ok' : 'bad'}">${email}</span></p>
<h2>Latest delegation</h2>
<pre>${JSON.stringify({
        objectiveId: latest?.objectiveId,
        delegation: latest?.delegation,
        specialists: (latest?.specialists || []).map((s) => ({ id: s.specialistId, role: s.role, slice: s.slice, status: s.status, model: s.modelSelected }))
      }, null, 2)}</pre>
<h2>Recent objectives</h2>
<pre>${JSON.stringify(objectives, null, 2)}</pre>
</body></html>`);
    });

    this.app.get('/day6', (req, res) => {
      const stats = this.toolFabric?.stats?.() || {};
      const servers = this.toolFabric?.mcpRegistry?.list?.() || [];
      const models = this.llmRouter?.list?.() || [];
      const objectives = this.macgyverEngine?.list(8) || [];
      const email = this.outreachEmail?.isAvailable?.() ? 'configured' : 'UNAVAILABLE';
      res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>HustleBot Day-6</title>
<style>body{font-family:ui-sans-serif,system-ui;background:#0f1419;color:#e7ecf1;margin:0;padding:32px;max-width:1040px}h1{margin:0 0 8px}code,pre{background:#1b232c;padding:12px;border-radius:8px;display:block;overflow:auto} .ok{color:#7dce82}.bad{color:#ff8b8b}</style>
</head><body>
<h1>HustleBot Day-6 Tool Fabric + LLM Router</h1>
<p>Dynamic MCP/n8n tools feed the existing catalogue. The planner still composes DAGs — it does not hard-code new workflows.</p>
<p>Email: <span class="${email === 'configured' ? 'ok' : 'bad'}">${email}</span>
 · Visible tools: ${stats.visible ?? 0}
 · Quarantined: ${stats.quarantined ?? 0}
 · MCP servers: ${servers.length}
 · Models: ${models.length}</p>
<h2>MCP servers</h2>
<pre>${JSON.stringify(servers, null, 2)}</pre>
<h2>Models</h2>
<pre>${JSON.stringify(models.map((m) => ({ id: m.modelId, tasks: m.taskClasses, cost: m.relativeCost })), null, 2)}</pre>
<h2>Recent objectives</h2>
<pre>${JSON.stringify(objectives, null, 2)}</pre>
</body></html>`);
    });

    this.app.get('/day5', (req, res) => {
      const objectives = this.macgyverEngine?.list(8) || [];
      const email = this.outreachEmail?.isAvailable?.() ? 'configured' : 'UNAVAILABLE';
      res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>HustleBot Day-5</title>
<style>body{font-family:ui-sans-serif,system-ui;background:#0f1419;color:#e7ecf1;margin:0;padding:32px;max-width:1040px}h1{margin:0 0 8px}code,pre{background:#1b232c;padding:12px;border-radius:8px;display:block;overflow:auto} .ok{color:#7dce82}.bad{color:#ff8b8b}</style>
</head><body>
<h1>HustleBot Day-5 MacGyver</h1>
<p>Plans from the capability catalogue. Discovered prospects are not contacted.</p>
<p>Email: <span class="${email === 'configured' ? 'ok' : 'bad'}">${email}</span></p>
<h2>Recent objectives</h2>
<pre>${JSON.stringify(objectives, null, 2)}</pre>
</body></html>`);
    });

    this.app.get('/day2', (req, res) => {
      const providers = this.acquisitionEngine?.providerStatus?.() || {};
      const runs = this.acquisitionEngine?.listRuns(5) || [];
      res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>HustleBot Day-2</title>
<style>body{font-family:ui-sans-serif,system-ui;background:#0f1419;color:#e7ecf1;margin:0;padding:32px}h1{margin:0 0 8px}code,pre{background:#1b232c;padding:12px;border-radius:8px;display:block;overflow:auto} .ok{color:#7dce82}.bad{color:#ff8b8b}</style>
</head><body>
<h1>HustleBot Day-2 Acquisition Engine</h1>
<p>Discovery and workflow prep. No outbound contact from this path.</p>
<p>Firecrawl: <span class="${providers.firecrawl ? 'ok' : 'bad'}">${providers.firecrawl ? 'available' : 'not configured'}</span>
 · Spider: ${providers.spider ? 'available' : 'down'}
 · Search: ${providers.search ? 'available' : 'down'}</p>
<h2>Recent runs</h2>
<pre>${JSON.stringify(runs, null, 2)}</pre>
<p>Use Telegram or an authenticated <code>POST /api/acquisition/run</code> to start a run.</p>
</body></html>`);
    });

    this.app.get('/day3', (req, res) => {
      const campaigns = this.intelligenceEngine?.listCampaigns(5) || [];
      const apollo = this.apolloProvider?.isAvailable?.() ? 'configured' : 'UNAVAILABLE';
      const email = this.outreachEmail?.isAvailable?.() ? 'configured' : 'UNAVAILABLE';
      res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>HustleBot Day-3</title>
<style>body{font-family:ui-sans-serif,system-ui;background:#0f1419;color:#e7ecf1;margin:0;padding:32px;max-width:980px}h1{margin:0 0 8px}code,pre{background:#1b232c;padding:12px;border-radius:8px;display:block;overflow:auto} .ok{color:#7dce82}.bad{color:#ff8b8b}</style>
</head><body>
<h1>HustleBot Day-3 Intelligence</h1>
<p>Prospect intelligence, qualification, scoring, and gated outreach prep. Nobody is contacted from this path.</p>
<p>Browser render: <span class="ok">available</span>
 · Apollo: <span class="${apollo === 'configured' ? 'ok' : 'bad'}">${apollo}</span>
 · Email outreach: <span class="${email === 'configured' ? 'ok' : 'bad'}">${email}</span></p>
<h2>Recent campaigns</h2>
<pre>${JSON.stringify(campaigns, null, 2)}</pre>
<p>Authenticated <code>POST /api/campaign/prepare</code> prepares a campaign. <code>POST /api/outreach/execute</code> fails closed without approval.</p>
</body></html>`);
    });

    this.app.get('/day4', (req, res) => {
      const campaigns = this.intelligenceEngine?.listCampaigns(8) || [];
      const apollo = this.apolloProvider?.isAvailable?.() ? 'configured' : 'UNAVAILABLE';
      const email = this.outreachEmail?.isAvailable?.() ? 'configured' : 'UNAVAILABLE';
      const providers = this.enrichmentRouter?.providerStatus?.() || {};
      res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>HustleBot Day-4</title>
<style>body{font-family:ui-sans-serif,system-ui;background:#0f1419;color:#e7ecf1;margin:0;padding:32px;max-width:1040px}h1{margin:0 0 8px}code,pre{background:#1b232c;padding:12px;border-radius:8px;display:block;overflow:auto} .ok{color:#7dce82}.bad{color:#ff8b8b}</style>
</head><body>
<h1>HustleBot Day-4 Contact Intelligence</h1>
<p>Contact discovery, identity resolution, scoring, suppression, and gated test execution. Discovered prospects are not contacted.</p>
<p>Apollo: <span class="${apollo === 'configured' ? 'ok' : 'bad'}">${apollo}</span>
 · Email: <span class="${email === 'configured' ? 'ok' : 'bad'}">${email}</span>
 · Public web: <span class="${providers.PUBLIC_WEB ? 'ok' : 'bad'}">${providers.PUBLIC_WEB ? 'available' : 'down'}</span></p>
<h2>Recent campaigns</h2>
<pre>${JSON.stringify(campaigns, null, 2)}</pre>
</body></html>`);
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

    // Telegram webhook setup
    this.app.post('/api/telegram/setup-webhook', async (req, res) => {
      try {
        if (!this.bot) {
          return res.status(503).json({ error: 'Bot not initialized' });
        }

        // Get the deployment URL
        const deployUrl = process.env.VERCEL_URL || req.headers.host;
        const webhookUrl = `https://${deployUrl}/api/telegram/webhook`;

        logger.info(`Setting Telegram webhook to: ${webhookUrl}`);

        // Register webhook with Telegram
        await this.bot.telegram.setWebhook(webhookUrl);

        logger.info('✅ Telegram webhook set successfully');
        res.json({
          success: true,
          webhookUrl,
          message: 'Telegram webhook configured successfully'
        });
      } catch (error) {
        logger.error('Failed to set webhook:', error.message);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Check webhook status
    this.app.get('/api/telegram/webhook-info', async (req, res) => {
      try {
        if (!this.bot) {
          return res.status(503).json({ error: 'Bot not initialized' });
        }

        const info = await this.bot.telegram.getWebhookInfo();
        res.json({
          success: true,
          webhook: info
        });
      } catch (error) {
        logger.error('Failed to get webhook info:', error.message);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Delete webhook (for cleanup)
    this.app.post('/api/telegram/delete-webhook', async (req, res) => {
      try {
        if (!this.bot) {
          return res.status(503).json({ error: 'Bot not initialized' });
        }

        await this.bot.telegram.deleteWebhook();
        logger.info('✅ Telegram webhook deleted');

        res.json({
          success: true,
          message: 'Telegram webhook deleted'
        });
      } catch (error) {
        logger.error('Failed to delete webhook:', error.message);
        res.status(500).json({
          success: false,
          error: error.message
        });
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
          },
          integrations: {
            payment: {
              create_intent: 'POST /api/payments/create-intent',
              confirm: 'POST /api/payments/confirm',
              subscription: 'POST /api/payments/subscription',
              status: 'GET /api/payments/status'
            },
            social: {
              schedule_post: 'POST /api/social/schedule-post',
              publish: 'POST /api/social/publish',
              analytics: 'GET /api/social/analytics',
              status: 'GET /api/social/status'
            },
            image: {
              generate: 'POST /api/images/generate',
              social_images: 'POST /api/images/social-images',
              edit: 'POST /api/images/edit',
              status: 'GET /api/images/status'
            },
            shopify: {
              create_store: 'POST /api/shopify/create-store',
              import_products: 'POST /api/shopify/import-products',
              create_order: 'POST /api/shopify/create-order',
              status: 'GET /api/shopify/status'
            },
            email: {
              send: 'POST /api/emails/send',
              add_contact: 'POST /api/emails/add-contact',
              create_campaign: 'POST /api/emails/create-campaign',
              status: 'GET /api/emails/status'
            },
            deployment: {
              create_project: 'POST /api/deployments/create-project',
              deploy: 'POST /api/deployments/deploy',
              add_domain: 'POST /api/deployments/add-domain',
              status: 'GET /api/deployments/status'
            },
            scraping: {
              scrape_page: 'POST /api/scraping/scrape-page',
              extract_data: 'POST /api/scraping/extract-data',
              batch_scrape: 'POST /api/scraping/batch-scrape',
              status: 'GET /api/scraping/status'
            },
            enrichment: {
              enrich_company: 'POST /api/enrichment/enrich-company',
              enrich_person: 'POST /api/enrichment/enrich-person',
              verify_email: 'POST /api/enrichment/verify-email',
              status: 'GET /api/enrichment/status'
            }
          },
          features: {
            scheduling: {
              schedule_task: 'POST /api/scheduling/schedule',
              list_schedules: 'GET /api/scheduling/list',
              execute: 'POST /api/scheduling/:scheduleId/execute',
              status: 'GET /api/scheduling/status'
            },
            analytics: {
              track_event: 'POST /api/analytics/track-event',
              track_conversion: 'POST /api/analytics/track-conversion',
              get_metrics: 'GET /api/analytics/metrics',
              status: 'GET /api/analytics/status'
            },
            cost_optimization: {
              log_transaction: 'POST /api/costs/log-transaction',
              get_breakdown: 'GET /api/costs/breakdown',
              recommendations: 'GET /api/costs/recommendations',
              status: 'GET /api/costs/status'
            },
            memory: {
              add_memory: 'POST /api/memory/add-memory',
              search: 'GET /api/memory/search',
              generate_playbook: 'POST /api/memory/generate-playbook',
              status: 'GET /api/memory/status'
            }
          }
        }
      });
    });

    // Phase 4 Integration Endpoints
    // Payment Endpoints
    this.app.post('/api/payments/create-intent', async (req, res) => {
      try {
        if (!this.paymentIntegration) return res.status(503).json({ error: 'Payment integration not initialized' });
        const { amount, currency } = req.body;
        const result = await this.paymentIntegration.createPaymentIntent(amount, currency);
        res.json(result);
      } catch (error) {
        logger.error(`Payment error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/payments/status', (req, res) => {
      if (!this.paymentIntegration) return res.status(503).json({ error: 'Payment integration not initialized' });
      res.json(this.paymentIntegration.getStatus());
    });

    // Social Endpoints
    this.app.post('/api/social/schedule-post', async (req, res) => {
      try {
        if (!this.socialIntegration) return res.status(503).json({ error: 'Social integration not initialized' });
        const { content, platforms, scheduleTime } = req.body;
        const result = await this.socialIntegration.schedulePost(content, platforms, scheduleTime);
        res.json(result);
      } catch (error) {
        logger.error(`Social error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/social/status', (req, res) => {
      if (!this.socialIntegration) return res.status(503).json({ error: 'Social integration not initialized' });
      res.json(this.socialIntegration.getStatus());
    });

    // Image Endpoints
    this.app.post('/api/images/generate', async (req, res) => {
      try {
        if (!this.imageIntegration) return res.status(503).json({ error: 'Image integration not initialized' });
        const { prompt, width, height } = req.body;
        const result = await this.imageIntegration.generateImage(prompt, { width, height });
        res.json(result);
      } catch (error) {
        logger.error(`Image error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/images/status', (req, res) => {
      if (!this.imageIntegration) return res.status(503).json({ error: 'Image integration not initialized' });
      res.json(this.imageIntegration.getStatus());
    });

    // Shopify Endpoints
    this.app.post('/api/shopify/create-store', async (req, res) => {
      try {
        if (!this.shopifyIntegration) return res.status(503).json({ error: 'Shopify integration not initialized' });
        const { storeName, theme } = req.body;
        const result = await this.shopifyIntegration.createStore(storeName, theme);
        res.json(result);
      } catch (error) {
        logger.error(`Shopify error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/shopify/status', (req, res) => {
      if (!this.shopifyIntegration) return res.status(503).json({ error: 'Shopify integration not initialized' });
      res.json(this.shopifyIntegration.getStatus());
    });

    // Email Integration Endpoints
    this.app.post('/api/emails/send', async (req, res) => {
      try {
        if (!this.emailIntegration) return res.status(503).json({ error: 'Email integration not initialized' });
        const { to, subject, html } = req.body;
        const result = await this.emailIntegration.sendEmail(to, subject, html);
        res.json(result);
      } catch (error) {
        logger.error(`Email error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/emails/status', (req, res) => {
      if (!this.emailIntegration) return res.status(503).json({ error: 'Email integration not initialized' });
      res.json(this.emailIntegration.getStatus());
    });

    // Deployment Endpoints
    this.app.post('/api/deployments/create-project', async (req, res) => {
      try {
        if (!this.deploymentIntegration) return res.status(503).json({ error: 'Deployment integration not initialized' });
        const { projectName, framework } = req.body;
        const result = await this.deploymentIntegration.createProject(projectName, null, framework);
        res.json(result);
      } catch (error) {
        logger.error(`Deployment error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/deployments/status', (req, res) => {
      if (!this.deploymentIntegration) return res.status(503).json({ error: 'Deployment integration not initialized' });
      res.json(this.deploymentIntegration.getStatus());
    });

    // Scraping Endpoints
    this.app.post('/api/scraping/scrape-page', async (req, res) => {
      try {
        if (!this.scrapingIntegration) return res.status(503).json({ error: 'Scraping integration not initialized' });
        const { url } = req.body;
        const result = await this.scrapingIntegration.scrapePage(url);
        res.json(result);
      } catch (error) {
        logger.error(`Scraping error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/scraping/status', (req, res) => {
      if (!this.scrapingIntegration) return res.status(503).json({ error: 'Scraping integration not initialized' });
      res.json(this.scrapingIntegration.getStatus());
    });

    // Enrichment Endpoints
    this.app.post('/api/enrichment/enrich-company', async (req, res) => {
      try {
        if (!this.enrichmentIntegration) return res.status(503).json({ error: 'Enrichment integration not initialized' });
        const { domain } = req.body;
        const result = await this.enrichmentIntegration.enrichCompany(domain);
        res.json(result);
      } catch (error) {
        logger.error(`Enrichment error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/enrichment/status', (req, res) => {
      if (!this.enrichmentIntegration) return res.status(503).json({ error: 'Enrichment integration not initialized' });
      res.json(this.enrichmentIntegration.getStatus());
    });

    // Phase 5 Feature Endpoints
    // Scheduling Endpoints
    this.app.post('/api/scheduling/schedule', async (req, res) => {
      try {
        if (!this.schedulingEngine) return res.status(503).json({ error: 'Scheduling engine not initialized' });
        const { name, cronExpression, payload } = req.body;
        const result = await this.schedulingEngine.scheduleRecurring(name, cronExpression, payload);
        res.json(result);
      } catch (error) {
        logger.error(`Scheduling error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/scheduling/list', async (req, res) => {
      try {
        if (!this.schedulingEngine) return res.status(503).json({ error: 'Scheduling engine not initialized' });
        const result = await this.schedulingEngine.listSchedules();
        res.json(result);
      } catch (error) {
        logger.error(`Scheduling error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/scheduling/status', (req, res) => {
      if (!this.schedulingEngine) return res.status(503).json({ error: 'Scheduling engine not initialized' });
      res.json(this.schedulingEngine.getStatus());
    });

    // Analytics Endpoints
    this.app.post('/api/analytics/track-event', async (req, res) => {
      try {
        if (!this.analyticsEngine) return res.status(503).json({ error: 'Analytics engine not initialized' });
        const { userId, eventName, eventData } = req.body;
        const result = await this.analyticsEngine.trackEvent(userId, eventName, eventData);
        res.json(result);
      } catch (error) {
        logger.error(`Analytics error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/analytics/track-conversion', async (req, res) => {
      try {
        if (!this.analyticsEngine) return res.status(503).json({ error: 'Analytics engine not initialized' });
        const { userId, conversionType, value } = req.body;
        const result = await this.analyticsEngine.trackConversion(userId, conversionType, value);
        res.json(result);
      } catch (error) {
        logger.error(`Analytics error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/analytics/metrics', async (req, res) => {
      try {
        if (!this.analyticsEngine) return res.status(503).json({ error: 'Analytics engine not initialized' });
        const { startDate, endDate } = req.query;
        const result = await this.analyticsEngine.getConversionMetrics(
          new Date(startDate || Date.now() - 7*24*60*60*1000),
          new Date(endDate || Date.now())
        );
        res.json(result);
      } catch (error) {
        logger.error(`Analytics error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/analytics/status', (req, res) => {
      if (!this.analyticsEngine) return res.status(503).json({ error: 'Analytics engine not initialized' });
      res.json(this.analyticsEngine.getStatus());
    });

    // Cost Optimizer Endpoints
    this.app.post('/api/costs/log-transaction', async (req, res) => {
      try {
        if (!this.costOptimizer) return res.status(503).json({ error: 'Cost optimizer not initialized' });
        const { service, amount, metadata } = req.body;
        const result = await this.costOptimizer.logTransaction(service, amount, metadata);
        res.json(result);
      } catch (error) {
        logger.error(`Cost error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/costs/breakdown', async (req, res) => {
      try {
        if (!this.costOptimizer) return res.status(503).json({ error: 'Cost optimizer not initialized' });
        const result = await this.costOptimizer.getSpendingBreakdown();
        res.json(result);
      } catch (error) {
        logger.error(`Cost error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/costs/recommendations', async (req, res) => {
      try {
        if (!this.costOptimizer) return res.status(503).json({ error: 'Cost optimizer not initialized' });
        const result = await this.costOptimizer.generateRecommendations();
        res.json(result);
      } catch (error) {
        logger.error(`Cost error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/costs/status', (req, res) => {
      if (!this.costOptimizer) return res.status(503).json({ error: 'Cost optimizer not initialized' });
      res.json(this.costOptimizer.getStatus());
    });

    // Memory System Endpoints
    this.app.post('/api/memory/add-memory', async (req, res) => {
      try {
        if (!this.memorySystem) return res.status(503).json({ error: 'Memory system not initialized' });
        const { content, category, metadata } = req.body;
        const result = await this.memorySystem.addMemory(content, category, metadata);
        res.json(result);
      } catch (error) {
        logger.error(`Memory error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/memory/search', async (req, res) => {
      try {
        if (!this.memorySystem) return res.status(503).json({ error: 'Memory system not initialized' });
        const { query } = req.query;
        const result = await this.memorySystem.getMemory(query);
        res.json(result);
      } catch (error) {
        logger.error(`Memory error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/memory/generate-playbook', async (req, res) => {
      try {
        if (!this.memorySystem) return res.status(503).json({ error: 'Memory system not initialized' });
        const { topic, minSuccessRate } = req.body;
        const result = await this.memorySystem.generatePlaybook(topic, minSuccessRate);
        res.json(result);
      } catch (error) {
        logger.error(`Memory error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/memory/status', (req, res) => {
      if (!this.memorySystem) return res.status(503).json({ error: 'Memory system not initialized' });
      res.json(this.memorySystem.getStatus());
    });

    // Retell Integration Endpoints
    this.app.post('/api/retell/create-agent', async (req, res) => {
      try {
        if (!this.retellIntegration) return res.status(503).json({ error: 'Retell integration not initialized' });
        const { agentName, systemPrompt, config } = req.body;
        const result = await this.retellIntegration.createAgent(agentName, systemPrompt, config);
        res.json(result);
      } catch (error) {
        logger.error(`Retell error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/retell/outbound-call', async (req, res) => {
      try {
        if (!this.retellIntegration) return res.status(503).json({ error: 'Retell integration not initialized' });
        const { agentId, phoneNumber, callContext } = req.body;
        const result = await this.retellIntegration.initiateOutboundCall(agentId, phoneNumber, callContext);
        res.json(result);
      } catch (error) {
        logger.error(`Retell error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/retell/inbound-call', async (req, res) => {
      try {
        if (!this.retellIntegration) return res.status(503).json({ error: 'Retell integration not initialized' });
        const { agentId, phoneNumber, callData } = req.body;
        const result = await this.retellIntegration.handleInboundCall(agentId, phoneNumber, callData);
        res.json(result);
      } catch (error) {
        logger.error(`Retell error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/retell/transcript/:callId', async (req, res) => {
      try {
        if (!this.retellIntegration) return res.status(503).json({ error: 'Retell integration not initialized' });
        const { callId } = req.params;
        const result = await this.retellIntegration.getTranscript(callId);
        res.json(result);
      } catch (error) {
        logger.error(`Retell error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/retell/analytics/:agentId', async (req, res) => {
      try {
        if (!this.retellIntegration) return res.status(503).json({ error: 'Retell integration not initialized' });
        const { agentId } = req.params;
        const result = await this.retellIntegration.getAgentAnalytics(agentId);
        res.json(result);
      } catch (error) {
        logger.error(`Retell error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/retell/update-prompt', async (req, res) => {
      try {
        if (!this.retellIntegration) return res.status(503).json({ error: 'Retell integration not initialized' });
        const { agentId, newPrompt } = req.body;
        const result = await this.retellIntegration.updateAgentPrompt(agentId, newPrompt);
        res.json(result);
      } catch (error) {
        logger.error(`Retell error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/retell/call/:callId', async (req, res) => {
      try {
        if (!this.retellIntegration) return res.status(503).json({ error: 'Retell integration not initialized' });
        const result = await this.retellIntegration.getCallResults(req.params.callId);
        res.json(result);
      } catch (error) {
        logger.error(`Retell get-call error: ${error.message}`);
        res.status(404).json({ error: error.message });
      }
    });

    this.app.get('/api/retell/call-history/:agentId', async (req, res) => {
      try {
        if (!this.retellIntegration) return res.status(503).json({ error: 'Retell integration not initialized' });
        const { agentId } = req.params;
        const { limit } = req.query;
        const result = await this.retellIntegration.getCallHistory(agentId, limit);
        res.json(result);
      } catch (error) {
        logger.error(`Retell error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/retell/agents', async (req, res) => {
      try {
        if (!this.retellIntegration) return res.status(503).json({ error: 'Retell integration not initialized' });
        const result = await this.retellIntegration.listAgents();
        res.json(result);
      } catch (error) {
        logger.error(`Retell error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/retell/status', (req, res) => {
      if (!this.retellIntegration) return res.status(503).json({ error: 'Retell integration not initialized' });
      res.json(this.retellIntegration.getStatus());
    });

    // Phase 6: Voice Workflow Builder routes
    this.app.post('/api/voice/process-transcript', async (req, res) => {
      try {
        if (!this.transcriptProcessor) return res.status(503).json({ error: 'Transcript processor not initialized' });
        const result = await this.transcriptProcessor.processCallTranscript(req.body);
        res.json(result);
      } catch (error) {
        logger.error('Transcript processing error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/voice/build-workflow', async (req, res) => {
      try {
        if (!this.transcriptProcessor || !this.voiceWorkflowBuilder) {
          return res.status(503).json({ error: 'Voice workflow system not initialized' });
        }
        const { callId } = req.body;
        const result = await this.transcriptProcessor.triggerWorkflowBuilding(callId, this.voiceWorkflowBuilder);
        res.json(result);
      } catch (error) {
        logger.error('Workflow building error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/voice/transcript/:callId', (req, res) => {
      if (!this.transcriptProcessor) return res.status(503).json({ error: 'Transcript processor not initialized' });
      const status = this.transcriptProcessor.getTranscriptStatus(req.params.callId);
      res.json(status);
    });

    this.app.get('/api/voice/workflow/:callId', (req, res) => {
      if (!this.transcriptProcessor) return res.status(503).json({ error: 'Transcript processor not initialized' });
      const workflowId = this.transcriptProcessor.getWorkflowFromTranscript(req.params.callId);
      res.json({ callId: req.params.callId, workflowId });
    });

    this.app.post('/api/voice/workflow/:workflowId/confirm', async (req, res) => {
      try {
        if (!this.voiceWorkflowBuilder) return res.status(503).json({ error: 'Voice workflow builder not initialized' });
        const result = await this.voiceWorkflowBuilder.getWorkflowStatus({ workflowId: req.params.workflowId });
        res.json(result);
      } catch (error) {
        logger.error('Workflow confirmation error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/voice/status', (req, res) => {
      if (!this.transcriptProcessor) return res.status(503).json({ error: 'Transcript processor not initialized' });
      res.json({
        transcriptProcessor: this.transcriptProcessor.getStats(),
        voiceWorkflowBuilder: {
          initialized: !!this.voiceWorkflowBuilder,
          integrations: {
            retell: !!this.retellIntegration
          }
        }
      });
    });

    // Phase 7: Voice Workflow Refinement routes
    this.app.get('/api/refine/workflow/:workflowId', async (req, res) => {
      try {
        if (!this.voiceWorkflowRefiner) return res.status(503).json({ error: 'Refiner not initialized' });
        const result = await this.voiceWorkflowRefiner.getWorkflowDetails({ workflowId: req.params.workflowId });
        res.json(result);
      } catch (error) {
        logger.error('Workflow retrieval error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/refine/workflow/:workflowId', async (req, res) => {
      try {
        if (!this.voiceWorkflowRefiner) return res.status(503).json({ error: 'Refiner not initialized' });
        const result = await this.voiceWorkflowRefiner.modifyWorkflow({
          workflowId: req.params.workflowId,
          command: req.body.command,
          parameters: req.body.parameters
        });
        res.json(result);
      } catch (error) {
        logger.error('Modification error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/refine/workflow/:workflowId/add-step', async (req, res) => {
      try {
        if (!this.voiceWorkflowRefiner) return res.status(503).json({ error: 'Refiner not initialized' });
        const result = await this.voiceWorkflowRefiner.addWorkflowStep({
          workflowId: req.params.workflowId,
          stepName: req.body.stepName,
          integration: req.body.integration,
          action: req.body.action,
          position: req.body.position
        });
        res.json(result);
      } catch (error) {
        logger.error('Step addition error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/refine/workflow/:workflowId/remove-step', async (req, res) => {
      try {
        if (!this.voiceWorkflowRefiner) return res.status(503).json({ error: 'Refiner not initialized' });
        const result = await this.voiceWorkflowRefiner.removeWorkflowStep({
          workflowId: req.params.workflowId,
          stepId: req.body.stepId
        });
        res.json(result);
      } catch (error) {
        logger.error('Step removal error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/refine/workflow/:workflowId/parameters', async (req, res) => {
      try {
        if (!this.voiceWorkflowRefiner) return res.status(503).json({ error: 'Refiner not initialized' });
        const result = await this.voiceWorkflowRefiner.updateParameters({
          workflowId: req.params.workflowId,
          updates: req.body.updates
        });
        res.json(result);
      } catch (error) {
        logger.error('Parameter update error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/refine/workflow/:workflowId/test', async (req, res) => {
      try {
        if (!this.voiceWorkflowRefiner) return res.status(503).json({ error: 'Refiner not initialized' });
        const result = await this.voiceWorkflowRefiner.testWorkflow({
          workflowId: req.params.workflowId,
          testData: req.body.testData
        });
        res.json(result);
      } catch (error) {
        logger.error('Test error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/refine/workflow/:workflowId/history', async (req, res) => {
      try {
        if (!this.voiceWorkflowRefiner) return res.status(503).json({ error: 'Refiner not initialized' });
        const result = await this.voiceWorkflowRefiner.getExecutionHistory({
          workflowId: req.params.workflowId,
          limit: req.query.limit || 10
        });
        res.json(result);
      } catch (error) {
        logger.error('History retrieval error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/refine/workflow/:workflowId/suggestions', async (req, res) => {
      try {
        if (!this.voiceWorkflowRefiner) return res.status(503).json({ error: 'Refiner not initialized' });
        const result = await this.voiceWorkflowRefiner.suggestImprovements({
          workflowId: req.params.workflowId,
          analysisType: req.query.type || 'completeness'
        });
        res.json(result);
      } catch (error) {
        logger.error('Suggestion error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/refine/workflow/:workflowId/rollback', async (req, res) => {
      try {
        if (!this.voiceWorkflowRefiner) return res.status(503).json({ error: 'Refiner not initialized' });
        const result = await this.voiceWorkflowRefiner.rollbackWorkflow({
          workflowId: req.params.workflowId,
          versionId: req.body.versionId
        });
        res.json(result);
      } catch (error) {
        logger.error('Rollback error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/refine/workflow/:workflowId/publish', async (req, res) => {
      try {
        if (!this.voiceWorkflowRefiner) return res.status(503).json({ error: 'Refiner not initialized' });
        const result = await this.voiceWorkflowRefiner.publishRefinement({
          workflowId: req.params.workflowId,
          description: req.body.description
        });
        res.json(result);
      } catch (error) {
        logger.error('Publication error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/refine/status', (req, res) => {
      if (!this.refinementManager) return res.status(503).json({ error: 'Refinement manager not initialized' });
      res.json({
        refinementManager: this.refinementManager.getStats(),
        voiceWorkflowRefiner: {
          initialized: !!this.voiceWorkflowRefiner
        }
      });
    });

    // Phase 8: Voice Conversation Agent routes
    this.app.post('/api/conversations/start', async (req, res) => {
      try {
        if (!this.voiceConversationAgent || !this.conversationManager) {
          return res.status(503).json({ error: 'Conversation system not initialized' });
        }
        const { workflowId, initialRequest, phoneNumber } = req.body;
        const conversation = await this.conversationManager.createConversation(workflowId, initialRequest, phoneNumber);
        const result = await this.voiceConversationAgent.startConversation({
          workflowId,
          initialRequest,
          phoneNumber
        });
        res.json({ ...result, conversationId: conversation.id });
      } catch (error) {
        logger.error('Conversation start error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/conversations/:conversationId/continue', async (req, res) => {
      try {
        if (!this.voiceConversationAgent || !this.conversationManager) {
          return res.status(503).json({ error: 'Conversation system not initialized' });
        }
        const { conversationId } = req.params;
        const { userInput } = req.body;
        await this.conversationManager.addTurn(conversationId, 'user', userInput);
        const result = await this.voiceConversationAgent.continueConversation({
          conversationId,
          userInput
        });
        await this.conversationManager.addTurn(conversationId, 'system', result.message, result);
        res.json(result);
      } catch (error) {
        logger.error('Conversation continuation error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/conversations/:conversationId/ask-clarification', async (req, res) => {
      try {
        if (!this.voiceConversationAgent || !this.conversationManager) {
          return res.status(503).json({ error: 'Conversation system not initialized' });
        }
        const { conversationId } = req.params;
        const { question, options } = req.body;
        await this.conversationManager.addClarification(conversationId, question, options);
        const result = await this.voiceConversationAgent.askClarification({
          conversationId,
          question,
          options
        });
        res.json(result);
      } catch (error) {
        logger.error('Clarification error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/conversations/:conversationId/confirm', async (req, res) => {
      try {
        if (!this.voiceConversationAgent || !this.conversationManager) {
          return res.status(503).json({ error: 'Conversation system not initialized' });
        }
        const { conversationId } = req.params;
        const { summary } = req.body;
        await this.conversationManager.addConfirmation(conversationId, summary);
        const result = await this.voiceConversationAgent.confirmRefinement({
          conversationId,
          summary
        });
        res.json(result);
      } catch (error) {
        logger.error('Confirmation error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/conversations/:conversationId/apply', async (req, res) => {
      try {
        if (!this.voiceConversationAgent || !this.conversationManager) {
          return res.status(503).json({ error: 'Conversation system not initialized' });
        }
        const { conversationId } = req.params;
        const { autoPublish } = req.body || {};
        const conversation = await this.conversationManager.getConversation(conversationId, true);
        if (conversation?.context?.confirmations?.length > 0) {
          const lastConfirm = conversation.context.confirmations[conversation.context.confirmations.length - 1];
          await this.conversationManager.confirmRequest(conversationId, lastConfirm.id);
        }
        const result = await this.voiceConversationAgent.applyConversationRefinement({
          conversationId,
          autoPublish: autoPublish || false
        });
        res.json(result);
      } catch (error) {
        logger.error('Application error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/conversations/:conversationId/state', async (req, res) => {
      try {
        if (!this.voiceConversationAgent || !this.conversationManager) {
          return res.status(503).json({ error: 'Conversation system not initialized' });
        }
        const { conversationId } = req.params;
        const state = await this.conversationManager.getConversationState(conversationId);
        res.json(state);
      } catch (error) {
        logger.error('State retrieval error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/conversations/:conversationId/end', async (req, res) => {
      try {
        if (!this.voiceConversationAgent || !this.conversationManager) {
          return res.status(503).json({ error: 'Conversation system not initialized' });
        }
        const { conversationId } = req.params;
        const { outcome } = req.body || {};
        const result = await this.voiceConversationAgent.endConversation({
          conversationId,
          outcome: outcome || 'completed'
        });
        await this.conversationManager.endConversation(conversationId, outcome || 'completed');
        res.json(result);
      } catch (error) {
        logger.error('End conversation error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/conversations/:conversationId/history', async (req, res) => {
      try {
        if (!this.voiceConversationAgent || !this.conversationManager) {
          return res.status(503).json({ error: 'Conversation system not initialized' });
        }
        const { conversationId } = req.params;
        const history = await this.conversationManager.getConversationHistory(conversationId);
        res.json(history);
      } catch (error) {
        logger.error('History retrieval error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/conversations/status', (req, res) => {
      if (!this.conversationManager) return res.status(503).json({ error: 'Conversation manager not initialized' });
      res.json({
        conversationManager: this.conversationManager.getStats(),
        voiceConversationAgent: {
          initialized: !!this.voiceConversationAgent
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

  recordDay1Action(entry) {
    this.day1Actions.unshift({
      at: new Date().toISOString(),
      ...entry
    });
    this.day1Actions = this.day1Actions.slice(0, 20);
  }

  /**
   * Shared Intent → Capability → Result path used by Telegram text,
   * Telegram voice (after Deepgram), and the Day-1 chat probe.
   */
  async processNaturalLanguage(text, { userId = 'unknown', source = 'text' } = {}) {
    if (isStatusRequest(text)) {
      const snapshot = await collectDay1Health(this);
      const reply = formatDay1StatusText(snapshot);
      this.recordDay1Action({
        source,
        kind: 'status',
        capabilityId: null,
        success: true,
        replyPreview: reply.slice(0, 240)
      });
      return { reply, kind: 'status', snapshot };
    }

    if (this.durableRuntime) {
      const scheduled = await this.durableRuntime.handleNaturalLanguage(text, { userId });
      if (scheduled) {
        this.recordDay1Action({
          source,
          kind: scheduled.kind,
          capabilityId: null,
          success: true,
          replyPreview: String(scheduled.reply || '').slice(0, 240)
        });
        return scheduled;
      }
    }

    if (this.macgyverEngine) {
      const control = matchObjectiveControl(text);
      if (control) {
        const result = await this.macgyverEngine.control({ ...control, query: text });
        return { reply: result.report || 'Objective control updated.', kind: 'objective.control', result };
      }
      const run = matchObjectiveRun(text);
      if (run) {
        const started = this.macgyverEngine.run({ rawRequest: text, actor: `telegram:${userId}` });
        started.catch((error) => logger.error(`MacGyver run failed: ${error.message}`));
        return {
          reply: 'MacGyver objective started. Ask “what are you working on?” or “show me the plan.” Discovered people will not be contacted.',
          kind: 'objective.run'
        };
      }
    }

    if (this.intentDetector && this.actionBridge) {
      const intent = await this.intentDetector.detect(text);

      if ((intent.error === 'DETECTION_ERROR' || intent.error === 'NO_LLM') && this.llm) {
        logger.warn(`Intent detection failed (${intent.error}), falling back to LLM`);
        const response = await this.llm.complete(text, {
          taskType: 'general',
          maxTokens: 1000,
          temperature: 0.7
        });
        this.recordDay1Action({
          source,
          kind: 'llm',
          capabilityId: null,
          success: true,
          error: intent.error,
          replyPreview: String(response.content || '').slice(0, 240)
        });
        return { reply: response.content, kind: 'llm', intent };
      }

      if (intent.capabilityId) {
        const actionResult = await this.actionBridge.execute(intent, {
          userId,
          vertical: null
        });
        this.recordDay1Action({
          source,
          kind: actionResult.success ? 'action' : 'action_failed',
          capabilityId: intent.capabilityId,
          success: actionResult.success,
          error: actionResult.error || null,
          executionId: actionResult.executionId || null,
          replyPreview: String(actionResult.conversationalResponse || '').slice(0, 240)
        });
        return {
          reply: actionResult.conversationalResponse,
          kind: actionResult.success ? 'action' : 'action_failed',
          intent,
          actionResult
        };
      }

      if (intent.fallback_response) {
        this.recordDay1Action({
          source,
          kind: 'conversational',
          capabilityId: null,
          success: true,
          replyPreview: String(intent.fallback_response).slice(0, 240)
        });
        return {
          reply: intent.fallback_response,
          kind: 'conversational',
          intent
        };
      }

      const response = await this.llm.complete(text, {
        taskType: 'general',
        maxTokens: 1000,
        temperature: 0.7
      });
      this.recordDay1Action({
        source,
        kind: 'llm',
        capabilityId: null,
        success: true,
        replyPreview: String(response.content || '').slice(0, 240)
      });
      return { reply: response.content, kind: 'llm', intent };
    }

    if (this.llm) {
      const response = await this.llm.complete(text, {
        taskType: 'general',
        maxTokens: 1000,
        temperature: 0.7
      });
      this.recordDay1Action({
        source,
        kind: 'llm',
        capabilityId: null,
        success: true,
        replyPreview: String(response.content || '').slice(0, 240)
      });
      return { reply: response.content, kind: 'llm' };
    }

    return {
      reply: 'Got your message! The AI service is loading. Please try again in a moment.',
      kind: 'unavailable'
    };
  }

  setupTelegramHandlers() {
    if (!this.bot) return;

    logger.info('📱 Setting up Telegram command handlers...');

    // Initialize command center
    // Kept on the server so the approval gate can push requests through it.
    this.commandCenter = new TelegramCommandCenter(this.bot, this);
    const commandCenter = this.commandCenter;
    commandCenter.register();

    // Handle /start command (show main menu)
    this.bot.command('start', async (ctx) => {
      try {
        logger.info(`/start command from user ${ctx.from.id}`);
        await ctx.reply('👋 Welcome to HustleBot v2!\n\nLaunch the command center with /menu or use voice commands.');
      } catch (error) {
        logger.error('Error handling /start:', error);
      }
    });

    // Handle /status command
    this.bot.command('status', async (ctx) => {
      try {
        logger.info(`/status command from user ${ctx.from.id}`);
        const snapshot = await collectDay1Health(this);
        await ctx.reply(formatDay1StatusText(snapshot));
      } catch (error) {
        logger.error('Error handling /status:', error);
        await ctx.reply('Status check failed. Please try again.');
      }
    });

    // Handle voice messages (MUST come BEFORE generic message handler)
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
          logger.info(`Audio URL: ${audioUrl}`);

          // Use native fetch and convert response to buffer
          const audioResponse = await fetch(audioUrl);
          logger.info(`Fetch response received, status: ${audioResponse.status}`);

          // Convert arrayBuffer to Node.js Buffer (compatible with both v2 and v3)
          const arrayBuffer = await audioResponse.arrayBuffer();
          const audioBuffer = Buffer.from(arrayBuffer);
          logger.info(`Audio buffer created, size: ${audioBuffer.length} bytes`);

          // Convert voice to text
          logger.info('Converting speech to text...');
          const { text } = await this.voice.speechToText(audioBuffer, 'audio/ogg');
          logger.info(`✅ Transcribed: "${text}"`);

          if (!text) {
            await ctx.reply("🎤 I couldn't make out any speech in that. Try again?");
            return;
          }

          // Show "typing" indicator
          await ctx.sendChatAction('typing');

          logger.info('Sending transcription back...');
          await ctx.reply(`🎤 You said: "${text}"`);

          // Try to get AI response (with action routing if available)
          try {
            if (!this.llm) {
              logger.warn('LLM not available');
              return;
            }

            const routed = await this.processNaturalLanguage(text, {
              userId: ctx.from.id,
              source: 'telegram-voice'
            });
            const responseText = routed.reply;

            // Send text response
            await ctx.reply(`🤖 AI: ${responseText}`);

            // Speak the answer back as a Telegram voice note.
            // Text already went out above, so a TTS failure is not fatal.
            try {
              await ctx.sendChatAction('record_voice');
              logger.info('Generating spoken reply...');

              const speech = await this.voice.textToSpeech(responseText, {
                voice: process.env.DEEPGRAM_TTS_VOICE || 'aura-asteria-en',
                format: 'ogg'
              });

              await ctx.replyWithVoice({ source: speech.audioBuffer });
              logger.info(`✅ Spoken reply sent (${speech.size} bytes)`);

              if (speech.truncated) {
                await ctx.reply('_(spoken reply was shortened - full text above)_', {
                  parse_mode: 'Markdown'
                });
              }
            } catch (ttsError) {
              logger.error('Text-to-speech failed (non-fatal):', ttsError.message);
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

    // Handle text messages (MUST come AFTER voice handler)
    this.bot.on('message', async (ctx) => {
      try {
        // Skip if not a text message (voice messages handled above)
        if (!ctx.message.text) {
          return;
        }

        const userMessage = ctx.message.text;
        logger.info(`Message from user ${ctx.from.id}: ${userMessage}`);

        await ctx.sendChatAction('typing');
        const routed = await this.processNaturalLanguage(userMessage, {
          userId: ctx.from.id,
          source: 'telegram-text'
        });
        await ctx.reply(routed.reply);
      } catch (error) {
        logger.error('Error handling message:', error);
        await ctx.reply('❌ Something went wrong. Please try again.');
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
      logger.info('[START] ⏳ Waiting for initialization...');
      // Add 30-second timeout to initialization to prevent hanging
      logger.info('[START] ⏳ Initialization timeout set to 30 seconds...');
      await Promise.race([
        this.initialize(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Initialization timeout - proceeding to listen')), 30000)
        )
      ]);
      logger.info('[START] ✅ Initialization complete');

      logger.info(`[START] 📡 About to call app.listen on port ${this.port}...`);
      logger.info(`[START] 📡 this.app = ${this.app ? 'EXISTS' : 'NULL'}`);
      logger.info(`[START] 📡 this.port = ${this.port}`);

      this.server = this.app.listen(this.port, '0.0.0.0', () => {
        logger.info(`[LISTEN] 🚀 Server listening on port ${this.port}`);
        logger.info(`[LISTEN] 📊 Health check: http://localhost:${this.port}/health`);
        logger.info(`[LISTEN] 🌐 Status: http://localhost:${this.port}/api/status`);
      });

      logger.info(`[START] 📡 app.listen() returned, setting up error handler...`);

      // Add error handler for listen
      this.server.on('error', (err) => {
        logger.error(`[LISTEN] ❌ Server listen error: ${err.message}`);
        process.exit(1);
      });

      logger.info(`[START] ✅ Server startup sequence complete`);

      // Graceful shutdown
      process.on('SIGINT', async () => {
        logger.info('🛑 Received SIGINT, shutting down gracefully...');
        try { await this.durableRuntime?.shutdown(); } catch (error) { logger.error(`Runtime shutdown: ${error.message}`); }
        if (this.bot) {
          try {
            await this.bot.stop();
            logger.info('✅ Telegram bot stopped');
          } catch (error) {
            logger.error('Error stopping bot:', error.message);
          }
        }
        if (this.server) {
          this.server.close(() => {
            logger.info('✅ Server closed');
            process.exit(0);
          });
        }
      });

      process.on('SIGTERM', async () => {
        logger.info('🛑 Received SIGTERM, shutting down gracefully...');
        try { await this.durableRuntime?.shutdown(); } catch (error) { logger.error(`Runtime shutdown: ${error.message}`); }
        if (this.bot) {
          try {
            await this.bot.stop();
            logger.info('✅ Telegram bot stopped');
          } catch (error) {
            logger.error('Error stopping bot:', error.message);
          }
        }
        if (this.server) {
          this.server.close(() => {
            logger.info('✅ Server closed');
            process.exit(0);
          });
        }
      });
    } catch (error) {
      // If it's the initialization timeout, log warning and continue to listen
      if (error.message && error.message.includes('Initialization timeout')) {
        logger.warn(`⚠️  ${error.message}`);
        logger.warn('⚠️  Continuing with partial initialization (some systems may not be ready)');

        // Proceed to app.listen() anyway
        logger.info(`[START] 📡 About to call app.listen on port ${this.port} (partial init)...`);
        this.server = this.app.listen(this.port, '0.0.0.0', () => {
          logger.info(`[LISTEN] 🚀 Server listening on port ${this.port}`);
          logger.info(`[LISTEN] 📊 Health check: http://localhost:${this.port}/health`);
          logger.info(`[LISTEN] 🌐 Status: http://localhost:${this.port}/api/status`);
        });

        this.server.on('error', (err) => {
          logger.error(`[LISTEN] ❌ Server listen error: ${err.message}`);
          process.exit(1);
        });

        logger.info(`[START] ✅ Server startup sequence complete (with initialization timeout)`);
        return;
      }

      // For other errors, exit
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  getApp() {
    return this.app;
  }
}

// Initialize server
let server;
let app;
let initError = null;

try {
  console.log('[STARTUP] Creating HustleBotServer instance...');
  server = new HustleBotServer();
  console.log('[STARTUP] Instance created, calling createApp()...');
  server.createApp();
  console.log('[STARTUP] App created, setting reference...');
  app = server.app;
  console.log('[STARTUP] App reference set');

  // Local start - ALWAYS use server mode on Render
  logger.info(`[STARTUP] VERCEL env var: "${process.env.VERCEL}"`);
  logger.info(`[STARTUP] NODE_ENV: "${process.env.NODE_ENV}"`);
  logger.info(`[STARTUP] Platform: Render (forcing server mode)`);

  // Always start server (even on Render, we need to listen on a port)
  logger.info('[STARTUP] ⏳ Starting server in listen mode...');
  server.start().catch(err => {
    logger.error('[STARTUP] Server start error:', err.message);
    logger.error('[STARTUP] Error stack:', err.stack);
    process.exit(1);
  });

  console.log('[STARTUP] Ready to export app');
} catch (error) {
  console.error('[STARTUP FATAL]', error.message);
  console.error('[STARTUP STACK]', error.stack);
  initError = error;

  // Create minimal fallback app
  app = express();
  app.get('/health', (req, res) => {
    res.status(500).json({
      error: 'Server startup failed',
      message: error.message
    });
  });
}

// Export handler for Vercel
console.log('[STARTUP] Creating export handler...');
const handler = (req, res) => {
  console.log('[REQUEST]', req.method, req.url);
  if (app) {
    return app(req, res);
  }
  res.status(503).json({ error: 'App not initialized' });
};
console.log('[STARTUP] Handler created');

export default handler;
