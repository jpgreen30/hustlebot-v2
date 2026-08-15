import { test, describe } from 'node:test';
import assert from 'node:assert';
import { ApprovalGate, APPROVAL_STATUS } from './approval-gate.js';
import { CapabilityRegistry } from './capability-registry.js';
import { ExecutionGraph, NODE_STATUS, GRAPH_STATUS } from './execution-graph.js';
import { Planner } from './planner.js';

function registryWithDeploy() {
  const r = new CapabilityRegistry();
  r.register({
    capabilityId: 'content.generate', name: 'gen', provider: 'test',
    handler: async ({ topic }) => ({ content: `about ${topic}` }), expectedCost: 0.01
  });
  r.register({
    capabilityId: 'site.deploy', name: 'deploy', provider: 'test',
    handler: async (input) => ({ deployed: true, projectId: input.projectId }),
    requiresApproval: true, expectedCost: 0.5
  });
  r.register({
    capabilityId: 'email.send', name: 'email', provider: 'test',
    handler: async (input) => ({ sent: (input.recipients || []).length }), expectedCost: 0.001
  });
  return r;
}

const newGate = (over = {}) => new ApprovalGate({ registry: registryWithDeploy(), ...over });

describe('ApprovalGate policies', () => {
  test('requires approval for a capability flagged in the registry', () => {
    const v = newGate().evaluate({ capabilityId: 'site.deploy', input: { projectId: 'p' } });
    assert.strictEqual(v.required, true);
    assert.ok(v.reasons.some((r) => r.policy === 'capability-flagged'));
  });

  test('lets an ordinary capability through', () => {
    const v = newGate().evaluate({ capabilityId: 'content.generate', input: { topic: 't' } });
    assert.strictEqual(v.required, false);
    assert.deepStrictEqual(v.reasons, []);
  });

  test('catches large spend over the threshold', () => {
    const gate = newGate({ spendThreshold: 5 });
    assert.strictEqual(gate.evaluate({ capabilityId: 'content.generate', estimatedCost: 2 }).required, false);

    const v = gate.evaluate({ capabilityId: 'content.generate', estimatedCost: 25 });
    assert.strictEqual(v.required, true);
    assert.ok(v.reasons.some((r) => r.policy === 'large-spend'));
  });

  test('catches destructive actions by capability name or flag', () => {
    const gate = newGate();
    assert.ok(gate.evaluate({ capabilityId: 'db.delete', input: {} }).reasons.some((r) => r.policy === 'destructive'));
    assert.ok(gate.evaluate({ capabilityId: 'content.generate', input: { destructive: true } })
      .reasons.some((r) => r.policy === 'destructive'));
  });

  test('catches a large outbound campaign', () => {
    const gate = newGate({ campaignThreshold: 100 });
    const small = gate.evaluate({ capabilityId: 'email.send', input: { recipients: new Array(10).fill('a') } });
    assert.strictEqual(small.required, false);

    const big = gate.evaluate({ capabilityId: 'email.send', input: { recipients: new Array(5000).fill('a') } });
    assert.ok(big.reasons.some((r) => r.policy === 'large-campaign'));
  });

  test('covers the remaining spec categories', () => {
    const gate = newGate();
    const cases = [
      ['domain-purchase', { capabilityId: 'domain.buy', input: {} }],
      ['new-paid-vendor', { capabilityId: 'x.y', input: { newVendor: 'SomeSaaS' } }],
      ['pricing-change', { capabilityId: 'commerce.pricing', input: {} }],
      ['sensitive-export', { capabilityId: 'data.export', input: {} }],
      ['compliance-uncertain', { capabilityId: 'x.y', input: { complianceUncertain: true } }]
    ];
    for (const [policy, args] of cases) {
      const v = gate.evaluate(args);
      assert.ok(v.reasons.some((r) => r.policy === policy), `expected ${policy} to fire`);
    }
  });

  test('reports every reason, not just the first', () => {
    const v = newGate({ spendThreshold: 0.1 }).evaluate({
      capabilityId: 'site.deploy', input: { destructive: true }, estimatedCost: 50
    });
    const policies = v.reasons.map((r) => r.policy).sort();
    assert.deepStrictEqual(policies, ['capability-flagged', 'destructive', 'large-spend']);
  });

  test('a custom policy can be added', () => {
    const gate = newGate();
    gate.addPolicy('friday-freeze', ({ context }) => (context?.frozen ? 'Change freeze in effect' : null));
    assert.ok(gate.evaluate({ capabilityId: 'content.generate', context: { frozen: true } })
      .reasons.some((r) => r.policy === 'friday-freeze'));
  });

  test('a throwing policy does not break evaluation', () => {
    const gate = newGate();
    gate.addPolicy('broken', () => { throw new Error('bad policy'); });
    assert.doesNotThrow(() => gate.evaluate({ capabilityId: 'content.generate' }));
  });
});

