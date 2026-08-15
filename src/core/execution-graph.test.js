import { test, describe } from 'node:test';
import assert from 'node:assert';
import { ExecutionGraph, NODE_STATUS, GRAPH_STATUS, resolveRefs, checkAcceptance } from './execution-graph.js';
import { CapabilityRegistry } from './capability-registry.js';
import { Planner } from './planner.js';

/** Registry with a few predictable capabilities. */
function testRegistry(overrides = {}) {
  const r = new CapabilityRegistry();
  const add = (id, handler, extra = {}) =>
    r.register({
      capabilityId: id,
      name: id,
      provider: 'test',
      handler,
      expectedCost: 0.01,
      ...extra
    });

  add('research.find', async ({ topic }) => ({ facts: [`fact about ${topic}`], topic }));
  add('content.generate', async ({ topic, facts }) => ({
    content: `An article about ${topic}` + (facts ? ` using ${facts.length} fact(s)` : ''),
    words: 500
  }));
  add('image.make', async () => ({ url: 'https://img.example/1.png' }));
  add('site.deploy', async () => ({ deployed: true }), { requiresApproval: true, expectedCost: 0.5 });
  add('flaky.op', async () => { throw new Error('upstream exploded'); });

  for (const [id, fn] of Object.entries(overrides)) add(id, fn);
  return r;
}

const linearGraph = () =>
  new ExecutionGraph({
    objective: 'Write an article',
    nodes: [
      {
        id: 'research', capabilityId: 'research.find', agent: 'researcher',
        inputs: { topic: 'sleep training' }
      },
      {
        id: 'write', capabilityId: 'content.generate', agent: 'writer',
        dependsOn: ['research'],
        inputs: { topic: 'sleep training', facts: { $ref: 'research.facts' } },
        acceptanceCriteria: [{ type: 'exists', path: 'content' }]
      }
    ]
  });

describe('ExecutionGraph structure', () => {
  test('rejects nodes without an id or capability', () => {
    assert.throws(() => new ExecutionGraph({ nodes: [{ capabilityId: 'x' }] }), /needs an id/);
    assert.throws(() => new ExecutionGraph({ nodes: [{ id: 'a' }] }), /needs a capabilityId/);
  });

  test('detects cycles', () => {
    const g = new ExecutionGraph({
      nodes: [
        { id: 'a', capabilityId: 'x', dependsOn: ['c'] },
        { id: 'b', capabilityId: 'x', dependsOn: ['a'] },
        { id: 'c', capabilityId: 'x', dependsOn: ['b'] }
      ]
    });
    const errors = g.validate();
    assert.ok(errors.some((e) => /Cycle detected/.test(e)), `expected a cycle error, got ${errors}`);
    assert.throws(() => g.topologicalLevels(), /invalid graph|Cycle/);
  });

  test('detects self-dependency, duplicates and missing dependencies', () => {
    const g = new ExecutionGraph({
      nodes: [
        { id: 'a', capabilityId: 'x', dependsOn: ['a'] },
        { id: 'a', capabilityId: 'x' },
        { id: 'b', capabilityId: 'x', dependsOn: ['ghost'] }
      ]
    });
    const errors = g.validate().join(' | ');
    assert.match(errors, /Duplicate node id/);
    assert.match(errors, /depends on itself/);
    assert.match(errors, /depends on "ghost"/);
  });

  test('flags unknown capabilities against the registry', () => {
    const g = new ExecutionGraph({ nodes: [{ id: 'a', capabilityId: 'not.registered' }] });
    const errors = g.validate(testRegistry());
    assert.ok(errors.some((e) => /unknown capability/.test(e)));
  });

  test('groups independent nodes into the same parallel level', () => {
    const g = new ExecutionGraph({
      nodes: [
        { id: 'a', capabilityId: 'research.find' },
        { id: 'b', capabilityId: 'image.make' },
        { id: 'c', capabilityId: 'content.generate', dependsOn: ['a', 'b'] }
      ]
    });
    const levels = g.topologicalLevels();
    assert.strictEqual(levels.length, 2);
    assert.deepStrictEqual(levels[0].sort(), ['a', 'b']);
    assert.deepStrictEqual(levels[1], ['c']);
  });

  test('estimates cost from the registry before running anything', () => {
    const g = linearGraph();
    const { total, breakdown } = g.estimateCost(testRegistry());
    assert.strictEqual(total, 0.02);
    assert.strictEqual(breakdown.length, 2);
  });

  test('survives a JSON round trip', () => {
    const g = linearGraph();
    const back = ExecutionGraph.fromJSON(JSON.parse(JSON.stringify(g.toJSON())));
    assert.strictEqual(back.id, g.id);
    assert.strictEqual(back.nodes.length, 2);
    assert.deepStrictEqual(back.getNode('write').dependsOn, ['research']);
  });
});

