import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ContactDiscovery } from './contacts.js';

describe('contact.discover', () => {
  test('extracts json-ld people and does not invent emails', async () => {
    const html = `
      <html><body>
        <script type="application/ld+json">${JSON.stringify({
          '@type': 'Person',
          name: 'Ada West',
          jobTitle: 'VP Growth',
          email: 'ada@example-company.test'
        })}</script>
        <div class="team">Jordan Lee, Head of Partnerships</div>
      </body></html>`;
    const discovery = new ContactDiscovery({
      scraper: {
        scrape: async (url) => ({ status: 'ok', url, html, markdown: '', finalUrl: url })
      }
    });
    const out = await discovery.discover({
      organizationName: 'Example Co',
      website: 'https://example-company.test'
    });
    assert.equal(out.fabricated, false);
    assert.ok(out.contacts.some((c) => c.fullName === 'Ada West' && c.title === 'VP Growth'));
    assert.ok(out.contacts.some((c) => c.fullName === 'Jordan Lee'));
    assert.ok(out.contacts.every((c) => c.email !== 'guessed@example-company.test'));
  });

  test('returns empty contacts rather than guessing when the page has no people', async () => {
    const discovery = new ContactDiscovery({
      scraper: {
        scrape: async (url) => ({ status: 'ok', url, html: '<html><body><p>Welcome</p></body></html>', markdown: 'Welcome' })
      }
    });
    const out = await discovery.discover({ organizationName: 'Quiet Co', website: 'https://quiet.test' });
    assert.equal(out.contacts.length, 0);
    assert.equal(out.fabricated, false);
  });

  test('rejects job titles scraped as if they were people', async () => {
    const html = '<div class="team">Chief Executive Officer, Founder Read Bio Jon WatermanChief Executive Officer</div>';
    const discovery = new ContactDiscovery({
      scraper: { scrape: async (url) => ({ status: 'ok', url, html, markdown: html }) }
    });
    const out = await discovery.discover({ organizationName: 'Ad.net', website: 'https://ad.net' });
    assert.equal(out.contacts.length, 0);
  });

  test('uses profile target roles and Apollo people without inventing emails', async () => {
    const discovery = new ContactDiscovery({
      scraper: { scrape: async (url) => ({ status: 'ok', url, html: '<p>none</p>', markdown: 'none' }) },
      apollo: {
        isAvailable: () => true,
        searchPeople: async ({ titles }) => {
          assert.ok(titles.length > 0);
          return {
            status: 'ok',
            people: [{
              personId: 'p1',
              providerPersonId: 'p1',
              fullName: 'Ada West',
              title: 'VP of Growth',
              organization: 'Example Co',
              email: null,
              phone: null,
              provider: 'apollo',
              source: 'apollo:mixed_people/api_search'
            }]
          };
        }
      }
    });
    const out = await discovery.discover({
      organization: 'Example Co',
      website: 'https://example-company.test',
      objective: 'qentrax-buyer',
      qualificationProfile: 'qentrax-buyer'
    });
    assert.equal(out.contacts[0].fullName, 'Ada West');
    assert.equal(out.contacts[0].email, null);
    assert.ok(out.targetRoles.includes('VP of Growth'));
    assert.equal(out.fabricated, false);
  });
});
