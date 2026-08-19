import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { scoreProspect, rankProspects } from './score.js';

describe('prospect.score', () => {
  test('stores explainable component scores on a 0-100 scale', () => {
    const scored = scoreProspect({
      organizationName: 'Katalys',
      website: 'https://katalys.com',
      description: 'Affiliate platform',
      qualification: {
        confidence: 0.7,
        positiveSignals: [
          { tag: 'affiliate-network', weight: 12 },
          { tag: 'performance-marketing', weight: 14 }
        ],
        negativeSignals: []
      },
      contact: { email: 'partnerships@katalys.com' },
      validation: { email: { status: 'DISCOVERED' }, phone: { status: 'UNKNOWN' } },
      provenance: { sourceUrls: ['https://example.com'] }
    });
    assert.ok(scored.score.total >= 40 && scored.score.total <= 100);
    assert.equal(scored.score.components.businessFit.max, 25);
    assert.equal(scored.score.components.verticalFit.max, 20);
    assert.equal(scored.score.components.decisionMaker.max, 20);
    assert.equal(scored.score.components.contactability.max, 20);
    assert.equal(scored.score.components.dataConfidence.max, 15);
    assert.match(scored.score.explanation, /Business fit:/);
  });

  test('ranks top N by total score descending', () => {
    const ranked = rankProspects([
      { organizationName: 'Low', qualification: { positiveSignals: [], confidence: 0.1 } },
      {
        organizationName: 'High',
        website: 'https://high.test',
        description: 'Lead generation',
        qualification: { positiveSignals: [{ tag: 'lead-generation', weight: 12 }], confidence: 0.6 }
      }
    ], 1);
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0].organizationName, 'High');
    assert.equal(ranked[0].rank, 1);
  });
});
