/**
 * PLATFORM CAPABILITY BINDINGS
 *
 * Maps the capability ids named in the Master Build Spec onto the concrete
 * integrations and factories this platform runs. The registry itself stays
 * generic; this file is where the platform declares what it can actually do.
 *
 * Cost and latency figures are planning estimates used for routing, not
 * billing. Observed latency and reliability replace the estimates as calls
 * accumulate.
 *
 * A capability whose backing service is missing still registers - its
 * isAvailable() simply returns false, so it appears in the catalogue as
 * known-but-unavailable rather than silently absent. That distinction is
 * what lets a planner report "I cannot do this yet" instead of failing.
 */

import logger from '../utils/logger.js';

/**
 * @param {CapabilityRegistry} registry
 * @param {object} services - the initialized server, i.e. `this` from HustleBotServer
 */
export function registerPlatformCapabilities(registry, services = {}) {
  const {
    scrapingIntegration,
    enrichmentIntegration,
    emailIntegration,
    retellIntegration,
    socialIntegration,
    deploymentIntegration,
    paymentIntegration,
    imageIntegration,
    contentFactory,
    siteFactory,
    videoFactory,
    leadFactory,
    knowledgeFactory,
    analyticsEngine,
    voice
  } = services;

  const present = (service, method) =>
    () => Boolean(service && typeof service[method] === 'function');

  const descriptors = [
    // ---- Data acquisition -------------------------------------------------
    {
      capabilityId: 'web.scrape',
      name: 'Scrape a web page',
      description: 'Fetch and extract structured content from a single URL',
      provider: 'scraping-integration',
      mcpTool: 'invoke_capability',
      permissions: ['network.read'],
      inputs: {
        type: 'object',
        properties: { url: { type: 'string' }, options: { type: 'object' } },
        required: ['url']
      },
      outputs: { type: 'object', properties: { content: { type: 'string' } } },
      expectedCost: 0.002,
      expectedLatencyMs: 4000,
      reliability: 0.9,
      failureModes: ['blocked by robots.txt', 'rate limited', 'timeout', 'js-rendered page'],
      fallbackProvider: 'firecrawl',
      handler: (input) => scrapingIntegration.scrapePage(input.url, input.options || {}),
      isAvailable: present(scrapingIntegration, 'scrapePage')
    },

    // ---- Lead operations --------------------------------------------------
    {
      capabilityId: 'lead.enrich',
      name: 'Enrich a lead record',
      description: 'Append firmographic or contact data to a raw lead',
      provider: 'enrichment-integration',
      mcpTool: 'invoke_capability',
      permissions: ['data.write'],
      inputs: {
        type: 'object',
        properties: {
          domain: { type: 'string' },
          email: { type: 'string' },
          kind: { type: 'string', enum: ['company', 'person'] }
        }
      },
      expectedCost: 0.01,
      expectedLatencyMs: 2500,
      reliability: 0.92,
      failureModes: ['no match found', 'quota exhausted', 'stale record'],
      handler: (input) =>
        input.kind === 'person'
          ? enrichmentIntegration.enrichPerson(input)
          : enrichmentIntegration.enrichCompany(input.domain || input),
      isAvailable: present(enrichmentIntegration, 'enrichCompany')
    },
    {
      capabilityId: 'lead.score',
      name: 'Score leads',
      description: 'Rank normalized leads against qualification criteria',
      provider: 'lead-factory',
      mcpTool: 'invoke_capability',
      permissions: ['data.read'],
      inputs: {
        type: 'object',
        properties: { leads: { type: 'array' } },
        required: ['leads']
      },
      expectedCost: 0.001,
      expectedLatencyMs: 800,
      reliability: 0.97,
      failureModes: ['insufficient fields to score'],
      handler: (input) => leadFactory.scoreLeads(input.leads),
      isAvailable: present(leadFactory, 'scoreLeads')
    },
    {
      capabilityId: 'lead.route',
      name: 'Route leads to a destination',
      description: 'Deliver scored leads to buyers, CRM, or internal queues',
      provider: 'lead-factory',
      mcpTool: 'invoke_capability',
      permissions: ['data.write', 'external.send'],
      inputs: {
        type: 'object',
        properties: { leads: { type: 'array' }, destination: { type: 'string' } },
        required: ['leads']
      },
      expectedCost: 0.001,
      expectedLatencyMs: 1200,
      reliability: 0.95,
      failureModes: ['buyer rejected', 'destination unreachable', 'consent missing'],
      handler: (input) => leadFactory.routeLeads(input.leads, input.destination),
      isAvailable: present(leadFactory, 'routeLeads')
    },

    // ---- Outbound ---------------------------------------------------------
    {
      capabilityId: 'email.send',
      name: 'Send an email',
      provider: 'email-integration',
      mcpTool: 'invoke_capability',
      permissions: ['external.send'],
      inputs: {
        type: 'object',
        properties: {
          to: { type: 'string' },
          subject: { type: 'string' },
          body: { type: 'string' }
        },
        required: ['to', 'subject']
      },
      expectedCost: 0.0004,
      expectedLatencyMs: 900,
      reliability: 0.98,
      failureModes: ['hard bounce', 'suppressed recipient', 'provider throttling'],
      handler: (input) => emailIntegration.sendEmail(input),
      isAvailable: present(emailIntegration, 'sendEmail')
    },
    {
      capabilityId: 'voice.call',
      name: 'Place an outbound voice call',
      provider: 'retell',
      mcpTool: 'invoke_capability',
      permissions: ['external.send', 'telephony'],
      inputs: {
        type: 'object',
        properties: {
          phoneNumber: { type: 'string', description: 'Phone number to call' },
          script: { type: 'string', description: 'What the agent should say' },
          name: { type: 'string', description: 'Name of the prospect (optional)' },
          purpose: { type: 'string', description: 'Purpose of the call (optional)' }
        },
        required: ['phoneNumber', 'script']
      },
      expectedCost: 0.09,
      expectedLatencyMs: 3000,
      reliability: 0.9,
      // Calling real people costs money and is regulated - never automatic.
      requiresApproval: true,
      failureModes: ['no answer', 'invalid number', 'outside calling window', 'consent missing'],
      handler: (input) => retellIntegration.makeOutboundCall(input),
      isAvailable: present(retellIntegration, 'makeOutboundCall')
    },
    {
      capabilityId: 'social.publish',
      name: 'Publish a social post',
      provider: 'social-integration',
      mcpTool: 'invoke_capability',
      permissions: ['external.send'],
      inputs: {
        type: 'object',
        properties: { platform: { type: 'string' }, content: { type: 'string' } },
        required: ['content']
      },
      expectedCost: 0,
      expectedLatencyMs: 1500,
      reliability: 0.93,
      requiresApproval: true,
      failureModes: ['token expired', 'platform rate limit', 'content rejected'],
      handler: (input) => socialIntegration.publishPost(input),
      isAvailable: present(socialIntegration, 'publishPost')
    },

    // ---- Creation ---------------------------------------------------------
    {
      capabilityId: 'content.generate',
      name: 'Generate written content',
      provider: 'content-factory',
      mcpTool: 'generate_content',
      permissions: ['llm.invoke'],
      inputs: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
          contentType: {
            type: 'string',
            enum: ['guide', 'review', 'comparison', 'weeklyJourney', 'news']
          }
        },
        required: ['topic']
      },
      expectedCost: 0.04,
      expectedLatencyMs: 25000,
      reliability: 0.94,
      failureModes: ['LLM timeout', 'budget exceeded', 'failed editorial QA'],
      handler: (input) =>
        contentFactory.generateContent(input.topic, input.contentType || 'guide', input.options || {}),
      isAvailable: present(contentFactory, 'generateContent')
    },
    {
      capabilityId: 'image.generate',
      name: 'Generate an image',
      provider: 'image-integration',
      mcpTool: 'invoke_capability',
      permissions: ['llm.invoke'],
      inputs: {
        type: 'object',
        properties: { prompt: { type: 'string' } },
        required: ['prompt']
      },
      expectedCost: 0.02,
      expectedLatencyMs: 12000,
      reliability: 0.9,
      fallbackProvider: 'replicate',
      failureModes: ['safety filter', 'provider timeout', 'quota exhausted'],
      handler: (input) => imageIntegration.generateImage(input.prompt, input.options || {}),
      isAvailable: present(imageIntegration, 'generateImage')
    },
    {
      capabilityId: 'video.generate',
      name: 'Generate a video',
      provider: 'video-factory',
      mcpTool: 'invoke_capability',
      permissions: ['llm.invoke', 'media.render'],
      inputs: {
        type: 'object',
        properties: { script: { type: 'string' }, topic: { type: 'string' } }
      },
      expectedCost: 0.5,
      expectedLatencyMs: 120000,
      reliability: 0.85,
      fallbackProvider: 'shotstack',
      failureModes: ['render failure', 'avatar provider down', 'asset missing'],
      handler: (input) => videoFactory.createVideo(input),
      isAvailable: present(videoFactory, 'createVideo')
    },
    {
      capabilityId: 'site.build',
      name: 'Build a landing page',
      provider: 'site-factory',
      mcpTool: 'invoke_capability',
      permissions: ['llm.invoke'],
      inputs: {
        type: 'object',
        properties: { brief: { type: 'string' }, topic: { type: 'string' } }
      },
      expectedCost: 0.06,
      expectedLatencyMs: 30000,
      reliability: 0.92,
      failureModes: ['LLM timeout', 'invalid markup'],
      handler: (input) => siteFactory.generateLandingPage(input),
      isAvailable: present(siteFactory, 'generateLandingPage')
    },
    {
      capabilityId: 'site.deploy',
      name: 'Deploy a site',
      provider: 'deployment-integration',
      mcpTool: 'invoke_capability',
      permissions: ['deploy'],
      inputs: {
        type: 'object',
        properties: { projectId: { type: 'string' } },
        required: ['projectId']
      },
      expectedCost: 0,
      expectedLatencyMs: 45000,
      reliability: 0.93,
      // Production deployment is consequential per the approval layer.
      requiresApproval: true,
      failureModes: ['build failure', 'domain not verified', 'quota exceeded'],
      handler: (input) => deploymentIntegration.deployProject(input.projectId, input.options || {}),
      isAvailable: present(deploymentIntegration, 'deployProject')
    },

    // ---- Commerce and measurement ----------------------------------------
    {
      capabilityId: 'payment.checkout',
      name: 'Start a payment',
      provider: 'stripe',
      mcpTool: 'invoke_capability',
      permissions: ['payments'],
      inputs: {
        type: 'object',
        properties: { amount: { type: 'number' }, currency: { type: 'string' } },
        required: ['amount']
      },
      expectedCost: 0,
      expectedLatencyMs: 1200,
      reliability: 0.99,
      requiresApproval: true,
      failureModes: ['card declined', 'currency unsupported', 'idempotency conflict'],
      handler: (input) => paymentIntegration.createPaymentIntent(input),
      isAvailable: present(paymentIntegration, 'createPaymentIntent')
    },
    {
      capabilityId: 'analytics.query',
      name: 'Query analytics',
      provider: 'analytics-engine',
      mcpTool: 'get_analytics',
      permissions: ['data.read'],
      inputs: { type: 'object', properties: { metric: { type: 'string' } } },
      expectedCost: 0,
      expectedLatencyMs: 700,
      reliability: 0.97,
      failureModes: ['no data for range', 'upstream API unavailable'],
      handler: (input) => analyticsEngine.getConversionMetrics(input),
      isAvailable: present(analyticsEngine, 'getConversionMetrics')
    },
    {
      capabilityId: 'knowledge.search',
      name: 'Search the knowledge base',
      provider: 'knowledge-factory',
      mcpTool: 'search_knowledge',
      permissions: ['data.read'],
      inputs: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query']
      },
      expectedCost: 0.0005,
      expectedLatencyMs: 600,
      reliability: 0.96,
      failureModes: ['empty index', 'embedding provider down'],
      handler: (input) => knowledgeFactory.searchKnowledge(input.query, input.options || {}),
      isAvailable: present(knowledgeFactory, 'searchKnowledge')
    },

    // ---- Voice ------------------------------------------------------------
    {
      capabilityId: 'speech.transcribe',
      name: 'Transcribe speech to text',
      provider: 'deepgram',
      mcpTool: 'invoke_capability',
      permissions: ['media.process'],
      inputs: { type: 'object', properties: { mimeType: { type: 'string' } } },
      expectedCost: 0.004,
      expectedLatencyMs: 2000,
      reliability: 0.96,
      failureModes: ['unsupported codec', 'silent audio', 'auth failure'],
      handler: (input) => voice.speechToText(input.audioBuffer, input.mimeType || 'audio/ogg'),
      isAvailable: present(voice, 'speechToText')
    },
    {
      capabilityId: 'speech.synthesize',
      name: 'Synthesize speech from text',
      provider: 'deepgram',
      mcpTool: 'invoke_capability',
      permissions: ['media.process'],
      inputs: {
        type: 'object',
        properties: { text: { type: 'string' }, format: { type: 'string', enum: ['ogg', 'wav'] } },
        required: ['text']
      },
      expectedCost: 0.003,
      expectedLatencyMs: 1800,
      reliability: 0.96,
      failureModes: ['text over 2000 characters', 'auth failure'],
      handler: (input) =>
        voice.textToSpeech(input.text, { voice: input.voice, format: input.format || 'ogg' }),
      isAvailable: present(voice, 'textToSpeech')
    }
  ];

  registry.registerAll(descriptors);

  const stats = registry.getStats();
  logger.info(
    `🔧 Capability registry ready: ${stats.capabilities} capabilities, ` +
    `${stats.availableCapabilities} currently available`
  );

  return registry;
}
