import logger from '../utils/logger.js';
import { researchBatch, contactsBatch } from './discover.js';

export function registerObjectiveCapabilities(registry, services = {}) {
  const {
    orgDiscovery,
    companyResearcher,
    contactDiscovery,
    macgyverEngine
  } = services;

  const ready = (service, method) =>
    () => Boolean(service && typeof service[method] === 'function');

  registry.registerAll([
    {
      capabilityId: 'org.discover',
      name: 'Discover organizations from a directory or search',
      description: 'Browser extract when a URL is present, otherwise web search. Does not contact anyone.',
      provider: 'macgyver',
      permissions: ['network.read'],
      tags: ['discover'],
      sideEffect: 'READ_ONLY',
      inputs: {
        type: 'object',
        properties: {
          sourceUrl: { type: 'string' },
          url: { type: 'string' },
          query: { type: 'string' },
          objective: { type: 'string' },
          maxOrganizations: { type: 'number' }
        }
      },
      expectedCost: 0.002,
      expectedLatencyMs: 12000,
      reliability: 0.84,
      handler: (input, context) => orgDiscovery.discover(input, context),
      isAvailable: () => Boolean(orgDiscovery?.isAvailable?.())
    },
    {
      capabilityId: 'company.research.batch',
      name: 'Research a list of companies',
      description: 'Maps company.research across discovered organizations',
      provider: 'public-web',
      permissions: ['network.read'],
      tags: ['research'],
      sideEffect: 'READ_ONLY',
      inputs: {
        type: 'object',
        properties: {
          prospects: { type: 'array' },
          organizations: { type: 'array' }
        }
      },
      expectedCost: 0.01,
      expectedLatencyMs: 25000,
      reliability: 0.8,
      handler: async (input) => {
        const list = input.prospects || input.organizations || [];
        const prospects = await researchBatch(companyResearcher, list);
        return { status: 'ok', prospects, providers: ['public-web'], fabricated: false };
      },
      isAvailable: ready(companyResearcher, 'research')
    },
    {
      capabilityId: 'contact.discover.batch',
      name: 'Discover decision makers for a list of companies',
      description: 'Maps contact.discover. Public web first, Apollo through the same capability.',
      provider: 'public-web',
      permissions: ['network.read'],
      tags: ['contacts'],
      sideEffect: 'READ_ONLY',
      inputs: {
        type: 'object',
        properties: {
          prospects: { type: 'array' },
          objective: { type: 'string' },
          qualificationProfile: { type: 'string' }
        }
      },
      expectedCost: 0.02,
      expectedLatencyMs: 30000,
      reliability: 0.7,
      handler: async (input, context) => {
        const list = input.prospects || [];
        const prospects = await contactsBatch(contactDiscovery, list, {
          objective: input.objective,
          qualificationProfile: input.qualificationProfile,
          skipApollo: context?.skipApollo === true,
          enrichPeople: input.enrichPeople || context?.enrichPeople || 0
        });
        return { status: 'ok', prospects, providers: ['public-web', 'apollo'], fabricated: false };
      },
      isAvailable: ready(contactDiscovery, 'discover')
    },
    {
      capabilityId: 'objective.report',
      name: 'Summarize ranked objective results',
      description: 'Produces the top-N report. Never contacts anyone.',
      provider: 'macgyver',
      permissions: ['data.read'],
      tags: ['report'],
      sideEffect: 'READ_ONLY',
      inputs: {
        type: 'object',
        properties: {
          prospects: { type: 'array' },
          topN: { type: 'number' },
          objective: { type: 'string' }
        }
      },
      expectedCost: 0,
      expectedLatencyMs: 20,
      reliability: 0.99,
      handler: async (input) => {
        const prospects = Array.isArray(input.prospects) ? input.prospects : [];
        const topN = Number(input.topN || 5);
        const top = prospects.slice(0, topN);
        const people = prospects.flatMap((p) => p.contacts || []);
        const report = [
          `${prospects.length} companies researched. ${people.length} named contacts.`,
          ...top.map((p, i) => {
            const score = p.score?.total ?? p.priority?.total ?? 'n/a';
            const person = p.contact?.fullName || p.contacts?.[0]?.fullName || 'no person';
            return `#${i + 1} ${p.organizationName || p.name} · score ${score} · ${person}`;
          }),
          'Discovered prospects contacted: 0.'
        ].join('\n');
        return { status: 'ok', prospects, top, contacts: people.length, report, contacted: false };
      },
      isAvailable: () => true
    },
    {
      capabilityId: 'objective.run',
      name: 'Run a MacGyver objective',
      description: 'Interpret, plan from the catalogue, execute, observe, recover. Not a mega-pipeline.',
      provider: 'macgyver',
      permissions: ['network.read', 'data.write'],
      tags: ['objective'],
      sideEffect: 'LOW_RISK_WRITE',
      inputs: {
        type: 'object',
        properties: {
          objective: { type: 'string' },
          rawRequest: { type: 'string' },
          sourceUrl: { type: 'string' },
          maxOrganizations: { type: 'number' }
        }
      },
      expectedCost: 0.05,
      expectedLatencyMs: 90000,
      reliability: 0.8,
      handler: (input) => macgyverEngine.run(input),
      isAvailable: ready(macgyverEngine, 'run')
    },
    {
      capabilityId: 'objective.control',
      name: 'Inspect or control a running objective',
      description: 'Status, plan, stop, resume, explain',
      provider: 'macgyver',
      permissions: ['data.read'],
      tags: ['objective'],
      sideEffect: 'READ_ONLY',
      inputs: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          query: { type: 'string' },
          objectiveId: { type: 'string' }
        }
      },
      expectedCost: 0,
      expectedLatencyMs: 40,
      reliability: 0.99,
      handler: (input) => macgyverEngine.control(input),
      isAvailable: ready(macgyverEngine, 'control')
    }
  ]);

  logger.info('✅ MacGyver objective capabilities registered');
}