describe('ApprovalGate decisions', () => {
  test('records who approved and when', async () => {
    const gate = newGate();
    const req = await gate.request({ capabilityId: 'site.deploy', input: { projectId: 'p' } });
    assert.strictEqual(req.status, APPROVAL_STATUS.PENDING);

    const decided = await gate.approve(req.id, 'jpgreen', 'looks good');
    assert.strictEqual(decided.status, APPROVAL_STATUS.APPROVED);
    assert.strictEqual(decided.decidedBy, 'jpgreen');
    assert.strictEqual(decided.notes, 'looks good');
    assert.ok(decided.decidedAt >= decided.createdAt);
  });

  test('rejection records the reason', async () => {
    const gate = newGate();
    const req = await gate.request({ capabilityId: 'site.deploy', input: {} });
    const decided = await gate.reject(req.id, 'jpgreen', 'not ready');
    assert.strictEqual(decided.status, APPROVAL_STATUS.REJECTED);
    assert.strictEqual(decided.notes, 'not ready');
  });

  test('modify approves with replacement inputs merged over the original', async () => {
    const gate = newGate();
    const req = await gate.request({
      capabilityId: 'email.send',
      input: { subject: 'Original', to: 'a@b.c', body: 'hi' }
    });
    const decided = await gate.modify(req.id, 'jpgreen', { subject: 'Edited' });

    assert.strictEqual(decided.status, APPROVAL_STATUS.APPROVED);
    assert.deepStrictEqual(decided.modifiedInputs, { subject: 'Edited', to: 'a@b.c', body: 'hi' });
  });

  test('modify without inputs is rejected as a bad call', async () => {
    const gate = newGate();
    const req = await gate.request({ capabilityId: 'site.deploy', input: {} });
    await assert.rejects(() => gate.modify(req.id, 'jpgreen', null), /requires the replacement inputs/);
  });

  test('a decision cannot be made twice', async () => {
    const gate = newGate();
    const req = await gate.request({ capabilityId: 'site.deploy', input: {} });
    await gate.approve(req.id, 'first');
    await assert.rejects(() => gate.reject(req.id, 'second'), /already approved/);
  });

  test('every decision must record who made it', async () => {
    const gate = newGate();
    const req = await gate.request({ capabilityId: 'site.deploy', input: {} });
    await assert.rejects(() => gate.decide(req.id, { decision: 'approve' }), /who made it/);
  });

  test('unknown requests and decisions are rejected', async () => {
    const gate = newGate();
    await assert.rejects(() => gate.approve('apr-nope', 'x'), /Unknown approval request/);
    const req = await gate.request({ capabilityId: 'site.deploy', input: {} });
    await assert.rejects(() => gate.decide(req.id, { decision: 'maybe', by: 'x' }), /Unknown decision/);
  });

  test('pending requests expire instead of blocking forever', async () => {
    const gate = newGate({ ttlMs: -1 }); // already expired on creation
    const req = await gate.request({ capabilityId: 'site.deploy', input: {} });
    const read = await gate.get(req.id);

    assert.strictEqual(read.status, APPROVAL_STATUS.EXPIRED);
    await assert.rejects(() => gate.approve(req.id, 'late'), /already expired/);
  });

  test('notifies on request and on decision', async () => {
    const requested = [];
    const decided = [];
    const gate = newGate({
      onRequest: (r) => requested.push(r.id),
      onDecision: (r) => decided.push(`${r.id}:${r.status}`)
    });

    const req = await gate.request({ capabilityId: 'site.deploy', input: {} });
    await gate.approve(req.id, 'jpgreen');

    assert.deepStrictEqual(requested, [req.id]);
    assert.deepStrictEqual(decided, [`${req.id}:approved`]);
  });

  test('a failing notifier does not lose the request', async () => {
    const gate = newGate({ onRequest: () => { throw new Error('telegram down'); } });
    const req = await gate.request({ capabilityId: 'site.deploy', input: {} });
    assert.ok(await gate.get(req.id), 'request must still be stored');
  });

  test('listPending shows only undecided requests', async () => {
    const gate = newGate();
    const a = await gate.request({ capabilityId: 'site.deploy', input: {} });
    const b = await gate.request({ capabilityId: 'site.deploy', input: {} });
    await gate.approve(a.id, 'jpgreen');

    const pending = await gate.listPending();
    assert.deepStrictEqual(pending.map((r) => r.id), [b.id]);
  });

  test('autoApprove bypasses the wait and says so', async () => {
    const gate = newGate({ autoApprove: true });
    const req = await gate.request({ capabilityId: 'site.deploy', input: {} });
    assert.strictEqual(req.status, APPROVAL_STATUS.APPROVED);
    assert.strictEqual(req.decidedBy, 'auto-approve');

    const stats = await gate.getStats();
    assert.strictEqual(stats.autoApprove, true);
  });

  test('stats summarise the queue', async () => {
    const gate = newGate();
    const a = await gate.request({ capabilityId: 'site.deploy', input: {} });
    await gate.request({ capabilityId: 'site.deploy', input: {} });
    await gate.reject(a.id, 'jpgreen');

    const stats = await gate.getStats();
    assert.strictEqual(stats.total, 2);
    assert.strictEqual(stats.pending, 1);
    assert.strictEqual(stats.byStatus.rejected, 1);
    assert.ok(stats.policies.includes('large-spend'));
  });
});

