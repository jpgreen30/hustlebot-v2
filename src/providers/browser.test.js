import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserRenderProvider } from './browser.js';

const WIDGET_HTML = `
<html><body>
  <livebuzz-widget organisation="clarion-events" campaign="affiliate-summit-west-2026" moduleId="exhibitors-2026" domain="control.buzz"></livebuzz-widget>
</body></html>`;

describe('BrowserRenderProvider', () => {
  test('parses a livebuzz widget from public HTML', () => {
    const provider = new BrowserRenderProvider({ fetchImpl: async () => ({ ok: false, status: 0, text: async () => '' }) });
    const widget = provider.parseLivebuzzWidget(WIDGET_HTML);
    assert.equal(widget.organisation, 'clarion-events');
    assert.equal(widget.campaign, 'affiliate-summit-west-2026');
    assert.equal(widget.moduleId, 'exhibitors-2026');
  });

  test('extracts exhibitors from public settings + search + detail, never hard-codes names', async () => {
    const hits = [
      { objectID: 'ex-1', name: 'Atwave' },
      { objectID: 'ex-2', name: 'Monetize.com' }
    ];
    const provider = new BrowserRenderProvider({
      fetchImpl: async (url, init = {}) => {
        if (String(url).includes('affiliatesummit.com')) {
          return { ok: true, status: 200, text: async () => WIDGET_HTML };
        }
        if (String(url).endsWith('/settings')) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              algolia: {
                application_id: 'APPID',
                search_only_api_key: 'search-only',
                indexes: { exhibitors: 'exhibitors' }
              }
            })
          };
        }
        if (String(url).includes('algolia.net')) {
          assert.equal(init.method, 'POST');
          assert.equal(init.headers['X-Algolia-API-Key'], 'search-only');
          return {
            ok: true,
            status: 200,
            json: async () => ({ results: [{ hits, nbHits: 2 }] }),
            text: async () => ''
          };
        }
        if (String(url).endsWith('/exhibitors/ex-1')) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              name: 'Atwave',
              website: 'https://atwave.com',
              biography: 'Performance marketing.',
              addresses: [{ city: 'Las Vegas', country: 'US' }]
            })
          };
        }
        if (String(url).endsWith('/exhibitors/ex-2')) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              name: 'Monetize.com',
              website: 'https://monetize.com',
              biography: 'Affiliate network.'
            })
          };
        }
        return { ok: false, status: 404, text: async () => '' };
      }
    });

    const out = await provider.render('https://www.affiliatesummit.com/west/exhibitors-2026', { maxRecords: 10 });
    assert.equal(out.status, 'ok');
    assert.equal(out.provider, 'public-directory');
    assert.equal(out.records.length, 2);
    assert.deepEqual(out.records.map((r) => r.name).sort(), ['Atwave', 'Monetize.com']);
    assert.equal(out.records[0].provenance.extractionMethod.includes('livebuzz'), true);
    assert.ok(!String(provider.parseLivebuzzWidget).includes('Atwave'));
  });

  test('fails closed when the page has no public directory widget and Firecrawl is down', async () => {
    const provider = new BrowserRenderProvider({
      firecrawl: { isAvailable: () => false },
      fetchImpl: async () => ({ ok: true, status: 200, text: async () => '<html><body>empty</body></html>' })
    });
    const out = await provider.render('https://example.com/no-widget');
    assert.equal(out.status, 'failed');
    assert.equal(out.records.length, 0);
    assert.match(out.error, /no public directory|no render provider/i);
  });
});
