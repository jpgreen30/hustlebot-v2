import { test, describe } from 'node:test';
import assert from 'node:assert';
import { CapabilityRegistry, validateInput } from './capability-registry.js';
import { registerPlatformCapabilities } from './platform-capabilities.js';

const base = (over = {}) => ({
  capabilityId: 'test.do',
  name: 'Test capability',
  provider: 'alpha',
  handler: async () => 'ok',
  ...over
});

describe('CapabilityRegistry', () => {
  test('rejects registrations missing required spec fields', () => {
    const r = new CapabilityRegistry();
    assert.throws(() => r.register({ name: 'x', provider: 'a', handler: () => {} }), /capabilityId/);
    assert.throws(() => r.register({ capabilityId: 'a.b', provider: 'a', handler: () => {} }), /name/);
    assert.throws(() => r.register({ capabilityId: 'a.b', name: 'x', handler: () => {} }), /provider/);
    assert.throws(() => r.register(base({ handler: 'not-a-function' })), /must be a function/);
  });

  test('invokes a capability and returns a record with cost and latency', async () => {
    const r = new CapabilityRegistry();
    r.register(base({ expectedCost: 0.02, handler: async (input) => `got ${input.value}` }));

    const out = await r.invoke('test.do', { value: 42 });
    assert.strictEqual(out.result, 'got 42');
    assert.strictEqual(out.provider, 'alpha');
    assert.strictEqual(out.success, true);
    assert.strictEqual(out.cost, 0.02);
    assert.ok(typeof out.latencyMs === 'number');
  });

  test('falls back to the next provider when the preferred one fails', async () => {
    const r = new CapabilityRegistry();
    const calls = [];
    r.register(base({
      provider: 'alpha', reliability: 0.99, expectedCost: 0,
      handler: async () => { calls.push('alpha'); throw new Error('alpha down'); }
    }));
    r.register(base({
      provider: 'beta', reliability: 0.5, expectedCost: 0,
      handler: async () => { calls.push('beta'); return 'from beta'; }
    }));

    const out = await r.invoke('test.do', {});
    assert.deepStrictEqual(calls, ['alpha', 'beta'], 'should try alpha first, then fall back');
    assert.strictEqual(out.result, 'from beta');
    assert.strictEqual(out.provider, 'beta');
  });

  test('skips providers that report themselves unavailable', async () => {
    const r = new CapabilityRegistry();
    r.register(base({ provider: 'offline', isAvailable: () => false, handler: async () => 'nope' }));
    r.register(base({ provider: 'online', handler: async () => 'yes' }));

    const out = await r.invoke('test.do', {});
    assert.strictEqual(out.provider, 'online');

    const resolved = r.resolve('test.do');
    assert.deepStrictEqual(resolved.map((e) => e.provider), ['online']);
  });

  test('throws a clear error when no provider is available', async () => {
    const r = new CapabilityRegistry();
    r.register(base({ isAvailable: () => false }));
    await assert.rejects(() => r.invoke('test.do', {}), /No available provider/);
    await assert.rejects(() => r.invoke('nope.missing', {}), /Unknown capability/);
  });

  test('enforces declared permissions', async () => {
    const r = new CapabilityRegistry();
    r.register(base({ permissions: ['payments'] }));

    await assert.rejects(() => r.invoke('test.do', {}, {}), /failed on every provider/);
    const granted = await r.invoke('test.do', {}, { permissions: ['payments'] });
    assert.strictEqual(granted.result, 'ok');

    const bypassed = await r.invoke('test.do', {}, { bypassPermissions: true });
    assert.strictEqual(bypassed.result, 'ok');
  });

  test('validates input against the declared schema before calling out', async () => {
    const r = new CapabilityRegistry();
    let called = false;
    r.register(base({
      inputs: {
        type: 'object',
        properties: { url: { type: 'string' }, mode: { type: 'string', enum: ['fast', 'full'] } },
        required: ['url']
      },
      handler: async () => { called = true; return 'ok'; }
    }));

    await assert.rejects(() => r.invoke('test.do', {}), /missing required field "url"/);
    await assert.rejects(() => r.invoke('test.do', { url: 12 }), /should be string/);
    await assert.rejects(() => r.invoke('test.do', { url: 'x', mode: 'turbo' }), /must be one of/);
    assert.strictEqual(called, false, 'must not reach the provider with invalid input');

    const ok = await r.invoke('test.do', { url: 'https://example.com', mode: 'fast' });
    assert.strictEqual(ok.result, 'ok');
  });

  test('filters providers by vertical support', async () => {
    const r = new CapabilityRegistry();
    r.register(base({ provider: 'general', supportedVerticals: ['*'] }));
    r.register(base({ provider: 'btb-only', supportedVerticals: ['babytobloom'] }));

    assert.deepStrictEqual(
      r.resolve('test.do', { vertical: 'other' }).map((e) => e.provider),
      ['general']
    );
    assert.strictEqual(r.resolve('test.do', { vertical: 'babytobloom' }).length, 2);
  });

  test('ranks cheaper and faster providers higher, all else equal', () => {
    const r = new CapabilityRegistry();
    r.register(base({ provider: 'pricey', expectedCost: 1, expectedLatencyMs: 5000, reliability: 0.95 }));
    r.register(base({ provider: 'cheap', expectedCost: 0.001, expectedLatencyMs: 500, reliability: 0.95 }));

    assert.strictEqual(r.resolve('test.do')[0].provider, 'cheap');
  });

  test('observed failures push a provider down the ranking', async () => {
    const r = new CapabilityRegistry();
    r.register(base({
      provider: 'flaky', expectedCost: 0, reliability: 0.99,
      handler: async () => { throw new Error('down'); }
    }));
    r.register(base({ provider: 'steady', expectedCost: 0, reliability: 0.9, handler: async () => 'ok' }));

    assert.strictEqual(r.resolve('test.do')[0].provider, 'flaky', 'starts ahead on declared reliability');

    for (let i = 0; i < 10; i++) await r.invoke('test.do', {});

    assert.strictEqual(r.resolve('test.do')[0].provider, 'steady', 'observed failures should demote it');
  });

  test('honours allowFallback:false and an explicit provider', async () => {
    const r = new CapabilityRegistry();
    r.register(base({ provider: 'alpha', handler: async () => { throw new Error('alpha down'); } }));
    r.register(base({ provider: 'beta', handler: async () => 'from beta' }));

    await assert.rejects(
      () => r.invoke('test.do', {}, { provider: 'alpha' }),
      /failed on every provider/
    );
    const pinned = await r.invoke('test.do', {}, { provider: 'beta' });
    assert.strictEqual(pinned.provider, 'beta');
  });

  test('emits an invocation record for audit and cost tracking', async () => {
    const seen = [];
    const r = new CapabilityRegistry({ onInvocation: (rec) => seen.push(rec) });
    r.register(base({ provider: 'alpha', expectedCost: 0.5, handler: async () => 'ok' }));
    r.register(base({ capabilityId: 'test.fail', provider: 'alpha', handler: async () => { throw new Error('nope'); } }));

    await r.invoke('test.do', {}, { jobId: 'job-1', projectId: 'proj-9', actor: 'planner' });
    await assert.rejects(() => r.invoke('test.fail', {}));

    assert.strictEqual(seen.length, 2);
    assert.strictEqual(seen[0].success, true);
    assert.strictEqual(seen[0].jobId, 'job-1');
    assert.strictEqual(seen[0].projectId, 'proj-9');
    assert.strictEqual(seen[0].actor, 'planner');
    assert.strictEqual(seen[0].cost, 0.5);
    assert.strictEqual(seen[1].success, false);
    assert.match(seen[1].error, /nope/);
  });

  test('describe() exposes the full spec metadata without the handler', () => {
    const r = new CapabilityRegistry();
    r.register(base({
      version: '2.1.0', mcpTool: 'invoke_capability', permissions: ['data.read'],
      expectedCost: 0.01, expectedLatencyMs: 900, supportedVerticals: ['babytobloom'],
      failureModes: ['timeout'], fallbackProvider: 'beta', requiresApproval: true
    }));

    const d = r.describe('test.do').providers[0];
    for (const field of ['provider', 'version', 'mcpTool', 'permissions', 'inputs', 'outputs',
      'expectedCost', 'expectedLatencyMs', 'reliability', 'supportedVerticals',
      'failureModes', 'fallbackProvider', 'requiresApproval']) {
      assert.ok(field in d, `describe() should expose ${field}`);
    }
    assert.strictEqual(d.handler, undefined, 'must not leak the handler');
    assert.strictEqual(d.requiresApproval, true);
    assert.strictEqual(r.describe('nope'), null);
  });

  test('list() reports availability and preferred provider', async () => {
    const r = new CapabilityRegistry();
    r.register(base({ capabilityId: 'a.one', provider: 'x' }));
    r.register(base({ capabilityId: 'b.two', provider: 'y', isAvailable: () => false }));

    const all = r.list();
    assert.deepStrictEqual(all.map((c) => c.capabilityId), ['a.one', 'b.two']);
    assert.strictEqual(all.find((c) => c.capabilityId === 'a.one').preferredProvider, 'x');
    assert.strictEqual(all.find((c) => c.capabilityId === 'b.two').available, false);

    const onlyUsable = r.list({ availableOnly: true });
    assert.deepStrictEqual(onlyUsable.map((c) => c.capabilityId), ['a.one']);
  });

  test('re-registering the same provider replaces rather than duplicates', async () => {
    const r = new CapabilityRegistry();
    r.register(base({ provider: 'alpha', handler: async () => 'v1' }));
    r.register(base({ provider: 'alpha', handler: async () => 'v2' }));

    assert.strictEqual(r.describe('test.do').providers.length, 1);
    assert.strictEqual((await r.invoke('test.do', {})).result, 'v2');
  });

  test('unregister removes a provider or the whole capability', () => {
    const r = new CapabilityRegistry();
    r.register(base({ provider: 'alpha' }));
    r.register(base({ provider: 'beta' }));

    assert.strictEqual(r.unregister('test.do', 'alpha'), true);
    assert.deepStrictEqual(r.describe('test.do').providers.map((p) => p.provider), ['beta']);
    assert.strictEqual(r.unregister('test.do', 'ghost'), false);
    assert.strictEqual(r.unregister('test.do'), true);
    assert.strictEqual(r.has('test.do'), false);
  });

  test('getStats aggregates invocations and spend', async () => {
    const r = new CapabilityRegistry();
    r.register(base({ expectedCost: 0.25 }));
    await r.invoke('test.do', {});
    await r.invoke('test.do', {});

    const s = r.getStats();
    assert.strictEqual(s.capabilities, 1);
    assert.strictEqual(s.invocations, 2);
    assert.strictEqual(s.successes, 2);
    assert.strictEqual(s.successRate, 1);
    assert.strictEqual(s.totalCost, 0.5);
  });
});

