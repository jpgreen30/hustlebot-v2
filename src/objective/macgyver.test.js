import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CapabilityRegistry } from '../core/capability-registry.js';
import { inspectCatalogue, isOutboundCapability } from './catalogue.js';
import { interpretObjective } from './interpret.js';
import { planObjective } from './planner.js';
import { validatePlan } from './validate.js';
import { observeNodeResult, OBSERVATION } from './observer.js';
import { recoveryAction, applyReplan } from './recover.js';
import { MacGyverEngine } from './engine.js';
import { ObjectiveMemory } from './memory.js';
import { matchObjectiveControl, matchObjectiveRun } from './control.js';
import { IntentDetector } from '../core/intent-detector.js';

function macgyverRegistry({ failDiscoverOnce = false } = {}) {
  const r = new CapabilityRegistry();
  let discoverCalls = 0;
  r.register({
    capabilityId: 'org.discover',
    name: 'discover',
    provider: 'browser-render',
    handler: async (input, context) => {
      discoverCalls += 1;
      if (failDiscoverOnce && discoverCalls === 1) {
        return { status: 'failed', error: 'firecrawl timeout', prospects: [] };
      }
      if (context?.forceUnavailable?.includes('firecrawl') && discoverCalls === 1) {
        throw new Error('firecrawl unavailable');
      }
      const query = String(input.query || input.objective || '');
      const roofing = /roof/i.test(query);
      const prospects = roofing
        ? [
          { organizationName: 'LA Roof Pros', website: 'https://laroofpros.example', domain: 'laroofpros.example', description: 'Residential roofing in Los Angeles' },
          { organizationName: 'Valley Shingle Co', website: 'https://valleyshingle.example', domain: 'valleyshingle.example', description: 'Roof repair Van Nuys' },
          { organizationName: 'Sunset Roofing', website: 'https://sunsetroof.example', domain: 'sunsetroof.example', description: 'Commercial roofing LA' },
          { organizationName: 'Pacific Tarp & Roof', website: 'https://pacificroof.example', domain: 'pacificroof.example', description: 'Emergency roofing' },
          { organizationName: 'Hollywood Ridge Roofing', website: 'https://hwroof.example', domain: 'hwroof.example', description: 'AI-friendly home services' }
        ]
        : [
          { organizationName: 'Atwave', website: 'https://atwave.com', domain: 'atwave.com', description: 'Affiliate network' },
          { organizationName: 'Avantlink', website: 'https://avantlink.com', domain: 'avantlink.com', description: 'Affiliate platform that buys performance' },
          { organizationName: 'Acceleration Partners', website: 'https://accelerationpartners.com', domain: 'accelerationpartners.com', description: 'Affiliate management agency' }
        ];
      return { status: 'ok', prospects: prospects.slice(0, input.maxOrganizations || 10), providers: ['browser-render'], reasonSelected: 'test' };
    },
    isAvailable: () => true
  });
  r.register({
    capabilityId: 'org.discover',
    name: 'discover-spider',
    provider: 'custom-spider',
    handler: async () => ({
      status: 'ok',
      prospects: [{ organizationName: 'Spider Co', website: 'https://spider.example', domain: 'spider.example' }],
      providers: ['custom-spider'],
      reasonSelected: 'spider fallback'
    }),
    isAvailable: () => true
  });
  r.register({
    capabilityId: 'company.research.batch',
    name: 'research',
    provider: 'public-web',
    handler: async (input) => ({
      status: 'ok',
      prospects: (input.prospects || []).map((p) => ({ ...p, intelligence: { description: { value: p.description, status: 'VERIFIED' } } })),
      providers: ['public-web']
    }),
    isAvailable: () => true
  });
  r.register({
    capabilityId: 'contact.discover.batch',
    name: 'contacts',
    provider: 'public-web',
    handler: async (input) => ({
      status: 'ok',
      prospects: (input.prospects || []).map((p, i) => ({
        ...p,
        contacts: i === 0 ? [{ fullName: 'Alex Founder', title: 'CEO', email: null, phone: null, emailStatus: 'UNKNOWN' }] : [],
        contact: i === 0 ? { fullName: 'Alex Founder', title: 'CEO' } : null
      }))
    }),
    isAvailable: () => true
  });
  r.register({
    capabilityId: 'prospect.qualify',
    name: 'qualify',
    provider: 'intelligence',
    handler: async (input) => ({
      prospects: (input.prospects || []).map((p) => ({ ...p, qualification: { status: 'qualified' } }))
    }),
    isAvailable: () => true
  });
  r.register({
    capabilityId: 'prospect.score',
    name: 'score',
    provider: 'intelligence',
    handler: async (input) => ({
      prospects: (input.prospects || []).map((p, i) => ({ ...p, score: { total: 80 - i }, rank: i + 1 }))
    }),
    isAvailable: () => true
  });
  r.register({
    capabilityId: 'objective.report',
    name: 'report',
    provider: 'macgyver',
    handler: async (input) => {
      const top = (input.prospects || []).slice(0, input.topN || 5);
      return { status: 'ok', prospects: input.prospects || [], top, report: `${top.length} ranked`, contacted: false };
    },
    isAvailable: () => true
  });
  r.register({
    capabilityId: 'campaign.prepare',
    name: 'mega',
    provider: 'intelligence-engine',
    handler: async () => ({ cheated: true }),
    isAvailable: () => true
  });
  r.register({
    capabilityId: 'outreach.email',
    name: 'email',
    provider: 'outreach',
    requiresApproval: true,
    handler: async (input) => ({ status: 'sent', providerMessageId: 'msg_1', to: input.to, fabricated: false }),
    isAvailable: () => true
  });
  r.register({
    capabilityId: 'web.scrape',
    name: 'scrape',
    provider: 'firecrawl',
    handler: async () => { throw new Error('firecrawl down'); },
    isAvailable: () => true
  });
  r.register({
    capabilityId: 'web.scrape',
    name: 'scrape-spider',
    provider: 'custom-spider',
    handler: async () => ({ status: 'ok', html: '<html></html>', provider: 'custom-spider' }),
    isAvailable: () => true
  });
  return r;
}

