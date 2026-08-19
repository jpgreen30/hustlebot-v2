/**
 * Register Day-3/Day-4 intelligence, qualification, and gated outreach capabilities.
 * Does not alter Day-1 platform bindings.
 */

import logger from '../utils/logger.js';
import { qualifyProspect, qualifyProspects } from './qualify.js';
import { scoreProspect, rankProspects } from './score.js';
import { attachValidation, validateEmail, validatePhone } from './validation.js';
import { resolveContacts } from './identity.js';
import { attachContactScores, scoreContact, combinedPriority } from './contact-score.js';
import { planOutreach } from '../outreach/plan.js';

export function registerIntelligenceCapabilities(registry, services = {}) {
  const {
    browserProvider,
    companyResearcher,
    contactDiscovery,
    intelligenceEngine,
    outreachExecutor,
    apolloProvider,
    enrichmentRouter,
    emailValidator,
    phoneValidator,
    emailProvider,
    campaignOrchestrator
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
      description: 'Role-targeted discovery. Does not invent names, emails, or titles',
      provider: 'public-web',
      permissions: ['network.read'],
      inputs: {
        type: 'object',
        properties: {
          organization: { type: 'string' },
          organizationName: { type: 'string' },
          website: { type: 'string' },
          contactPage: { type: 'string' },
          objective: { type: 'string' },
          targetRoles: { type: 'array' },
          qualificationProfile: { type: 'string' }
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
      name: 'Enrich a prospect via the provider registry',
      description: 'Configurable PUBLIC_WEB → APOLLO router. Unavailable providers stay unavailable.',
      provider: 'enrichment-router',
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
      isAvailable: () => Boolean(enrichmentRouter?.isAvailable?.() || apolloProvider?.isAvailable?.())
    },
    {
      capabilityId: 'contact.resolve',
      name: 'Resolve duplicate people across providers',
      description: 'Strong identity keys only. Never merge on weak name similarity.',
      provider: 'identity',
      permissions: ['data.read'],
      inputs: {
        type: 'object',
        properties: { contacts: { type: 'array' } },
        required: ['contacts']
      },
      expectedCost: 0,
      expectedLatencyMs: 20,
      reliability: 0.99,
      handler: async (input) => resolveContacts(input.contacts || []),
      isAvailable: () => true
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
      capabilityId: 'email.validate',
      name: 'Validate an email address',
      description: 'Syntax check unless a validation provider is configured. Never claims VALIDATED without a provider.',
      provider: 'validation',
      permissions: ['data.read'],
      inputs: {
        type: 'object',
        properties: { email: { type: 'string' } },
        required: ['email']
      },
      expectedCost: 0,
      expectedLatencyMs: 40,
      reliability: 0.99,
      handler: async (input) => {
        if (emailValidator?.validate) return emailValidator.validate(input.email, input);
        return validateEmail(input.email, input);
      },
      isAvailable: () => true
    },
    {
      capabilityId: 'phone.validate',
      name: 'Validate a phone number',
      description: 'E.164 format check. Does not claim deliverability.',
      provider: 'validation',
      permissions: ['data.read'],
      inputs: {
        type: 'object',
        properties: { phone: { type: 'string' } },
        required: ['phone']
      },
      expectedCost: 0,
      expectedLatencyMs: 40,
      reliability: 0.99,
      handler: async (input) => {
        if (phoneValidator?.validate) return phoneValidator.validate(input.phone, input);
        return validatePhone(input.phone, input);
      },
      isAvailable: () => true
    },
    {
      capabilityId: 'contact.score',
      name: 'Score contact quality',
      description: 'Explainable contactability score, not company qualification',
      provider: 'intelligence-engine',
      permissions: ['data.read'],
      inputs: {
        type: 'object',
        properties: { contact: { type: 'object' }, prospect: { type: 'object' } }
      },
      expectedCost: 0,
      expectedLatencyMs: 30,
      reliability: 0.99,
      handler: async (input) => {
        if (input.prospect) return attachContactScores(input.prospect, input);
        return scoreContact(input.contact || input, input);
      },
      isAvailable: () => true
    },
    {
      capabilityId: 'prospect.priority',
      name: 'Combined outreach priority',
      description: 'Company fit + contact quality + objective relevance',
      provider: 'intelligence-engine',
      permissions: ['data.read'],
      inputs: {
        type: 'object',
        properties: { prospect: { type: 'object' }, contact: { type: 'object' } },
        required: ['prospect']
      },
      expectedCost: 0,
      expectedLatencyMs: 30,
      reliability: 0.99,
      handler: async (input) => combinedPriority(input.prospect, input.contact || input.prospect.contacts?.[0] || {}, input),
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
      capabilityId: 'campaign.control',
      name: 'Inspect or control a prepared campaign',
      description: 'Show, rank, pause, resume. Start outreach cannot bypass ApprovalGate.',
      provider: 'intelligence-engine',
      permissions: ['data.read'],
      inputs: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          action: { type: 'string' },
          campaignId: { type: 'string' }
        }
      },
      expectedCost: 0,
      expectedLatencyMs: 40,
      reliability: 0.99,
      handler: (input) => intelligenceEngine.control({ ...input, action: input.action || input.query }),
      isAvailable: ready(intelligenceEngine, 'control')
    },
    {
      capabilityId: 'campaign.orchestrate',
      name: 'Run deterministic campaign orchestration',
      description: 'n8n records the sequence. Discovered prospects are not contacted.',
      provider: 'n8n',
      permissions: ['external.send'],
      inputs: {
        type: 'object',
        properties: { campaignId: { type: 'string' }, approvalId: { type: 'string' } }
      },
      expectedCost: 0.01,
      expectedLatencyMs: 4000,
      reliability: 0.9,
      requiresApproval: true,
      handler: (input) => campaignOrchestrator.run(input),
      isAvailable: ready(campaignOrchestrator, 'run')
    },
    {
      capabilityId: 'outreach.execute',
      name: 'Execute an approved outreach campaign',
      description: 'Fail-closed without ApprovalGate. Discovered prospects stay uncontacted.',
      provider: 'outreach',
      permissions: ['external.send'],
      inputs: {
        type: 'object',
        properties: {
          approvalId: { type: 'string' },
          campaignId: { type: 'string' },
          contactDiscoveredProspects: { type: 'boolean' },
          authorizedTest: { type: 'boolean' }
        }
      },
      expectedCost: 0.1,
      expectedLatencyMs: 5000,
      reliability: 0.9,
      requiresApproval: true,
      failureModes: ['approval missing', 'approval pending', 'discovered contact blocked'],
      handler: (input) => outreachExecutor.execute(input),
      isAvailable: ready(outreachExecutor, 'execute')
    },
    {
      capabilityId: 'outreach.call',
      name: 'Place an approved campaign call',
      description: 'Uses Day-1 voice.call / Retell. Only the authorized self-test number is allowed.',
      provider: 'outreach',
      permissions: ['external.send', 'telephony'],
      inputs: {
        type: 'object',
        properties: {
          approvalId: { type: 'string' },
          phoneNumber: { type: 'string' },
          script: { type: 'string' },
          campaignId: { type: 'string' },
          prospectId: { type: 'string' },
          contactId: { type: 'string' }
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
      description: 'Provider-abstracted email. Only authorized test destinations may be sent.',
      provider: 'outreach',
      permissions: ['external.send'],
      inputs: {
        type: 'object',
        properties: {
          approvalId: { type: 'string' },
          to: { type: 'string' },
          subject: { type: 'string' },
          body: { type: 'string' },
          campaignId: { type: 'string' },
          prospectId: { type: 'string' },
          contactId: { type: 'string' },
          executionId: { type: 'string' }
        },
        required: ['approvalId']
      },
      expectedCost: 0.0004,
      expectedLatencyMs: 900,
      reliability: 0.9,
      requiresApproval: true,
      handler: async (input) => {
        if (outreachExecutor?.sendEmail) return outreachExecutor.sendEmail(input);
        if (emailProvider?.send) {
          return {
            status: 'blocked',
            error: 'email send requires ApprovalGate via outreach.execute/sendEmail'
          };
        }
        return {
          status: 'unavailable',
          error: 'EMAIL OUTREACH: UNAVAILABLE',
          reason: 'No production email provider is configured'
        };
      },
      isAvailable: () => Boolean(outreachExecutor?.sendEmail || emailProvider?.isAvailable?.())
    }
  ];

  registry.registerAll(descriptors);
  logger.info(`🔧 Intelligence capabilities registered (${descriptors.length} bindings)`);
  return registry;
}
