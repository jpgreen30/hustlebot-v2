import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { OrgDiscovery } from './discover.js';

describe('OrgDiscovery search-shaped routing', () => {
  test('does not fall through to acquisition without a sourceUrl', async () => {
    let acquisitionCalled = false;
    const discovery = new OrgDiscovery({
      search: {
        search: async () => ({ status: 'failed', provider: 'duckduckgo', error: 'challenge page', results: [] })
      },
      acquisition: {
        run: async () => {
          acquisitionCalled = true;
          return { prospects: [{ organizationName: 'ASW Exhibitor' }] };
        }
      }
    });
    const out = await discovery.discover({ query: 'Los Angeles roofing companies', objective: 'Find roofers' });
    assert.equal(acquisitionCalled, false);
    assert.equal(out.prospects.length, 0);
    assert.notEqual(out.status, 'ok');
  });

  test('extracts organizations from a public directory found by search', async () => {
    const discovery = new OrgDiscovery({
      search: {
        search: async () => ({
          status: 'ok',
          provider: 'duckduckgo-lite',
          results: [{
            title: 'Roofing Contractors - Yellow Pages',
            url: 'https://www.yellowpages.com/los-angeles-ca/roofing-contractors',
            snippet: 'Directory'
          }]
        })
      },
      spider: {
        scrape: async () => ({
          status: 'ok',
          provider: 'custom-spider',
          url: 'https://www.yellowpages.com/los-angeles-ca/roofing-contractors',
          html: `
            <div>
              <a class="business-name" href="/los-angeles-ca/mip/lang-roofing-inc">Lang Roofing Inc</a>
              <a class="business-name" href="/los-angeles-ca/mip/fava-roofing">Fava Roofing</a>
              <a class="business-name" href="/los-angeles-ca/mip/dorantes">Dorantes Construction</a>
            </div>
          `,
          markdown: '',
          metadata: { title: 'Roofing Contractors in Los Angeles, CA' }
        })
      }
    });
    const out = await discovery.discover({ query: 'Los Angeles roofing companies', maxOrganizations: 5 });
    assert.equal(out.status, 'ok');
    const names = out.prospects.map((p) => p.organizationName);
    assert.ok(names.includes('Lang Roofing Inc'));
    assert.ok(names.includes('Fava Roofing'));
    assert.ok(!names.includes('Yellow Pages'));
  });

  test('encyclopedia search hits are not companies; location+industry seeds a public directory', async () => {
    const discovery = new OrgDiscovery({
      search: {
        search: async () => ({
          status: 'ok',
          provider: 'bing',
          results: [
            { title: 'Los Angeles - Wikipedia', url: 'https://en.wikipedia.org/wiki/Los_Angeles' },
            { title: 'Los Angeles | Britannica', url: 'https://www.britannica.com/place/Los-Angeles-California' },
            { title: 'Los Angeles Times', url: 'https://www.latimes.com' }
          ]
        })
      },
      spider: {
        scrape: async (url) => {
          if (!/yellowpages\.com\/los-angeles-ca\/roofing/.test(url)) {
            return { status: 'failed', error: `unexpected ${url}` };
          }
          return {
            status: 'ok',
            provider: 'custom-spider',
            url,
            html: '<a class="business-name" href="/mip/lang-roofing-inc">Lang Roofing Inc</a><a class="business-name" href="/mip/fava-roofing">Fava Roofing</a><a class="business-name" href="/mip/dorantes">Dorantes Construction</a>',
            markdown: '',
            metadata: { title: 'Roofing Contractors' }
          };
        }
      }
    });
    const out = await discovery.discover({
      query: 'Los Angeles roofing companies',
      location: 'Los Angeles',
      industry: 'roofing',
      maxOrganizations: 5
    });
    assert.equal(out.status, 'ok');
    const names = out.prospects.map((p) => p.organizationName);
    assert.ok(names.includes('Lang Roofing Inc'));
    assert.ok(!names.some((n) => /wikipedia|britannica|times/i.test(n)));
    assert.match(out.reasonSelected, /public business directory|directory pages/i);
  });
});
