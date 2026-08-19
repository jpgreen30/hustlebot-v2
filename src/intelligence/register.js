/**
 * Register Day-3 intelligence, qualification, and gated outreach capabilities.
 * Does not alter Day-1 platform bindings.
 */

import logger from '../utils/logger.js';
import { qualifyProspect, qualifyProspects } from './qualify.js';
import { scoreProspect, rankProspects } from './score.js';
import { attachValidation, validateEmail, validatePhone } from './validation.js';
import { planOutreach } from '../outreach/plan.js';

export function registerIntelligenceCapabilities(registry, services = {}) {
  const {
    browserProvider,
    companyResearcher,
    contactDiscovery,
    intelligenceEngine,
    outreachExecutor,
    apolloProvider,
    enrichmentRouter
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
      capabilityId: 'web.render',
      name: 'Render a public JS page or its public structured data',
      description: 'Extract records from browser-rendered public directories without bypassing controls',
      provider: 'browser-render',
      permissions: ['network.read'],
      inputs: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          maxRecords: { type: 'number' },
          waitFor: { type: 'number' }
        },
        required: ['url']
      },
      expectedCost: 0.002,
      expectedLatencyMs: 8000,
      reliability: 0.88,
      failureModes: ['no public widget', 'timeout', 'directory empty'],
      handler: (input) => browserProvider.render(input.url, input),
      isAvailable: present(browserProvider, 'render')
    },
    {
      capabilityId: 'web.browser.extract',
      name: 'Extract organizations from a JS-rendered public directory',
      description: 'Normalized extraction from rendered or public structured directory data',
      provider: 'browser-render',
      permissions: ['network.read'],
      inputs: {
        type: 'object',
        properties: { url: { type: 'string' }, maxRecords: { type: 'number' } },
        required: ['url']
      },
      expectedCost: 0.002,
      expectedLatencyMs: 8000,
      reliability: 0.88,
      handler: (input) => browserProvider.render(input.url || input.sourceUrl, input),
      isAvailable: present(browserProvider, 'render')
    },
    {
      capabilityId: 'company.research',
      name: 'Research a company from public sources',
      description: 'Public-web company intelligence with VERIFIED / INFERRED / UNKNOWN fields',
      provider: 'public-web',
      permissions: ['network.read'],
      inputs: {
        type: 'object',
        properties: {
          organizationName: { type: 'string' },
          website: { type: 'string' },
          domain: { type: 'string' }
        }
      },
      expectedCost: 0.001,
      expectedLatencyMs: 8000,
      reliability: 0.82,
      handler: (input) => companyResearcher.research(input),
      isAvailable: ready(companyResearcher, 'research')
    },
    {
      capabilityId: 'contact.discover',
      name: 'Discover publicly listed decision makers',
      description: 'Does not invent names, emails, or titles',
      provider: 'public-web',
      permissions: ['network.read'],
      inputs: {
        type: 'object',
        properties: {
          organizationName: { type: 'string' },
          website: { type: 'string' },
          contactPage: { type: 'string' }
        }
      },
      expectedCost: 0.001,
      expectedLatencyMs: 10000,
      reliability: 0.7,
      handler: (input) => contactDiscovery.discover(input),
      isAvailable: ready(contactDiscovery, 'discover')
    },
    {
      capabilityId: 'prospect.enrich',
      name: 'Enrich a prospect via Apollo',
      description: 'Optional Apollo enrichment. Unavailable when no credentials are configured.',
      provider: 'apollo',
      permissions: ['network.read', 'data.write'],
      inputs: {
        type: 'object',
        properties: { prospects: { type: 'array' }, domain: { type: 'string' } }
      },
      expectedCost: 0.03,
      expectedLatencyMs: 4000,
      reliability: 0.8,
      handler: (input) => {
        if (enrichmentRouter?.enrich) return enrichmentRouter.enrich(input.prospects || [input], input);
        return apolloProvider.enrich(input);
      },
      isAvailable: ready(apolloProvider, 'enrich')
    },
    {
      capabilityId: 'contact.validate',
      name: 'Validate contact format and provider status',
      description: 'Format checks are not real-world validation',
      provider: 'validation',
      permissions: ['data.read'],
      inputs: {
        type: 'object',
        properties: { email: { type: 'string' }, phone: { type: 'string' }, prospect: { type: 'object' } }
      },
      expectedCost: 0,
      expectedLatencyMs: 50,
      reliability: 0.99,
      handler: async (input) => {
        if (input.prospect) return attachValidation(input.prospect);
        return {
          email: validateEmail(input.email, input),
          phone: validatePhone(input.phone, input)
        };
      },
      isAvailable: () => true
    },
    {
      capabilityId: 'prospect.qualify',
      name: 'Qualify a prospect against a profile',
      description: 'Objective-driven qualification. Profiles are configuration.',
      provider: 'intelligence-engine',
      permissions: ['data.read'],
      inputs: {
        type: 'object',
        properties: {
          prospect: { type: 'object' },
          prospects: { type: 'array' },
          objective: { type: 'string' },
          qualificationProfile: { type: 'string' },
          profileId: { type: 'string' }
        }
      },
      expectedCost: 0,
      expectedLatencyMs: 50,
      reliability: 0.99,
      handler: async (input) => {
        if (Array.isArray(input.prospects)) {
          return { prospects: qualifyProspects(input.prospects, input) };
        }
        return qualifyProspect(input.prospect || input, input);
      },
      isAvailable: () => true
    },
    {
      capabilityId: 'prospect.score',
      name: 'Score and rank prospects',
      description: 'Explainable 0–100 component scores',
      provider: 'intelligence-engine',
      permissions: ['data.read'],
      inputs: {
        type: 'object',
        properties: {
          prospect: { type: 'object' },
          prospects: { type: 'array' },
          topN: { type: 'number' }
        }
      },
      expectedCost: 0,
      expectedLatencyMs: 50,
      reliability: 0.99,
      handler: async (input) => {
        if (Array.isArray(input.prospects)) {
          return { prospects: rankProspects(input.prospects, input.topN || 20) };
        }
        return scoreProspect(input.prospect || input);
      },
      isAvailable: () => true
    },
    {
      capabilityId: 'outreach.plan',
      name: 'Generate a grounded outreach plan',
      description: 'PLAN is not SEND. Personalization uses only discovered facts.',
      provider: 'outreach',
      permissions: ['data.read'],
      inputs: {
        type: 'object',
        properties: { prospect: { type: 'object' }, objective: { type: 'string' } },
        required: ['prospect']
      },
      expectedCost: 0,
      expectedLatencyMs: 50,
      reliability: 0.99,
      handler: async (input) => planOutreach(input.prospect, input),
      isAvailable: () => true
    },
    {
      capabilityId: 'campaign.prepare',
      name: 'Prepare an outreach campaign',
      description: 'Discover, research, qualify, score, plan, request approval. Does not contact anyone.',
      provider: 'intelligence-engine',
      permissions: ['network.read', 'data.write', 'external.send'],
      inputs: {
        type: 'object',
        properties: {
          objective: { type: 'string' },
          sourceUrl: { type: 'string' },
          url: { type: 'string' },
          maxOrganizations: { type: 'number' },
          topN: { type: 'number' },
          qualificationProfile: { type: 'string' },
          workflowAlias: { type: 'string' }
        }
      },
      expectedCost: 0.05,
      expectedLatencyMs: 90000,
      reliability: 0.84,
      failureModes: ['directory empty', 'workflow failed', 'approval store down'],
      handler: (input) => intelligenceEngine.prepare(input),
      isAvailable: ready(intelligenceEngine, 'prepare')
    },
    {
      capabilityId: 'outreach.execute',
      name: 'Execute an approved outreach campaign',
      description: 'Fail-closed without ApprovalGate. Day-3 refuses contacting discovered prospects.',
      provider: 'outreach',
      permissions: ['external.send'],
      inputs: {
        type: 'object',
        properties: {
          approvalId: { type: 'string' },
          campaignId: { type: 'string' },
          contactDiscoveredProspects: { type: 'boolean' }
        }
      },
      expectedCost: 0.1,
      expectedLatencyMs: 5000,
      reliability: 0.9,
      requiresApproval: true,
      failureModes: ['approval missing', 'approval pending', 'day-3 contact blocked'],
      handler: (input) => outreachExecutor.execute(input),
      isAvailable: ready(outreachExecutor, 'execute')
    },
    {
      capabilityId: 'outreach.call',
      name: 'Place an approved campaign call',
      description: 'Uses Day-1 voice.call / Retell. Day-3 only allows the authorized self-test number.',
      provider: 'outreach',
      permissions: ['external.send', 'telephony'],
      inputs: {
        type: 'object',
        properties: {
          approvalId: { type: 'string' },
          phoneNumber: { type: 'string' },
          script: { type: 'string' },
          campaignId: { type: 'string' },
          prospectId: { type: 'string' }
        },
        required: ['approvalId', 'phoneNumber', 'script']
      },
      expectedCost: 0.09,
      expectedLatencyMs: 3000,
      reliability: 0.9,
      requiresApproval: true,
      handler: (input) => outreachExecutor.callAuthorizedTest(input),
      isAvailable: ready(outreachExecutor, 'callAuthorizedTest')
    },
    {
      capabilityId: 'outreach.email',
      name: 'Send an approved campaign email',
      description: 'Provider-abstracted email. Unavailable when no email provider is configured.',
      provider: 'outreach',
      permissions: ['external.send'],
      inputs: {
        type: 'object',
        properties: {
          approvalId: { type: 'string' },
          to: { type: 'string' },
          subject: { type: 'string' },
          body: { type: 'string' }
        },
        required: ['approvalId']
      },
      expectedCost: 0.0004,
      expectedLatencyMs: 900,
      reliability: 0.9,
      requiresApproval: true,
      handler: async () => ({
        status: 'unavailable',
        error: 'EMAIL OUTREACH: UNAVAILABLE',
        reason: 'No production email provider is configured for discovered-prospect outreach'
      }),
      isAvailable: () => false
    }
  ];

  registry.registerAll(descriptors);
  logger.info(`🔧 Intelligence capabilities registered (${descriptors.length} bindings)`);
  return registry;
}
