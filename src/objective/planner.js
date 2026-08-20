import { newPlanId } from './schema.js';
import { catalogueHas, isOutboundCapability, pickCapability } from './catalogue.js';

export const MEGA = new Set(['campaign.prepare', 'acquisition.run', 'objective.run', 'n8n:campaign-prepare', 'n8n:campaign-orchestrate']);

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

function reasonFor(catalogue, capabilityId, purpose) {
  const cap = catalogue.find((c) => c.capabilityId === capabilityId) || {};
  const provider = cap.preferredProvider || 'unknown';
  const health = cap.health || 'UNVERIFIED';
  const cost = cap.costClass || cap.costCategory || 'UNKNOWN';
  let text = `${purpose}: ${capabilityId} via ${provider} is ${health} and cost ${cost}`;
  if (provider === 'public-web' || cost === 'FREE' || cost === 'NEGLIGIBLE' || cost === 'LOW') {
    text += '. Cheaper public-web preferred over paid enrichment';
  }
  if (/apollo/i.test(String(provider))) {
    text += '. Paid enrichment selected because cheaper public-web was insufficient or unavailable';
  }
  return text;
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

  const forbidMega = ctx.megaCapabilityForbidden !== false && pattern !== 'authorized_test' && pattern !== 'direct_capability';

  if (pattern === 'direct_capability') {
    const timeId = pickCapability(catalogue, [
      ...catalogue.filter((c) => /public\.time$/.test(c.capabilityId)).map((c) => c.capabilityId),
      ...catalogue.filter((c) => /public\.ping$/.test(c.capabilityId)).map((c) => c.capabilityId),
      'fabric.inspect'
    ]);
    if (!timeId) throw new Error('Cannot plan lookup: no time/ping capability is available');
    nodes.push(node('lookup', timeId, {
      description: 'Direct catalogue lookup — no swarm',
      inputs: { label: 'macgyver-direct' },
      reasonSelected: `${timeId} satisfies a trivial lookup without specialists`
    }));
    reasons.push('Direct capability path: zero specialists.');
  } else if (pattern === 'authorized_test') {
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
        url: ctx.sourceUrl || null,
        location: ctx.location || null,
        industry: ctx.industry || null
      },
      reasonSelected: reasonFor(catalogue, discoverId, 'discovery')
    }));

    const researchId = requireCap(catalogue, ['company.research.batch', 'company.research'], 'company research');
    nodes.push(node('research', researchId, {
      description: 'Research each discovered company from public sources',
      dependsOn: ['discover'],
      inputs: { prospects: { $ref: 'discover.prospects' }, organizations: { $ref: 'discover.prospects' } },
      reasonSelected: reasonFor(catalogue, researchId, 'company research')
    }));

    const landscape = /(apps?\b|platforms?\b|competitive landscape|parenting)/i.test(objective.rawRequest || '');

    let lastRef = 'research.prospects';
    let lastDepends = ['research'];

    if (!landscape) {
      const contactId = requireCap(catalogue, ['contact.discover.batch', 'contact.discover'], 'contact discovery');
      nodes.push(node('contacts', contactId, {
        description: 'Find publicly listed decision makers',
        dependsOn: ['research'],
        inputs: {
          prospects: { $ref: 'research.prospects' },
          objective: objective.rawRequest,
          qualificationProfile: ctx.profileId || 'qentrax-buyer'
        },
        reasonSelected: reasonFor(catalogue, contactId, 'contact discovery')
      }));
      lastRef = 'contacts.prospects';
      lastDepends = ['contacts'];

      if (catalogueHas(catalogue, 'prospect.qualify')) {
        nodes.push(node('qualify', 'prospect.qualify', {
          description: 'Qualify prospects against the profile',
          dependsOn: ['contacts'],
          inputs: {
            prospects: { $ref: 'contacts.prospects' },
            objective: objective.rawRequest,
            qualificationProfile: ctx.profileId || 'qentrax-buyer'
          },
          reasonSelected: reasonFor(catalogue, 'prospect.qualify', 'qualification')
        }));
        lastRef = 'qualify.prospects';
        lastDepends = ['qualify'];
      }

      if (catalogueHas(catalogue, 'prospect.score')) {
        nodes.push(node('score', 'prospect.score', {
          description: 'Score and rank prospects',
          dependsOn: lastDepends,
          inputs: { prospects: { $ref: lastRef }, topN: ctx.topN || 5 },
          reasonSelected: reasonFor(catalogue, 'prospect.score', 'ranking')
        }));
        lastRef = 'score.prospects';
        lastDepends = ['score'];
      }
    } else {
      reasons.push('Landscape/app/platform research skips lead-buyer qualification so products are not dropped as non-Qentrax leads.');
    }

    if (catalogueHas(catalogue, 'objective.report')) {
      nodes.push(node('report', 'objective.report', {
        description: 'Summarize top results against success criteria',
        dependsOn: lastDepends,
        inputs: {
          prospects: { $ref: lastRef },
          topN: ctx.topN || 5,
          objective: objective.rawRequest
        },
        reasonSelected: reasonFor(catalogue, 'objective.report', 'report')
      }));
    }

    const wantsCompare = (objective.successCriteria || []).some((s) => s.type === 'comparison');
    const compareCap = wantsCompare
      ? catalogue.find((c) => c.available !== false && /public\.compare/.test(c.capabilityId))
      : null;
    if (compareCap && catalogueHas(catalogue, 'objective.report')) {
      nodes.push(node('compare', compareCap.capabilityId, {
        description: 'Compare researched organizations using a discovered read-only tool',
        dependsOn: ['report'],
        inputs: { organizations: { $ref: 'report.top' } },
        reasonSelected: reasonFor(catalogue, compareCap.capabilityId, 'comparison')
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