describe('MacGyver catalogue + planner', () => {
  test('introspection includes side-effect and never assumes tools', () => {
    const r = macgyverRegistry();
    const catalogue = inspectCatalogue(r);
    assert.ok(catalogue.some((c) => c.capabilityId === 'org.discover' && c.sideEffect === 'READ_ONLY'));
    assert.equal(isOutboundCapability('outreach.email'), true);
    assert.equal(isOutboundCapability('company.research.batch'), false);
  });

  test('Qentrax research objective composes primitives and never uses campaign.prepare', () => {
    const objective = interpretObjective(
      'Find 10 companies from Affiliate Summit that could plausibly buy leads through Qentrax, research them, find available decision makers, rank the prospects, and give me the top 5. Do not contact anyone.'
    );
    assert.ok(objective.prohibitedCapabilities.includes('voice.call'));
    assert.ok(objective.prohibitedCapabilities.includes('outreach.email'));
    const plan = planObjective(objective, inspectCatalogue(macgyverRegistry()));
    const ids = plan.nodes.map((n) => n.capabilityId);
    assert.ok(!ids.includes('campaign.prepare'));
    assert.ok(ids.includes('org.discover'));
    assert.ok(ids.includes('company.research.batch'));
    assert.ok(ids.includes('contact.discover.batch'));
    assert.ok(ids.includes('prospect.qualify'));
    assert.ok(ids.includes('prospect.score'));
    const validation = validatePlan(plan, { catalogue: inspectCatalogue(macgyverRegistry()), objective });
    assert.equal(validation.ok, true);
    assert.deepEqual(validation.outboundNodes, []);
  });

  test('do-not-contact constraint rejects a plan that inserts outbound', () => {
    const objective = interpretObjective('Find roofers. Do not contact anyone.');
    const plan = planObjective(objective, inspectCatalogue(macgyverRegistry()));
    plan.nodes.push({
      id: 'call',
      capabilityId: 'outreach.email',
      inputs: {},
      dependsOn: [],
      approvalState: 'required'
    });
    const validation = validatePlan(plan, { catalogue: inspectCatalogue(macgyverRegistry()), objective });
    assert.equal(validation.ok, false);
    assert.ok(validation.errors.some((e) => /outbound|prohibited/i.test(e)));
  });

  test('roofing objective uses search-shaped discovery, not a prebuilt workflow id', () => {
    const objective = interpretObjective(
      'Find five Los Angeles-area roofing companies, research what services they offer, identify publicly available decision makers where possible, and rank which three look best for a future AI receptionist offer. Do not contact anyone.'
    );
    assert.equal(objective.context.pattern, 'research_rank_search');
    assert.match(objective.context.query || '', /roof/i);
    const plan = planObjective(objective, inspectCatalogue(macgyverRegistry()));
    assert.ok(!plan.nodes.some((n) => n.capabilityId === 'campaign.prepare'));
    assert.equal(plan.nodes[0].capabilityId, 'org.discover');
  });
});