describe('ExecutionGraph execution', () => {
  test('runs in dependency order and pipes outputs into the next node', async () => {
    const g = linearGraph();
    const summary = await g.execute({ registry: testRegistry() });

    assert.strictEqual(summary.status, GRAPH_STATUS.COMPLETED);
    assert.strictEqual(g.getNode('research').status, NODE_STATUS.COMPLETED);
    // The $ref pulled research.facts into the writer's input.
    assert.match(g.getNode('write').result.content, /using 1 fact/);
    assert.strictEqual(summary.actualCost, 0.02);
  });

  test('runs independent nodes concurrently', async () => {
    const order = [];
    const r = testRegistry();
    r.register({
      capabilityId: 'slow.a', name: 'a', provider: 'test',
      handler: async () => { order.push('a-start'); await new Promise((s) => setTimeout(s, 40)); order.push('a-end'); return 1; }
    });
    r.register({
      capabilityId: 'slow.b', name: 'b', provider: 'test',
      handler: async () => { order.push('b-start'); await new Promise((s) => setTimeout(s, 40)); order.push('b-end'); return 2; }
    });

    const g = new ExecutionGraph({
      nodes: [{ id: 'a', capabilityId: 'slow.a' }, { id: 'b', capabilityId: 'slow.b' }]
    });
    await g.execute({ registry: r });

    // Both start before either finishes - that is what parallel means here.
    assert.deepStrictEqual(order.slice(0, 2).sort(), ['a-start', 'b-start']);
  });

  test('a failed node fails the graph and its dependents are skipped', async () => {
    const g = new ExecutionGraph({
      nodes: [
        { id: 'boom', capabilityId: 'flaky.op' },
        { id: 'after', capabilityId: 'content.generate', dependsOn: ['boom'], inputs: { topic: 't' } }
      ]
    });
    const summary = await g.execute({ registry: testRegistry() });

    assert.strictEqual(summary.status, GRAPH_STATUS.FAILED);
    assert.strictEqual(g.getNode('boom').status, NODE_STATUS.FAILED);
    assert.strictEqual(g.getNode('after').status, NODE_STATUS.SKIPPED);
    assert.match(g.getNode('after').error, /dependencies did not complete/);
  });

  test('an unrelated branch still completes when another branch fails', async () => {
    const g = new ExecutionGraph({
      nodes: [
        { id: 'boom', capabilityId: 'flaky.op' },
        { id: 'independent', capabilityId: 'image.make' }
      ]
    });
    await g.execute({ registry: testRegistry() });

    assert.strictEqual(g.getNode('boom').status, NODE_STATUS.FAILED);
    assert.strictEqual(g.getNode('independent').status, NODE_STATUS.COMPLETED);
  });

  test('unmet acceptance criteria fail the node even though the call succeeded', async () => {
    const g = new ExecutionGraph({
      nodes: [{
        id: 'write', capabilityId: 'content.generate', inputs: { topic: 't' },
        acceptanceCriteria: [{ type: 'minLength', path: 'content', value: 10000 }]
      }]
    });
    const summary = await g.execute({ registry: testRegistry() });

    assert.strictEqual(summary.status, GRAPH_STATUS.FAILED);
    assert.match(g.getNode('write').error, /Acceptance criteria not met/);
    assert.ok(g.getNode('write').result, 'result is kept for debugging');
  });

  test('pauses at a capability that requires approval', async () => {
    const g = new ExecutionGraph({
      nodes: [
        { id: 'build', capabilityId: 'content.generate', inputs: { topic: 't' } },
        { id: 'ship', capabilityId: 'site.deploy', dependsOn: ['build'], inputs: { projectId: 'p1' } }
      ]
    });
    const summary = await g.execute({ registry: testRegistry() });

    assert.strictEqual(summary.status, GRAPH_STATUS.AWAITING_APPROVAL);
    assert.strictEqual(g.getNode('build').status, NODE_STATUS.COMPLETED);
    assert.strictEqual(g.getNode('ship').status, NODE_STATUS.AWAITING_APPROVAL);
    assert.deepStrictEqual(summary.awaitingApproval, [
      { nodeId: 'ship', capabilityId: 'site.deploy', approvalId: null }
    ]);
  });

  test('resumes an approved node and finishes', async () => {
    const g = new ExecutionGraph({
      nodes: [
        { id: 'build', capabilityId: 'content.generate', inputs: { topic: 't' } },
        { id: 'ship', capabilityId: 'site.deploy', dependsOn: ['build'], inputs: { projectId: 'p1' } }
      ]
    });
    const registry = testRegistry();
    await g.execute({ registry });
    assert.strictEqual(g.status, GRAPH_STATUS.AWAITING_APPROVAL);

    // Approval layer clears the node, then execution resumes.
    g.getNode('ship').status = NODE_STATUS.PENDING;
    const summary = await g.execute({ registry, approvedNodes: ['ship'] });

    assert.strictEqual(summary.status, GRAPH_STATUS.COMPLETED);
    assert.deepStrictEqual(g.getNode('ship').result, { deployed: true });
  });

  test('refuses to start when the estimate exceeds the budget', async () => {
    const g = new ExecutionGraph({
      nodes: [{ id: 'ship', capabilityId: 'site.deploy', inputs: { projectId: 'p' } }]
    });
    await assert.rejects(
      () => g.execute({ registry: testRegistry(), maxCost: 0.1 }),
      /exceeds budget/
    );
    assert.strictEqual(g.getNode('ship').status, NODE_STATUS.PENDING, 'nothing should have run');
  });

  test('a broken $ref fails only that node', async () => {
    const g = new ExecutionGraph({
      nodes: [
        { id: 'a', capabilityId: 'image.make' },
        { id: 'b', capabilityId: 'content.generate', dependsOn: ['a'], inputs: { topic: { $ref: 'ghost.value' } } }
      ]
    });
    await g.execute({ registry: testRegistry() });

    assert.strictEqual(g.getNode('a').status, NODE_STATUS.COMPLETED);
    assert.strictEqual(g.getNode('b').status, NODE_STATUS.FAILED);
    assert.match(g.getNode('b').error, /has no output/);
  });

  test('reports progress through onNodeChange', async () => {
    const events = [];
    await linearGraph().execute({
      registry: testRegistry(),
      onNodeChange: (e) => events.push(`${e.nodeId}:${e.status}`)
    });

    assert.deepStrictEqual(events, [
      'research:running', 'research:completed', 'write:running', 'write:completed'
    ]);
  });

  test('lists approval requirements before running', () => {
    const g = new ExecutionGraph({
      nodes: [
        { id: 'a', capabilityId: 'content.generate' },
        { id: 'b', capabilityId: 'site.deploy' }
      ]
    });
    assert.deepStrictEqual(
      g.approvalRequirements(testRegistry()).map((a) => a.nodeId),
      ['b']
    );
  });

  test('renders a readable plan', () => {
    const text = linearGraph().toText();
    assert.match(text, /Write an article/);
    assert.match(text, /Step 1:/);
    assert.match(text, /← research/);
  });
});