describe('Approval gate inside graph execution', () => {
  const deployGraph = () =>
    new ExecutionGraph({
      objective: 'Build and ship',
      nodes: [
        { id: 'build', capabilityId: 'content.generate', inputs: { topic: 'x' } },
        { id: 'ship', capabilityId: 'site.deploy', dependsOn: ['build'], inputs: { projectId: 'p1' } }
      ]
    });

  test('raises a real request and pauses the graph', async () => {
    const registry = registryWithDeploy();
    const gate = newGate({ registry });
    const graph = deployGraph();

    const summary = await graph.execute({ registry, approvalGate: gate });

    assert.strictEqual(summary.status, GRAPH_STATUS.AWAITING_APPROVAL);
    const pending = await gate.listPending();
    assert.strictEqual(pending.length, 1);
    assert.strictEqual(pending[0].capabilityId, 'site.deploy');
    assert.strictEqual(pending[0].nodeId, 'ship');
    assert.strictEqual(pending[0].graphId, graph.id);
    // The human sees resolved inputs, not $ref placeholders.
    assert.deepStrictEqual(pending[0].input, { projectId: 'p1' });
    assert.strictEqual(summary.awaitingApproval[0].approvalId, pending[0].id);
  });

  test('approving lets the graph finish on the next run', async () => {
    const registry = registryWithDeploy();
    const gate = newGate({ registry });
    const planner = new Planner({ registry, approvalGate: gate });
    const graph = deployGraph();
    planner.graphs.set(graph.id, graph);

    await planner.execute(graph);
    const [pending] = await gate.listPending();
    await gate.approve(pending.id, 'jpgreen');

    const resumed = await planner.resume(graph.id);
    assert.strictEqual(resumed.status, GRAPH_STATUS.COMPLETED);
    assert.strictEqual(resumed.resumed, 1);
    assert.deepStrictEqual(graph.getNode('ship').result, { deployed: true, projectId: 'p1' });
  });

  test('rejecting fails the node with who rejected it', async () => {
    const registry = registryWithDeploy();
    const gate = newGate({ registry });
    const planner = new Planner({ registry, approvalGate: gate });
    const graph = deployGraph();
    planner.graphs.set(graph.id, graph);

    await planner.execute(graph);
    const [pending] = await gate.listPending();
    await gate.reject(pending.id, 'jpgreen', 'wrong project');

    const resumed = await planner.resume(graph.id);
    assert.strictEqual(resumed.status, GRAPH_STATUS.FAILED);
    assert.match(graph.getNode('ship').error, /Rejected by jpgreen: wrong project/);
  });

  test('modified inputs are what actually run', async () => {
    const registry = registryWithDeploy();
    const gate = newGate({ registry });
    const planner = new Planner({ registry, approvalGate: gate });
    const graph = deployGraph();
    planner.graphs.set(graph.id, graph);

    await planner.execute(graph);
    const [pending] = await gate.listPending();
    await gate.modify(pending.id, 'jpgreen', { projectId: 'p2-corrected' });

    await planner.resume(graph.id);
    assert.deepStrictEqual(graph.getNode('ship').result, { deployed: true, projectId: 'p2-corrected' });
  });

  test('resume does nothing while the approval is still pending', async () => {
    const registry = registryWithDeploy();
    const gate = newGate({ registry });
    const planner = new Planner({ registry, approvalGate: gate });
    const graph = deployGraph();
    planner.graphs.set(graph.id, graph);

    await planner.execute(graph);
    const out = await planner.resume(graph.id);

    assert.strictEqual(out.resumed, 0);
    assert.strictEqual(graph.getNode('ship').status, NODE_STATUS.AWAITING_APPROVAL);
  });

  test('a second run does not raise a duplicate request', async () => {
    const registry = registryWithDeploy();
    const gate = newGate({ registry });
    const graph = deployGraph();

    await graph.execute({ registry, approvalGate: gate });
    graph.getNode('ship').status = NODE_STATUS.PENDING; // pretend something retried it
    await graph.execute({ registry, approvalGate: gate });

    assert.strictEqual((await gate.listPending()).length, 1, 'should reuse the open request');
  });

  test('policy-triggered approval applies to capabilities with no flag', async () => {
    const registry = registryWithDeploy();
    const gate = newGate({ registry, campaignThreshold: 10 });
    const graph = new ExecutionGraph({
      nodes: [{
        id: 'blast', capabilityId: 'email.send',
        inputs: { recipients: new Array(500).fill('a@b.c'), subject: 'hi' }
      }]
    });

    const summary = await graph.execute({ registry, approvalGate: gate });
    assert.strictEqual(summary.status, GRAPH_STATUS.AWAITING_APPROVAL);

    const [pending] = await gate.listPending();
    assert.ok(pending.reasons.some((r) => r.policy === 'large-campaign'));
  });

  test('bypassApproval skips the gate entirely', async () => {
    const registry = registryWithDeploy();
    const gate = newGate({ registry });
    const summary = await deployGraph().execute({
      registry, approvalGate: gate, context: { bypassApproval: true }
    });

    assert.strictEqual(summary.status, GRAPH_STATUS.COMPLETED);
    assert.strictEqual((await gate.listPending()).length, 0);
  });

  test('without a gate the old requiresApproval pause still works', async () => {
    const summary = await deployGraph().execute({ registry: registryWithDeploy() });
    assert.strictEqual(summary.status, GRAPH_STATUS.AWAITING_APPROVAL);
  });
});