describe('MacGyver observer + recovery', () => {
  test('zero contacts is PARTIAL not a fabricated failure', () => {
    const obs = observeNodeResult(
      { capabilityId: 'contact.discover.batch' },
      { success: true, result: { prospects: [{ contacts: [] }] } }
    );
    assert.equal(obs.status, OBSERVATION.PARTIAL);
  });

  test('zero organizations is a retryable discovery failure, not success', () => {
    const obs = observeNodeResult(
      { capabilityId: 'org.discover', id: 'discover' },
      { success: true, result: { status: 'ok', prospects: [] } }
    );
    assert.equal(obs.status, OBSERVATION.RETRYABLE_FAILURE);
  });

  test('search-shaped recovery does not jump to web.scrape', () => {
    const catalogue = inspectCatalogue(macgyverRegistry());
    const action = recoveryAction(
      { id: 'discover', capabilityId: 'org.discover', provider: 'macgyver' },
      { status: OBSERVATION.PROVIDER_FAILURE, reason: 'search empty' },
      { catalogue, retries: 0 }
    );
    assert.ok(['retry', 'switch-provider'].includes(action.action));
    assert.notEqual(action.capabilityId, 'web.scrape');
  });

  test('preferred provider failure selects a legitimate alternative', () => {
    const catalogue = inspectCatalogue(macgyverRegistry());
    const action = recoveryAction(
      { id: 'discover', capabilityId: 'org.discover', provider: 'browser-render' },
      { status: OBSERVATION.PROVIDER_FAILURE, reason: 'firecrawl unavailable' },
      { catalogue, retries: 0 }
    );
    assert.ok(['switch-provider', 'alternate-capability', 'retry'].includes(action.action));
    if (action.provider) assert.notEqual(action.provider, 'browser-render');
  });
});

