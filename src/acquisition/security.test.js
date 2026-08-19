import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityRegistry } from '../core/capability-registry.js';
import { registerPlatformCapabilities } from '../core/platform-capabilities.js';
import { registerAcquisitionCapabilities } from './register.js';
import { ActionBridge } from '../core/action-bridge.js';
import { IntentDetector } from '../core/intent-detector.js';
import { ScrapingIntegration } from '../integrations/scraping-integration.js';

describe('Day-2 wiring', () => {
  test('scraping integration no longer returns generated lorem content', async () => {
    const scraping = new ScrapingIntegration({
      provider: {
        apiKey: null,
        isAvailable: () => false,
        lastError: null,
        scrape: async () => ({ status: 'unavailable', reason: 'FIRECRAWL_API_KEY not configured' }),
        extract: async () => ({ status: 'unavailable', reason: 'FIRECRAWL_API_KEY not configured' }),
        crawl: async () => ({ status: 'unavailable', reason: 'FIRECRAWL_API_KEY not configured' })
      }
    });
    const page = await scraping.scrapePage('https://example.com');
    assert.equal(page.status, 'unavailable');
    assert.equal(page.content, undefined);
    assert.equal(page.markdown, undefined);
  });

  test('acquisition capabilities register without breaking Day-1 bindings', () => {
    const r = new CapabilityRegistry();
    registerPlatformCapabilities(r, {});
    registerAcquisitionCapabilities(r, {});
    assert.ok(r.has('web.scrape'));
    assert.ok(r.has('acquisition.run'));
    assert.ok(r.has('prospect.dedupe'));
    const gated = r.list().filter((c) => c.requiresApproval).map((c) => c.capabilityId).sort();
    assert.deepEqual(gated, ['payment.checkout', 'site.deploy', 'social.publish', 'voice.call']);
  });

  test('natural-language acquisition hint routes to acquisition.run', async () => {
    const detector = new IntentDetector({ llm: null, registry: new CapabilityRegistry() });
    const intent = detector.hintAcquisitionIntent(
      'Find exhibitors from https://www.affiliatesummit.com/west/exhibitors-2026 and build me a prospect list'
    );
    assert.equal(intent.capabilityId, 'acquisition.run');
    assert.equal(intent.parameters.sourceUrl, 'https://www.affiliatesummit.com/west/exhibitors-2026');
    assert.ok(intent.confidence >= 0.55);

    const registry = {
      has: () => true,
      resolve: () => [{ inputs: { type: 'object', properties: { objective: { type: 'string' } } } }],
      invoke: async (id, input) => ({
        result: {
          runId: 'acq_demo',
          summary: 'Acquisition complete.\nRun: acq_demo\nUnique organizations: 2',
          stats: { uniqueOrganizations: 2, pagesSuccessful: 1 },
          workflow: { executionId: '9' }
        }
      })
    };
    const bridge = new ActionBridge({ registry });
    const out = await bridge.execute(intent, { userId: 'test' });
    assert.equal(out.success, true);
    assert.match(out.conversationalResponse, /acq_demo|Unique organizations/);
  });
});
