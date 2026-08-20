import { newPlanId } from './schema.js';
import { catalogueHas, isOutboundCapability, pickCapability } from './catalogue.js';

const MEGA = new Set(['campaign.prepare', 'acquisition.run', 'objective.run']);

function node(id, capabilityId, rest = {}) {
  return {
    id,
    capabilityId,
    description: rest.description || capabilityId,
    agent: rest.agent || 'macgyver',
    inputs: rest.inputs || {},
    dependsOn: rest.dependsOn || [],
    expectedOutput: rest.expectedOutput || null,
    sideEffect: rest.sideEffect || 'READ_ONLY',
    approvalState: rest.approvalState || 'not-required',
    retryPolicy: rest.retryPolicy || { max: 1, backoffMs: 400 },
    reasonSelected: rest.reasonSelected,
    status: 'pending'
  };
}

function requireCap(catalogue, ids, label) {
  const chosen = pickCapability(catalogue, ids);
  if (!chosen) {
    throw new Error(`Cannot plan ${label}: none of [${ids.join(', ')}] are available`);
  }
  return chosen;
}

export function planObjective(objective, catalogue = []) {
  const ctx = objective.context || {};
  const prohibited = new Set(objective.prohibitedCapabilities || []);
  const pattern = ctx.pattern || 'research_rank_search';
  const nodes = [];
  const reasons = [];

  const forbidMega = ctx.megaCapabilityForbidden !== false && pattern !== 'authorized_test';

  if (pattern === 'authorized_test') {
    const emailCap = pickCapability(catalogue, ['outreach.email']);
    if (!emailCap || prohibited.has('outreach.email')) {
      throw new Error('Authorized test requires outreach.email and must not be prohibited');
    }
    nodes.push(node('email', 'outreach.email', {
      description: 'Send one approved authorized-test email',
      inputs: {
        to: ctx.testEmail,
        subject: ctx.subject || 'HustleBot Day-5 authorized test',
        body: ctx.body || 'This is a HustleBot controlled MacGyver production test.',
        authorizedTest: true
      },
      sideEffect: 'EXTERNAL_SIDE_EFFECT',
      approvalState: 'required',
      reasonSelected: 'Objective requires one authorized external side effect'
    }));
    reasons.push('Authorized-test path uses outreach.email only against the allowlisted inbox.');
  } else {
    const discoverId = pattern === 'research_rank_directory'
      ? requireCap(catalogue, ['org.discover', 'web.browser.extract', 'web.render', 'web.extract'], 'directory discovery')
      : requireCap(catalogue, ['org.discover', 'web.search', 'web.scrape'], 'search discovery');

    if (forbidMega && MEGA.has(discoverId)) {
      throw new Error(`Planner refused mega-capability ${discoverId} for a research objective`);
    }

    nodes.push(node('discover', discoverId, {
      description: 'Discover organizations matching the objective',
      inputs: {
        objective: objective.rawRequest,
        sourceUrl: ctx.sourceUrl || null,
        query: ctx.query || objective.rawRequest,
        maxOrganizations: ctx.findN || 10,
        url: ctx.sourceUrl || null
      },
      reasonSelected: discoverId === 'org.discover'
        ? 'org.discover inspects the live catalogue and routes to browser extract or web search'
        : `Catalogue offered ${discoverId} for discovery`
    }));

    const researchId = requireCap(catalogue, ['company.research.batch', 'company.research'], 'company research');
    nodes.push(node('research', researchId, {
      description: 'Research each discovered company from public sources',
      dependsOn: ['discover'],
      inputs: { prospects: { $ref: 'discover.prospects' }, organizations: { $ref: 'discover.prospects' } },
      reasonSelected: 'company.research is available and the objective requires public-web intelligence'
    }));

    const contactId = requireCap(catalogue, ['contact.discover.batch', 'contact.discover'], 'contact discovery');
    nodes.push(node('contacts', contactId, {
      description: 'Find publicly listed decision makers',
      dependsOn: ['research'],
      inputs: {
        prospects: { $ref: 'research.prospects' },
        objective: objective.rawRequest,
        qualificationProfile: ctx.profileId || 'qentrax-buyer'
      },
      reasonSelected: 'contact.discover is registered; Apollo is used only through that capability'
    }));

    if (catalogueHas(catalogue, 'prospect.qualify')) {
      nodes.push(node('qualify', 'prospect.qualify', {
        description: 'Qualify prospects against the profile',
        dependsOn: ['contacts'],
        inputs: {
          prospects: { $ref: 'contacts.prospects' },
          objective: objective.rawRequest,
          qualificationProfile: ctx.profileId || 'qentrax-buyer'
        },
        reasonSelected: 'prospect.qualify is available and success criteria include ranking'
      }));
    }

    const scoreDepends = catalogueHas(catalogue, 'prospect.qualify') ? ['qualify'] : ['contacts'];
    const scoreRef = catalogueHas(catalogue, 'prospect.qualify') ? 'qualify.prospects' : 'contacts.prospects';
    if (catalogueHas(catalogue, 'prospect.score')) {
      nodes.push(node('score', 'prospect.score', {
        description: 'Score and rank prospects',
        dependsOn: scoreDepends,
        inputs: { prospects: { $ref: scoreRef }, topN: ctx.topN || 5 },
        reasonSelected: 'prospect.score produces explainable ranking without contacting anyone'
      }));
    }

    if (catalogueHas(catalogue, 'objective.report')) {
      const reportDepends = catalogueHas(catalogue, 'prospect.score') ? ['score'] : scoreDepends;
      const reportRef = catalogueHas(catalogue, 'prospect.score') ? 'score.prospects' : scoreRef;
      nodes.push(node('report', 'objective.report', {
        description: 'Summarize top results against success criteria',
        dependsOn: reportDepends,
        inputs: {
          prospects: { $ref: reportRef },
          topN: ctx.topN || 5,
          objective: objective.rawRequest
        },
        reasonSelected: 'objective.report finishes the DAG with evidence, not outreach'
      }));
    }
  }

  for (const item of nodes) {
    if (prohibited.has(item.capabilityId) || (objective.constraints?.includes('do-not-contact') && isOutboundCapability(item.capabilityId))) {
      throw new Error(`Plan violates constraint: ${item.capabilityId} is prohibited`);
    }
    if (forbidMega && MEGA.has(item.capabilityId)) {
      throw new Error(`Plan used forbidden mega-capability ${item.capabilityId}`);
    }
    reasons.push(`${item.id}: ${item.reasonSelected}`);
  }

  if (nodes.length > (objective.maxActions || 24)) {
    throw new Error(`Plan has ${nodes.length} nodes, over maxActions ${objective.maxActions}`);
  }

  return {
    planId: newPlanId(),
    version: 1,
    objectiveId: objective.objectiveId,
    pattern,
    nodes,
    reasons,
    source: 'catalogue-composer',
    createdAt: new Date().toISOString()
  };
}

export function explainPlan(plan) {
  return (plan?.nodes || []).map((n) => `- ${n.id} → ${n.capabilityId}: ${n.reasonSelected || n.description}`).join('\n');
}
