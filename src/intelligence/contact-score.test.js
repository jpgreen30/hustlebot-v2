import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { scoreContact, combinedPriority, attachContactScores, roleMatchesTitle } from './contact-score.js';

describe('contact quality + combined priority', () => {
  test('scores role, seniority, and never exceeds 100', () => {
    const scored = scoreContact({
      fullName: 'Ada West',
      title: 'VP of Growth',
      organization: 'Katalys',
      email: 'ada@katalys.com',
      emailStatus: 'DISCOVERED',
      phoneStatus: 'UNKNOWN',
      provider: 'apollo',
      providerPersonId: 'abc',
      linkedinUrl: 'https://www.linkedin.com/in/ada',
      confidence: 0.8
    }, { profileId: 'qentrax-buyer' });
    assert.ok(scored.total >= 40 && scored.total <= 100);
    assert.equal(scored.components.roleRelevance.max, 30);
    assert.equal(scored.version, 'contact-quality.v1');
    assert.match(scored.explanation, /Contact quality:/);
  });

  test('combined priority stores formula and does not replace company score', () => {
    const prospect = { qualification: { score: 72 }, score: { total: 72 } };
    const contact = { contactQuality: { total: 88 }, title: 'CMO' };
    const priority = combinedPriority(prospect, contact, { profileId: 'qentrax-buyer' });
    assert.equal(priority.components.companyFit, 72);
    assert.equal(priority.components.contactQuality, 88);
    assert.ok(priority.formula.includes('company'));
    assert.ok(priority.total >= 0 && priority.total <= 100);
  });

  test('attachContactScores ranks contacts and keeps company score intact', () => {
    const out = attachContactScores({
      score: { total: 60 },
      qualification: { score: 60, positiveSignals: [] },
      contact: {},
      contacts: [
        { fullName: 'Intern Pat', title: 'Intern', emailStatus: 'UNKNOWN', phoneStatus: 'UNKNOWN' },
        { fullName: 'Ada West', title: 'Head of Growth', email: 'ada@x.test', emailStatus: 'DISCOVERED', provider: 'apollo' }
      ]
    });
    assert.equal(out.contacts[0].fullName, 'Ada West');
    assert.equal(out.score.total, 60);
    assert.ok(out.priority);
  });

  test('role matcher understands Head/VP aliases', () => {
    assert.equal(roleMatchesTitle('VP of Lead Generation', 'Head/VP of Lead Generation'), true);
    assert.equal(roleMatchesTitle('Media Buyer', 'CMO'), false);
  });
});
