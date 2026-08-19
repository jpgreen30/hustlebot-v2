import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { qualifyProspect } from './qualify.js';

describe('prospect.qualify', () => {
  test('scores a lead-buyer with explainable positive signals', () => {
    const out = qualifyProspect({
      organizationName: 'SunPath Media',
      description: 'Performance marketing affiliate network buying exclusive solar leads',
      contact: { fullName: null, email: null },
      contacts: [{ fullName: 'Ada West', title: 'VP Growth' }]
    }, { profileId: 'qentrax-buyer' });

    assert.equal(out.qualification.profileId, 'qentrax-buyer');
    assert.ok(out.qualification.score >= 70);
    assert.equal(out.qualification.status, 'qualified');
    const tags = out.qualification.positiveSignals.map((s) => s.tag);
    assert.ok(tags.includes('performance-marketing'));
    assert.ok(tags.includes('solar-home'));
    assert.ok(tags.includes('decision-maker-found'));
    assert.match(out.qualification.reasoningSummary, /Matched/);
  });

  test('absence of evidence is unknown, not a negative', () => {
    const out = qualifyProspect({
      organizationName: 'Plain Co',
      description: 'We make packaging boxes'
    }, { profileId: 'qentrax-buyer' });
    assert.equal(out.qualification.status, 'unknown');
    assert.equal(out.qualification.negativeSignals.length, 0);
    assert.ok(out.qualification.unknowns.includes('decision-maker'));
  });

  test('reads researched intelligence field objects', () => {
    const out = qualifyProspect({
      organizationName: 'CallPath',
      intelligence: {
        description: { value: 'Pay per call contact center for insurance advertisers', status: 'VERIFIED' }
      }
    });
    const tags = out.qualification.positiveSignals.map((s) => s.tag);
    assert.ok(tags.includes('call-center'));
    assert.ok(tags.includes('insurance-finance'));
  });
});
