import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EnrichmentRouter } from './enrichment.js';

describe('enrichment provider registry', () => {
  test('runs public web then apollo in configurable order and does not fabricate', async () => {
    const router = new EnrichmentRouter({
      publicWeb: {
        enrichOne: async (prospect) => ({
          prospect: { ...prospect, description: prospect.description || 'public desc' },
          additions: [{ field: 'description', source: 'public-web' }]
        })
      },
      apollo: {
        isAvailable: () => true,
        enrichOrganization: async () => ({
          status: 'ok',
          organization: { industry: 'affiliate', estimatedNumEmployees: 80, shortDescription: null, linkedinUrl: null }
        })
      }
    });
    const out = await router.enrich([{ organizationName: 'Katalys', domain: 'katalys.com' }]);
    assert.deepEqual(out.providers.sort(), ['APOLLO', 'PUBLIC_WEB']);
    assert.equal(out.prospects[0].description, 'public desc');
    assert.equal(out.prospects[0].company.industry, 'affiliate');
    assert.equal(out.fabricated, false);
    assert.equal(router.providerStatus().APOLLO, 'AVAILABLE');
  });

  test('reports Apollo UNAVAILABLE without a key and still uses public web', async () => {
    const router = new EnrichmentRouter({
      publicWeb: { enrichOne: async (p) => ({ prospect: p, additions: [] }) },
      apollo: { isAvailable: () => false }
    });
    const out = await router.enrich([{ organizationName: 'X' }]);
    assert.equal(out.providerStatus.APOLLO, 'UNAVAILABLE');
    assert.ok(!out.providers.includes('APOLLO'));
  });
});