describe('validateInput', () => {
  test('treats a missing schema as no constraint', () => {
    assert.deepStrictEqual(validateInput(null, { anything: true }), []);
  });

  test('accepts arrays as their own type rather than object', () => {
    const schema = { type: 'object', properties: { items: { type: 'array' } } };
    assert.deepStrictEqual(validateInput(schema, { items: [1, 2] }), []);
    assert.strictEqual(validateInput(schema, { items: { a: 1 } }).length, 1);
  });
});

describe('platform capability bindings', () => {
  test('registers the spec capability ids and marks missing services unavailable', () => {
    const r = new CapabilityRegistry();
    registerPlatformCapabilities(r, {}); // nothing wired up

    for (const id of ['web.scrape', 'lead.enrich', 'lead.score', 'lead.route', 'email.send',
      'voice.call', 'video.generate', 'social.publish', 'site.build', 'site.deploy',
      'payment.checkout', 'analytics.query']) {
      assert.ok(r.has(id), `spec capability "${id}" should be registered`);
    }

    // Known but unusable, rather than silently absent.
    assert.strictEqual(r.list({ availableOnly: true }).length, 0);
    assert.strictEqual(r.getStats().availableCapabilities, 0);
  });

  test('a capability becomes available once its service is wired in', async () => {
    const r = new CapabilityRegistry();
    registerPlatformCapabilities(r, {
      scrapingIntegration: { scrapePage: async (url) => ({ content: `scraped ${url}` }) }
    });

    assert.deepStrictEqual(
      r.list({ availableOnly: true }).map((c) => c.capabilityId),
      ['web.scrape']
    );

    const out = await r.invoke('web.scrape', { url: 'https://example.com' }, {
      permissions: ['network.read']
    });
    assert.deepStrictEqual(out.result, { content: 'scraped https://example.com' });
  });

  test('consequential capabilities are flagged for the approval layer', () => {
    const r = new CapabilityRegistry();
    registerPlatformCapabilities(r, {});

    const gated = r.list().filter((c) => c.requiresApproval).map((c) => c.capabilityId).sort();
    assert.deepStrictEqual(gated, ['payment.checkout', 'site.deploy', 'social.publish', 'voice.call']);
  });
});
