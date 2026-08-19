import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AcquisitionEngine } from './engine.js';
import { AcquisitionStore } from './store.js';
import { ProspectEnricher } from './enrich.js';

describe('AcquisitionEngine', () => {
  test('runs discover → extract → normalize → dedupe → store → n8n against injected pages', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'acq-engine-'));
    const html = `
      <html><body>
        <div class="exhibitor-card"><h3>Northbeam</h3><a href="https://www.northbeam.io">site</a></div>
        <div class="exhibitor-card"><h3>Triple Whale</h3><a href="https://www.triplewhale.com">site</a></div>
        <div class="exhibitor-card"><h3>Northbeam</h3><a href="https://northbeam.io">dup</a></div>
      </body></html>`;
    let workflowPayload = null;
    const engine = new AcquisitionEngine({
      firecrawl: { isAvailable: () => false, scrape: async () => ({ status: 'unavailable' }), crawl: async () => ({ status: 'unavailable' }) },
      spider: {
        isAvailable: () => true,
        scrape: async (url) => ({
          status: 'ok',
          provider: 'custom-spider',
          url,
          html,
          markdown: '# Exhibitors',
          links: [],
          metadata: { title: '2026 Exhibitors', sourceURL: url }
        }),
        crawl: async (url) => ({
          status: 'ok',
          provider: 'custom-spider',
          url,
          pages: [
            {
              status: 'ok',
              provider: 'custom-spider',
              url,
              html,
              markdown: '# Exhibitors',
              links: [],
              metadata: { title: '2026 Exhibitors', sourceURL: url }
            },
            {
              status: 'ok',
              provider: 'custom-spider',
              url: url + '/northbeam',
              html: '<div class="exhibitor-card"><h3>Northbeam</h3><a href="https://northbeam.io">site</a></div>',
              markdown: '',
              links: [],
              metadata: { title: 'Northbeam', sourceURL: url + '/northbeam' }
            }
          ]
        })
      },
      search: { isAvailable: () => true, search: async () => ({ status: 'ok', results: [] }) },
      store: new AcquisitionStore({ dir }),
      enricher: new ProspectEnricher({ scraper: null }),
      n8n: {
        execute: async (alias, payload) => {
          workflowPayload = { alias, payload };
          return { alias, status: 'executed', executionId: 'n8n-77', providerExecutionId: 'n8n-77' };
        }
      }
    });

    try {
      const result = await engine.run({
        objective: 'Find exhibitors from this conference directory',
        sourceUrl: 'https://show.test/exhibitors-2026',
        sourceEvent: 'Affiliate Summit West 2026',
        skipEnrich: true,
        maxOrganizations: 20
      });
      assert.equal(result.status, 'ok');
      assert.match(result.runId, /^acq_/);
      assert.equal(result.contacted, false);
      assert.ok(result.stats.uniqueOrganizations >= 2);
      assert.ok(result.stats.duplicatesRemoved >= 1);
      assert.equal(result.workflow.executionId, 'n8n-77');
      assert.equal(workflowPayload.alias, 'acquisition-test');
      assert.ok(Array.isArray(workflowPayload.payload.prospects));
      assert.equal(typeof workflowPayload.payload.prospects[0].organizationName, 'string');
      assert.equal(workflowPayload.payload.prospects[0].html, undefined);
      const stored = engine.getRun(result.runId);
      assert.equal(stored.runId, result.runId);
      assert.match(result.summary, /Acquisition complete/);
      assert.match(result.summary, /Unique organizations/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('falls back from Firecrawl failure to the custom spider', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'acq-fb-'));
    const engine = new AcquisitionEngine({
      firecrawl: {
        isAvailable: () => true,
        scrape: async () => ({ status: 'failed', provider: 'firecrawl', error: 'quota' }),
        crawl: async () => ({ status: 'failed', provider: 'firecrawl', error: 'quota', pages: [] })
      },
      spider: {
        isAvailable: () => true,
        scrape: async (url) => ({
          status: 'ok', provider: 'custom-spider', url,
          html: '<div class="exhibitor"><h3>Voluum</h3></div>',
          markdown: '', links: [], metadata: { title: 'Exhibitors' }
        }),
        crawl: async () => ({ status: 'failed', provider: 'custom-spider', error: 'seed only', pages: [] })
      },
      store: new AcquisitionStore({ dir }),
      enricher: new ProspectEnricher({ scraper: null }),
      n8n: { execute: async () => ({ status: 'executed', executionId: '1' }) }
    });
    try {
      const result = await engine.run({
        sourceUrl: 'https://show.test/list',
        skipEnrich: true,
        objective: 'Find exhibitors'
      });
      assert.ok(result.prospects.some((p) => p.organizationName === 'Voluum'));
      assert.ok(result.errors.some((e) => e.stage === 'crawl' && /quota/.test(e.error)));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
