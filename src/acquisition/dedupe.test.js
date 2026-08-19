import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createProspect } from './schema.js';
import { normalizeProspect } from './normalize.js';
import { dedupeProspects } from './dedupe.js';

describe('dedupe', () => {
  test('merges known duplicates on domain and records the reason', () => {
    const a = normalizeProspect(createProspect({
      organizationName: 'Acme Analytics',
      domain: 'acme.com',
      website: 'https://acme.com',
      sourceUrl: 'https://show.test/a',
      contact: { email: null }
    }));
    const b = normalizeProspect(createProspect({
      organizationName: 'ACME Analytics',
      domain: 'www.acme.com',
      website: 'https://www.acme.com/about',
      sourceUrl: 'https://show.test/b',
      contact: { email: 'sales@acme.com' }
    }));
    const out = dedupeProspects([a, b]);
    assert.equal(out.uniqueCount, 1);
    assert.equal(out.duplicatesRemoved, 1);
    assert.equal(out.merges[0].reason, 'domain');
    assert.equal(out.prospects[0].contact.email, 'sales@acme.com');
    assert.ok(out.prospects[0].mergeHistory.some((m) => m.reason === 'domain'));
  });

  test('does not merge weak name-only matches', () => {
    const a = normalizeProspect(createProspect({ organizationName: 'Pioneer', sourceUrl: 'https://a.test/1' }));
    const b = normalizeProspect(createProspect({ organizationName: 'Pioneer', sourceUrl: 'https://b.test/2' }));
    const out = dedupeProspects([a, b]);
    assert.equal(out.uniqueCount, 2);
    assert.equal(out.duplicatesRemoved, 0);
  });

  test('merges on organization + location when that pair is complete', () => {
    const a = normalizeProspect(createProspect({
      organizationName: 'Pioneer Media',
      company: { location: 'Las Vegas, NV' },
      sourceUrl: 'https://a.test/1'
    }));
    const b = normalizeProspect(createProspect({
      organizationName: 'Pioneer Media',
      company: { location: 'Las Vegas, NV' },
      contact: { phone: '7025551212' },
      sourceUrl: 'https://a.test/2'
    }));
    const out = dedupeProspects([a, b]);
    assert.equal(out.uniqueCount, 1);
    assert.equal(out.merges[0].reason, 'organization+location');
    assert.equal(out.prospects[0].contact.phone, '+17025551212');
  });
});
