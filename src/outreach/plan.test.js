import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { planOutreach } from './plan.js';

describe('outreach.plan', () => {
  test('grounds personalization in discovered facts and invents nothing', () => {
    const plan = planOutreach({
      prospectId: 'prs_1',
      organizationName: 'Everflow',
      description: 'Affiliate tracking platform',
      sourceEvent: 'affiliate-summit-west-2026',
      qualification: {
        reasoningSummary: 'Matched affiliate-network against qentrax-buyer',
        positiveSignals: [{ tag: 'affiliate-network' }]
      },
      contact: { fullName: 'Pat Lee', title: 'Partnerships', email: null }
    }, { objective: 'Find Qentrax buyers' });

    assert.equal(plan.grounded, true);
    assert.deepEqual(plan.inventedFacts, []);
    assert.ok(plan.personalizationFacts.some((f) => /Everflow/.test(f)));
    assert.ok(plan.personalizationFacts.some((f) => /affiliate-summit-west-2026/.test(f)));
    assert.ok(!/funded|raised \$|just hired/i.test(JSON.stringify(plan)));
    assert.equal(plan.channelPriority.includes('email'), false);
    assert.ok(plan.channelPriority.includes('manual-research'));
  });
});