describe('MacGyver engine execution', () => {
  test('Qentrax-style objective executes the generated DAG', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mac-q-'));
    const engine = new MacGyverEngine({
      registry: macgyverRegistry(),
      memory: new ObjectiveMemory({ dir })
    });
    try {
      const out = await engine.run({
        rawRequest: 'Find 10 companies from Affiliate Summit that could buy Qentrax leads, research them, find decision makers, rank the top 5. Do not contact anyone.'
      });
      assert.equal(out.status, 'ok');
      assert.ok(out.plan.nodes.length >= 5);
      assert.ok(!out.plan.nodes.some((n) => n.capabilityId === 'campaign.prepare'));
      assert.ok(out.result.top.length >= 3);
      assert.equal(out.contacted, false);
      assert.equal(out.objective.contacted, false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('roofing objective executes without a roofing workflow', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mac-r-'));
    const engine = new MacGyverEngine({
      registry: macgyverRegistry(),
      memory: new ObjectiveMemory({ dir })
    });
    try {
      const out = await engine.run({
        rawRequest: 'Find five Los Angeles-area roofing companies, research what services they offer, identify publicly available decision makers, and rank which three look best for a future AI receptionist offer. Do not contact anyone.'
      });
      assert.equal(out.status, 'ok');
      assert.ok(out.result.top.some((p) => /roof/i.test(p.organizationName)));
      assert.equal(out.plan.pattern, 'research_rank_search');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('controlled firecrawl failure recovers via alternate provider', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mac-f-'));
    const engine = new MacGyverEngine({
      registry: macgyverRegistry({ failDiscoverOnce: true }),
      memory: new ObjectiveMemory({ dir })
    });
    try {
      const out = await engine.run({
        rawRequest: 'Find companies at Affiliate Summit and rank them. Do not contact anyone.'
      });
      assert.equal(out.status, 'ok');
      assert.ok(out.objective.replanCount >= 1);
      assert.ok((out.objective.executions || []).length >= 2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('authorized email objective pauses at ApprovalGate', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mac-a-'));
    const requests = [];
    const engine = new MacGyverEngine({
      registry: macgyverRegistry(),
      memory: new ObjectiveMemory({ dir }),
      approvalGate: {
        async get() { return null; },
        async request(payload) {
          requests.push(payload);
          return { id: 'apr-test', status: 'pending' };
        }
      }
    });
    try {
      const out = await engine.run({
        rawRequest: 'Send one authorized self-test email.',
        context: { testEmail: 'day5@example.com' }
      });
      assert.equal(out.status, 'awaiting_approval');
      assert.equal(out.approvalId, 'apr-test');
      assert.equal(requests.length, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('MacGyver telegram/NL', () => {
  test('control phrases map to objective.control and research maps to objective.run', () => {
    assert.equal(matchObjectiveControl('Show me the plan.').action, 'plan');
    assert.equal(matchObjectiveControl('What failed?').action, 'failed');
    assert.ok(matchObjectiveRun('Find 10 Affiliate Summit companies and rank them. Do not contact anyone.'));
    assert.equal(matchObjectiveRun('Prepare an outreach campaign'), null);
    const detector = new IntentDetector({ llm: null, registry: new CapabilityRegistry() });
    const run = detector.hintObjectiveRunIntent('Find five Los Angeles-area roofing companies and rank three. Do not contact anyone.');
    assert.equal(run.capabilityId, 'objective.run');
    const campaign = detector.hintCampaignIntent('Prepare an outreach campaign for Qentrax. Do not contact anyone.');
    assert.equal(campaign.capabilityId, 'campaign.prepare');
  });
});

describe('MacGyver constraints + explainability', () => {
  test('replanning cannot insert outbound against do-not-contact', () => {
    const objective = interpretObjective('Find roofing companies in Los Angeles and rank them. Do not contact anyone.');
    const catalogue = inspectCatalogue(macgyverRegistry());
    const plan = planObjective(objective, catalogue);
    const revised = applyReplan(plan, { nodeId: 'contacts', capabilityId: 'outreach.email', reason: 'illegal' });
    const validation = validatePlan(revised, { catalogue, objective });
    assert.equal(validation.ok, false);
    assert.ok(validation.errors.some((e) => /outbound|prohibited/i.test(e)));
  });

  test('explain reports actual selected capabilities', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mac-x-'));
    const engine = new MacGyverEngine({
      registry: macgyverRegistry(),
      memory: new ObjectiveMemory({ dir })
    });
    try {
      const out = await engine.run({
        rawRequest: 'Find Affiliate Summit companies and rank them. Do not contact anyone.'
      });
      const explained = engine.explain(out.objective.objectiveId);
      assert.equal(explained.status, 'ok');
      assert.match(explained.report, /org.discover/);
      assert.match(explained.report, /company.research/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
