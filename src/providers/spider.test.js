import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CustomSpider, canonicalizeUrl, hostnameOf } from './spider.js';

describe('CustomSpider helpers', () => {
  test('canonicalizes and strips fragments', () => {
    assert.equal(canonicalizeUrl('https://A.com/path/#x'), 'https://a.com/path');
    assert.equal(hostnameOf('https://www.Acme.com/x'), 'acme.com');
  });
});

describe('CustomSpider', () => {
  test('scrapes a real HTML payload without inventing emails', async () => {
    const html = `<html><head><title>Acme Booth</title></head>
      <body><h1>Acme Analytics</h1><p>Visit us</p>
      <a href="/about">About</a></body></html>`;
    const spider = new CustomSpider({
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        url: 'https://acme.test/booth',
        text: async () => html,
        headers: { get: () => 'text/html' }
      })
    });
    const page = await spider.scrape('https://acme.test/booth');
    assert.equal(page.status, 'ok');
    assert.equal(page.provider, 'custom-spider');
    assert.match(page.markdown, /Acme Booth/);
    assert.equal(page.fabricated, false);
    assert.ok(page.links.some((u) => u.includes('/about')));
  });

  test('HTTP failures stay failures', async () => {
    const spider = new CustomSpider({
      fetchImpl: async () => ({
        ok: false,
        status: 403,
        url: 'https://secret.test',
        text: async () => 'nope',
        headers: { get: () => 'text/html' }
      })
    });
    const page = await spider.scrape('https://secret.test');
    assert.equal(page.status, 'failed');
    assert.match(page.error, /403/);
    assert.equal(page.html, null);
  });

  test('crawl stays on-domain and respects robots disallow', async () => {
    const pages = {
      'https://show.test/robots.txt': 'User-agent: *\nDisallow: /private\n',
      'https://show.test/exhibitor': `<html><body>
        <a href="/exhibitor/acme">Acme</a>
        <a href="/private/secret">Secret</a>
        <a href="https://other.test/x">Offsite</a>
      </body></html>`,
      'https://show.test/exhibitor/acme': '<html><head><title>Acme</title></head><body>Acme booth</body></html>'
    };
    const spider = new CustomSpider({
      crawlDelayMs: 0,
      fetchImpl: async (url) => {
        const html = pages[url];
        if (!html) return { ok: false, status: 404, url, text: async () => '', headers: { get: () => 'text/plain' } };
        return { ok: true, status: 200, url, text: async () => html, headers: { get: () => 'text/html' } };
      }
    });
    const out = await spider.crawl('https://show.test/exhibitor', { maxPages: 5, maxDepth: 2, crawlDelayMs: 0 });
    assert.equal(out.status, 'ok');
    assert.ok(out.pages.some((p) => p.url.includes('/exhibitor/acme')));
    assert.equal(out.pages.some((p) => p.url.includes('/private')), false);
    assert.ok(out.skipped.some((s) => s.reason === 'robots.txt' || s.reason === 'domain-not-allowed'));
  });
});
