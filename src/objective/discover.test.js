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

  test('spider 403 falls back to browser/firecrawl html extraction', async () => {
    const discovery = new OrgDiscovery({
      search: {
        search: async () => ({ status: 'failed', provider: 'bing', results: [], error: 'empty' })
      },
      spider: {
        scrape: async () => ({ status: 'failed', provider: 'custom-spider', error: 'HTTP 403' })
      },
      browser: {
        render: async (url) => ({
          status: 'ok',
          provider: 'firecrawl',
          url,
          html: '<a class="business-name" href="/mip/lang-roofing-inc">Lang Roofing Inc</a><a class="business-name" href="/mip/sunset-roof">Sunset Roofing</a>'
        })
      }
    });
    const out = await discovery.discover({
      query: 'Los Angeles roofing companies',
      location: 'Los Angeles',
      industry: 'roofing',
      maxOrganizations: 5
    });
    assert.equal(out.status, 'ok');
    assert.ok(out.prospects.some((p) => p.organizationName === 'Lang Roofing Inc'));
    assert.ok(out.providers.includes('firecrawl') || out.providers.includes('browser-render'));
  });

  test('company/product ranking prefers real products over encyclopedia and clinical articles', async () => {
    const discovery = new OrgDiscovery({
      search: {
        search: async () => ({
          status: 'ok',
          provider: 'bing',
          results: [
            { title: 'Pregnancy - Cleveland Clinic', url: 'https://my.clevelandclinic.org/health/articles/pregnancy', snippet: 'Clinical overview of pregnancy' },
            { title: 'CDC Pregnancy', url: 'https://www.cdc.gov/pregnancy/index.html', snippet: 'CDC guidelines' },
            { title: 'Pregnancy - Wikipedia', url: 'https://en.wikipedia.org/wiki/Pregnancy' },
            { title: 'Best pregnancy apps YouTube', url: 'https://www.youtube.com/watch?v=abc123', snippet: 'Video roundup' },
            { title: 'Pregnancy week-by-week calendar', url: 'https://www.babycenter.com/pregnancy/week-by-week', snippet: 'Symptoms and signs by week' },
            { title: 'Pregnancy Information: Health, Your Body, Preparing for a Baby', url: 'https://www.whattoexpect.com/pregnancy', snippet: 'Pregnancy information' },
            { title: 'Peanut App', url: 'https://www.peanut-app.io', snippet: 'Social network app for women and mothers' },
            { title: 'The Bump', url: 'https://www.thebump.com', snippet: 'Pregnancy and baby tracking app' },
            { title: 'Ovia Health', url: 'https://www.oviahealth.com', snippet: 'Pregnancy tracker app and platform' },
            { title: 'What to Expect', url: 'https://www.whattoexpect.com', snippet: 'Pregnancy app and parenting community platform' }
          ]
        })
      }
    });
    const out = await discovery.discover({
      query: 'pregnancy apps and parenting platforms',
      objective: 'Research 10 pregnancy apps and parenting platforms. Do not contact anyone.',
      maxOrganizations: 8
    });
    assert.equal(out.status, 'ok');
    const names = out.prospects.map((p) => p.organizationName).join(' ');
    assert.match(names, /Peanut|Ovia|Bump|What to Expect/i);
    assert.ok(!out.prospects.some((p) => /cleveland|cdc|wikipedia|youtube|week-by-week|Preparing for a Baby|\/pregnancy$/i.test(`${p.organizationName} ${p.website}`)));
  });

  test('roofing search does not keep dictionary or abbreviation hits that fail the query', async () => {
    const discovery = new OrgDiscovery({
      search: {
        search: async () => ({
          status: 'ok',
          provider: 'bing',
          results: [
            { title: 'What does LOS mean? - Abbreviation Finder', url: 'https://www.abbreviationfinder.org/acronyms/los.html', snippet: 'LOS stands for Los' },
            { title: 'HomeRepairly Roofing', url: 'https://www.homerepairly.com', snippet: 'Los Angeles roofing company' },
            { title: 'Dorantes Construction', url: 'https://dorantesconstruction.com', snippet: 'Roofing contractor in Los Angeles' }
          ]
        })
      }
    });
    const out = await discovery.discover({
      query: 'Los Angeles roofing companies',
      objective: 'Research 3 Los Angeles roofing companies, rank them, do not contact anyone.',
      maxOrganizations: 5
    });
    assert.equal(out.status, 'ok');
    const names = out.prospects.map((p) => p.organizationName).join(' ');
    assert.match(names, /HomeRepairly|Dorantes/i);
    assert.ok(!out.prospects.some((p) => /abbreviation|los mean/i.test(`${p.organizationName} ${p.website}`)));
  });
});