describe('helpers', () => {
  test('resolveRefs walks nested objects and arrays', () => {
    const outputs = { a: { list: [{ url: 'u1' }] }, b: 'plain' };
    const resolved = resolveRefs(
      { one: { $ref: 'a.list.0.url' }, two: [{ $ref: 'b' }], three: 'literal' },
      outputs
    );
    assert.deepStrictEqual(resolved, { one: 'u1', two: ['plain'], three: 'literal' });
  });

  test('checkAcceptance covers each criterion type', () => {
    assert.deepStrictEqual(checkAcceptance([{ type: 'exists', path: 'a' }], { a: 1 }), []);
    assert.strictEqual(checkAcceptance([{ type: 'exists', path: 'a' }], {}).length, 1);
    assert.strictEqual(checkAcceptance([{ type: 'equals', path: 'a', value: 2 }], { a: 1 }).length, 1);
    assert.strictEqual(checkAcceptance([{ type: 'nonEmptyArray', path: 'a' }], { a: [] }).length, 1);
    assert.deepStrictEqual(checkAcceptance([{ type: 'matches', path: 'a', value: '^ok' }], { a: 'okay' }), []);
    assert.strictEqual(checkAcceptance([{ type: 'bogus' }], {}).length, 1);
  });
});

describe('Planner', () => {
  const fakeLLM = (payload) => ({
    complete: async () => ({ content: typeof payload === 'string' ? payload : JSON.stringify(payload) })
  });

  test('builds a validated graph from LLM output', async () => {
    const registry = testRegistry();
    const planner = new Planner({
      registry,
      llm: fakeLLM({
        objective: 'Write an article',
        nodes: [
          { id: 'research', capabilityId: 'research.find', inputs: { topic: 'x' }, dependsOn: [] },
          {
            id: 'write', capabilityId: 'content.generate', dependsOn: ['research'],
            inputs: { topic: 'x', facts: { $ref: 'research.facts' } }
          }
        ]
      })
    });

    const { graph, estimate, source } = await planner.plan('Write an article about x');
    assert.strictEqual(source, 'llm');
    assert.strictEqual(graph.nodes.length, 2);
    assert.strictEqual(graph.status, GRAPH_STATUS.READY);
    assert.strictEqual(estimate.total, 0.02);

    const summary = await planner.execute(graph);
    assert.strictEqual(summary.status, GRAPH_STATUS.COMPLETED);
  });

  test('strips markdown fences and surrounding prose from LLM output', async () => {
    const planner = new Planner({
      registry: testRegistry(),
      llm: fakeLLM('Sure! Here is the plan:\n```json\n{"nodes":[{"id":"a","capabilityId":"image.make"}]}\n```\nHope that helps.')
    });
    const { graph } = await planner.plan('make an image');
    assert.strictEqual(graph.nodes.length, 1);
  });

  test('rejects a plan naming a capability that is not registered', async () => {
    const planner = new Planner({
      registry: testRegistry(),
      llm: fakeLLM({ nodes: [{ id: 'a', capabilityId: 'does.not.exist' }] })
    });
    // Falls back, and the fallback cannot match either, so it surfaces clearly.
    await assert.rejects(() => planner.plan('do something impossible'), /Could not map the objective/);
  });

  test('rejects a plan containing a cycle', async () => {
    const planner = new Planner({
      registry: testRegistry(),
      llm: fakeLLM({
        nodes: [
          { id: 'a', capabilityId: 'image.make', dependsOn: ['b'] },
          { id: 'b', capabilityId: 'image.make', dependsOn: ['a'] }
        ]
      })
    });
    await assert.rejects(() => planner.plan('image loop'), /Could not map|invalid graph|Cycle/);
  });

  test('surfaces the planner declining an impossible objective', async () => {
    const planner = new Planner({
      registry: testRegistry(),
      llm: fakeLLM({ error: 'no capability for sending physical mail' })
    });
    await assert.rejects(() => planner.plan('mail a letter'), /Could not map the objective/);
  });

  test('falls back to a single-step plan with no LLM', async () => {
    const planner = new Planner({ registry: testRegistry(), llm: null });
    const { graph, source } = await planner.plan('generate content about naps');

    assert.strictEqual(source, 'fallback');
    assert.strictEqual(graph.nodes.length, 1);
    assert.strictEqual(graph.nodes[0].capabilityId, 'content.generate');
  });

  test('only offers capabilities that are currently available', async () => {
    const registry = testRegistry();
    registry.register({
      capabilityId: 'offline.thing', name: 'off', provider: 'test',
      handler: async () => 1, isAvailable: () => false
    });

    const planner = new Planner({ registry });
    const ids = planner.capabilityCatalogue().map((c) => c.capabilityId);
    assert.ok(!ids.includes('offline.thing'), 'unavailable capability must not be offered');
    assert.ok(ids.includes('content.generate'));
  });

  test('reports approvals the plan will need', async () => {
    const planner = new Planner({
      registry: testRegistry(),
      llm: fakeLLM({ nodes: [{ id: 'ship', capabilityId: 'site.deploy', inputs: { projectId: 'p' } }] })
    });
    const { approvals } = await planner.plan('deploy the site');
    assert.deepStrictEqual(approvals.map((a) => a.capabilityId), ['site.deploy']);
  });

  test('runAsJob hands a serialized graph to the queue', async () => {
    const created = [];
    const planner = new Planner({
      registry: testRegistry(),
      llm: fakeLLM({ nodes: [{ id: 'a', capabilityId: 'image.make' }] }),
      jobQueue: {
        createJob: async (type, payload, opts) => {
          created.push({ type, payload, opts });
          return 'job-123';
        }
      }
    });

    const { graph } = await planner.plan('make an image');
    const jobId = await planner.runAsJob(graph, { actor: 'telegram' });

    assert.strictEqual(jobId, 'job-123');
    assert.strictEqual(created[0].type, 'plan.execute');
    assert.strictEqual(created[0].payload.graph.id, graph.id);
    assert.strictEqual(created[0].opts.createdBy, 'telegram');
  });

  test('the job handler rebuilds and runs the graph', async () => {
    const registry = testRegistry();
    const planner = new Planner({ registry });
    const graph = linearGraph();

    const handler = planner.planExecutionHandler();
    const out = await handler({ graph: graph.toJSON(), context: {} });

    assert.strictEqual(out.summary.status, GRAPH_STATUS.COMPLETED);
    assert.strictEqual(out.graph.nodes.find((n) => n.id === 'write').status, NODE_STATUS.COMPLETED);
  });

  test('requires an objective and a registry', async () => {
    await assert.rejects(() => new Planner({ registry: testRegistry() }).plan(''), /objective is required/);
    await assert.rejects(() => new Planner({}).plan('x'), /capability registry/);
  });
});
