import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extractProspectsFromPage, extractEmails } from './extract.js';

describe('extract', () => {
  test('extracts organizations from json-ld and visible cards', () => {
    const html = `
      <html><head>
        <script type="application/ld+json">${JSON.stringify({
          '@type': 'Organization',
          name: 'Northbeam',
          url: 'https://www.northbeam.io',
          email: 'hello@northbeam.io'
        })}</script>
      </head>
      <body>
        <div class="exhibitor-card"><h3>Triple Whale</h3><a href="https://www.triplewhale.com">site</a></div>
      </body></html>`;
    const found = extractProspectsFromPage({
      url: 'https://show.test/exhibitors',
      html,
      markdown: '# Exhibitors\n- [Voluum](https://voluum.com)',
      metadata: { title: '2026 Exhibitors' },
      provider: 'custom-spider',
      sourceType: 'exhibitor',
      sourceEvent: 'ASW 2026'
    });
    const names = found.map((p) => p.organizationName);
    assert.ok(names.includes('Northbeam'));
    assert.ok(names.includes('Triple Whale'));
    const northbeam = found.find((p) => p.organizationName === 'Northbeam');
    assert.equal(northbeam.contact.email, 'hello@northbeam.io');
    assert.equal(northbeam.domain, 'northbeam.io');
    assert.equal(northbeam.provenance.extractionMethod, 'json-ld');
  });

  test('does not invent emails that are not on the page', () => {
    const found = extractProspectsFromPage({
      url: 'https://show.test/x',
      html: '<div class="exhibitor"><h3>Quiet Co</h3></div>',
      markdown: '',
      metadata: { title: 'Exhibitors' }
    });
    assert.equal(found[0].organizationName, 'Quiet Co');
    assert.equal(found[0].contact.email, null);
    assert.deepEqual(extractEmails('no addresses here'), []);
  });
});
