/**
 * Register provider-independent acquisition capabilities.
 * Services that are not wired stay registered-but-unavailable.
 */

import logger from '../utils/logger.js';

export function registerAcquisitionCapabilities(registry, services = {}) {
  const {
    firecrawlProvider,
    spiderProvider,
    webSearchProvider,
    acquisitionEngine,
    acquisitionStore,
    prospectEnricher
  } = services;

  const present = (service, method) =>
    () => Boolean(service && typeof service[method] === 'function');

  const ready = (service, method) =>
    () => {
      if (!service || typeof service[method] !== 'function') return false;
      if (typeof service.isAvailable === 'function') return service.isAvailable() !== false;
      if (typeof service.isReady === 'function') return service.isReady() !== false;
      return true;
    };

  const descriptors = [
    {
      capabilityId: 'web.fetch',
      name: 'Fetch a public URL',
      description: 'HTTP GET a public page without rendering',
      provider: 'custom-spider',
      permissions: ['network.read'],
      inputs: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url']
      },
      expectedCost: 0,
      expectedLatencyMs: 2000,
      reliability: 0.93,
      failureModes: ['timeout', 'http error', 'robots.txt'],
      handler: (input) => spiderProvider.fetchPage(input.url, input),
      isAvailable: present(spiderProvider, 'fetchPage')
    },
    {
      capabilityId: 'web.scrape',
      name: 'Scrape a web page via Firecrawl',
      description: 'Real Firecrawl scrape of a single URL',
      provider: 'firecrawl',
      permissions: ['network.read'],
      inputs: {
        type: 'object',
        properties: { url: { type: 'string' }, options: { type: 'object' } },
        required: ['url']
      },
      expectedCost: 0.002,
      expectedLatencyMs: 5000,
      reliability: 0.9,
      failureModes: ['auth', 'timeout', 'blocked'],
      fallbackProvider: 'custom-spider',
      handler: (input) => firecrawlProvider.scrape(input.url, input.options || input),
      isAvailable: ready(firecrawlProvider, 'scrape')
    },
    {
      capabilityId: 'web.scrape',
      name: 'Scrape a web page via custom spider',
      description: 'Direct public-web fetch and extract',
      provider: 'custom-spider',
      permissions: ['network.read'],
      inputs: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url']
      },
      expectedCost: 0,
      expectedLatencyMs: 2500,
      reliability: 0.88,
      failureModes: ['timeout', 'js-only page', 'robots.txt'],
      handler: (input) => spiderProvider.scrape(input.url, input.options || input),
      isAvailable: present(spiderProvider, 'scrape')
    },
    {
      capabilityId: 'web.crawl',
      name: 'Crawl a site via Firecrawl',
      provider: 'firecrawl',
      permissions: ['network.read'],
      inputs: {
        type: 'object',
        properties: { url: { type: 'string' }, maxPages: { type: 'number' } },
        required: ['url']
      },
      expectedCost: 0.02,
      expectedLatencyMs: 30000,
      reliability: 0.86,
      fallbackProvider: 'custom-spider',
      handler: (input) => firecrawlProvider.crawl(input.url, input),
      isAvailable: ready(firecrawlProvider, 'crawl')
    },
    {
      capabilityId: 'web.crawl',
      name: 'Crawl a site via custom spider',
      provider: 'custom-spider',
      permissions: ['network.read'],
      inputs: {
        type: 'object',
        properties: { url: { type: 'string' }, maxPages: { type: 'number' }, maxDepth: { type: 'number' } },
        required: ['url']
      },
      expectedCost: 0,
      expectedLatencyMs: 20000,
      reliability: 0.84,
      handler: (input) => spiderProvider.crawl(input.url, input),
      isAvailable: present(spiderProvider, 'crawl')
    },
    {
      capabilityId: 'web.search',
      name: 'Search the public web',
      provider: 'web-search',
      permissions: ['network.read'],
      inputs: {
        type: 'object',
        properties: { query: { type: 'string' }, limit: { type: 'number' } },
        required: ['query']
      },
      expectedCost: 0.001,
      expectedLatencyMs: 3000,
      reliability: 0.9,
      handler: (input) => webSearchProvider.search(input.query, input),
      isAvailable: present(webSearchProvider, 'search')
    },
    {
      capabilityId: 'web.extract',
      name: 'Extract structured data from a URL',
      provider: 'firecrawl',
      permissions: ['network.read'],
      inputs: {
        type: 'object',
        properties: { url: { type: 'string' }, schema: { type: 'object' } },
        required: ['url']
      },
      expectedCost: 0.01,
      expectedLatencyMs: 8000,
      reliability: 0.85,
      fallbackProvider: 'custom-spider',
      handler: (input) => firecrawlProvider.extract(input.url, input.schema, input),
      isAvailable: ready(firecrawlProvider, 'extract')
    },
    {
      capabilityId: 'prospect.discover',
      name: 'Discover prospects from a public source',
      provider: 'acquisition-engine',
      permissions: ['network.read'],
      inputs: {
        type: 'object',
        properties: {
          objective: { type: 'string' },
          sourceUrl: { type: 'string' },
          url: { type: 'string' },
          query: { type: 'string' },
          maxPages: { type: 'number' },
          maxOrganizations: { type: 'number' }
        }
      },
      expectedCost: 0.02,
      expectedLatencyMs: 45000,
      reliability: 0.86,
      handler: (input) => acquisitionEngine.run({ ...input, skipWorkflow: input.skipWorkflow !== false }),
      isAvailable: ready(acquisitionEngine, 'run')
    },
    {
      capabilityId: 'prospect.normalize',
      name: 'Normalize prospect records',
      provider: 'acquisition-engine',
      permissions: ['data.write'],
      inputs: {
        type: 'object',
        properties: { prospects: { type: 'array' } },
        required: ['prospects']
      },
      expectedCost: 0,
      expectedLatencyMs: 200,
      reliability: 0.99,
      handler: async (input) => {
        const { normalizeProspect } = await import('./normalize.js');
        return { prospects: input.prospects.map(normalizeProspect) };
      },
      isAvailable: () => true
    },
    {
      capabilityId: 'prospect.dedupe',
      name: 'Deduplicate prospect records',
      provider: 'acquisition-engine',
      permissions: ['data.write'],
      inputs: {
        type: 'object',
        properties: { prospects: { type: 'array' } },
        required: ['prospects']
      },
      expectedCost: 0,
      expectedLatencyMs: 200,
      reliability: 0.99,
      handler: async (input) => {
        const { dedupeProspects } = await import('./dedupe.js');
        return dedupeProspects(input.prospects);
      },
      isAvailable: () => true
    },
    {
      capabilityId: 'prospect.enrich',
      name: 'Enrich prospects from public web data',
      provider: 'public-web',
      permissions: ['network.read', 'data.write'],
      inputs: {
        type: 'object',
        properties: { prospects: { type: 'array' } },
        required: ['prospects']
      },
      expectedCost: 0.005,
      expectedLatencyMs: 15000,
      reliability: 0.8,
      handler: (input) => prospectEnricher.enrich(input.prospects, input),
      isAvailable: present(prospectEnricher, 'enrich')
    },
    {
      capabilityId: 'prospect.store',
      name: 'Persist prospects and acquisition runs',
      provider: 'acquisition-store',
      permissions: ['data.write'],
      inputs: {
        type: 'object',
        properties: { runId: { type: 'string' }, prospects: { type: 'array' } },
        required: ['runId', 'prospects']
      },
      expectedCost: 0,
      expectedLatencyMs: 200,
      reliability: 0.99,
      handler: (input) => ({
        runId: input.runId,
        stored: acquisitionStore.saveProspects(input.runId, input.prospects)
      }),
      isAvailable: present(acquisitionStore, 'saveProspects')
    },
    {
      capabilityId: 'acquisition.run',
      name: 'Run the full acquisition pipeline',
      description: 'Discover, scrape, extract, normalize, dedupe, enrich, store, and hand off to n8n',
      provider: 'acquisition-engine',
      permissions: ['network.read', 'data.write', 'external.send'],
      inputs: {
        type: 'object',
        properties: {
          objective: { type: 'string' },
          sourceUrl: { type: 'string' },
          url: { type: 'string' },
          query: { type: 'string' },
          maxPages: { type: 'number' },
          maxOrganizations: { type: 'number' },
          workflowAlias: { type: 'string' }
        }
      },
      expectedCost: 0.03,
      expectedLatencyMs: 60000,
      reliability: 0.85,
      failureModes: ['no seed url', 'pages blocked', 'workflow failed'],
      handler: (input) => acquisitionEngine.run(input),
      isAvailable: ready(acquisitionEngine, 'run')
    }
  ];

  registry.registerAll(descriptors);
  logger.info(`🔧 Acquisition capabilities registered (${descriptors.length} bindings)`);
  return registry;
}
