import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FirecrawlProvider } from './firecrawl.js';

function mockFetch(handler) {
  return async (url, init = {}) => handler(url, init);
}

describe('FirecrawlProvider', () => {
  test('returns unavailable instead of fake content when unconfigured', async () => {
    const provider = new FirecrawlProvider({ apiKey: null });
    const out = await provider.scrape('https://example.com');
    assert.equal(out.status, 'unavailable');
    assert.match(out.reason, /FIRECRAWL_API_KEY/);
    assert.equal(out.markdown, undefined);
  });

  test('posts to v2 scrape with bearer auth and returns real payload fields', async () => {
    const seen = [];
    const provider = new FirecrawlProvider({
      apiKey: 'fc-test',
      fetchImpl: mockFetch(async (url, init) => {
        seen.push({ url, init });
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            success: true,
            data: {
              markdown: '# Example Domain',
              links: ['https://example.com/more'],
              metadata: { title: 'Example Domain', sourceURL: 'https://example.com', statusCode: 200 }
            }
          })
        };
      })
    });
    const out = await provider.scrape('https://example.com');
    assert.equal(out.status, 'ok');
    assert.equal(out.provider, 'firecrawl');
    assert.equal(out.markdown, '# Example Domain');
    assert.equal(out.metadata.title, 'Example Domain');
    assert.equal(seen[0].url, 'https://api.firecrawl.dev/v2/scrape');
    assert.match(seen[0].init.headers.Authorization, /Bearer fc-test/);
    const body = JSON.parse(seen[0].init.body);
    assert.equal(body.url, 'https://example.com');
    assert.ok(body.formats.includes('markdown'));
  });

  test('forwards waitFor, actions, and maxAge for JS-rendered pages', async () => {
    let body;
    const provider = new FirecrawlProvider({
      apiKey: 'fc-test',
      fetchImpl: mockFetch(async (url, init) => {
        body = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ success: true, data: { markdown: 'x', html: '<p>x</p>', metadata: {} } })
        };
      })
    });
    await provider.scrape('https://dir.test', {
      waitFor: 4000,
      maxAge: 0,
      actions: [{ type: 'wait', milliseconds: 4000 }]
    });
    assert.equal(body.waitFor, 4000);
    assert.equal(body.maxAge, 0);
    assert.deepEqual(body.actions, [{ type: 'wait', milliseconds: 4000 }]);
  });

  test('provider HTTP errors stay failures', async () => {
    const provider = new FirecrawlProvider({
      apiKey: 'fc-test',
      fetchImpl: mockFetch(async () => ({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ success: false, error: 'Unauthorized' })
      }))
    });
    const out = await provider.scrape('https://example.com');
    assert.equal(out.status, 'failed');
    assert.match(out.error, /Unauthorized|401/);
  });

  test('structured extract attaches the json schema format', async () => {
    let body;
    const provider = new FirecrawlProvider({
      apiKey: 'fc-test',
      fetchImpl: mockFetch(async (url, init) => {
        body = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            success: true,
            data: { markdown: 'x', json: { name: 'Acme' }, metadata: { sourceURL: 'https://acme.test' } }
          })
        };
      })
    });
    const out = await provider.extract('https://acme.test', { type: 'object', properties: { name: { type: 'string' } } });
    assert.equal(out.status, 'ok');
    assert.deepEqual(out.data, { name: 'Acme' });
    assert.equal(out.fabricated, false);
    assert.ok(body.formats.some((f) => f.type === 'json'));
  });

  test('crawl polls until completed and returns pages', async () => {
    let polls = 0;
    const provider = new FirecrawlProvider({
      apiKey: 'fc-test',
      pollIntervalMs: 1,
      fetchImpl: mockFetch(async (url, init) => {
        if (String(url).endsWith('/crawl') && init.method === 'POST') {
          return { ok: true, status: 200, text: async () => JSON.stringify({ success: true, id: 'job-1' }) };
        }
        polls += 1;
        if (polls < 2) {
          return { ok: true, status: 200, text: async () => JSON.stringify({ status: 'scraping', total: 1, completed: 0, data: [] }) };
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            status: 'completed',
            total: 1,
            completed: 1,
            creditsUsed: 2,
            data: [{ markdown: '# One', metadata: { sourceURL: 'https://example.com/one', statusCode: 200 } }]
          })
        };
      })
    });
    const out = await provider.crawl('https://example.com', { limit: 3 });
    assert.equal(out.status, 'ok');
    assert.equal(out.jobId, 'job-1');
    assert.equal(out.pages.length, 1);
    assert.equal(out.pages[0].markdown, '# One');
    assert.equal(out.creditsUsed, 2);
  });
});
