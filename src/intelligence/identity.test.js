import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { identityKeys, resolveContacts } from './identity.js';
import { createContact } from './contact-schema.js';

describe('contact.resolve', () => {
  test('merges on verified email and provider id, not weak names', () => {
    const a = createContact({
      fullName: 'Ada West',
      organization: 'Katalys',
      email: 'ada@katalys.com',
      emailStatus: 'VALIDATED',
      provider: 'apollo',
      providerPersonId: 'p1'
    });
    const b = createContact({
      fullName: 'Ada West',
      organization: 'Katalys',
      linkedinUrl: 'https://www.linkedin.com/in/adawest',
      provider: 'public-web'
    });
    const sameEmail = createContact({
      fullName: 'A. West',
      organization: 'Katalys Inc',
      email: 'ada@katalys.com',
      emailStatus: 'VALIDATED',
      provider: 'apollo',
      providerPersonId: 'p1'
    });
    const other = createContact({
      fullName: 'Ada West',
      organization: 'Unrelated Co',
      provider: 'public-web'
    });
    const out = resolveContacts([a, sameEmail, b, other]);
    assert.equal(out.fabricated, false);
    assert.ok(out.uniqueCount <= 3);
    assert.ok(out.contacts.some((c) => c.mergeReasons.includes('pid') || c.mergeReasons.includes('email')));
    assert.ok(out.contacts.some((c) => c.organization === 'Unrelated Co'));
    assert.ok(identityKeys(a).some((k) => k.startsWith('email:') || k.startsWith('pid:')));
  });

  test('does not merge two people who only share a first name', () => {
    const out = resolveContacts([
      createContact({ fullName: 'Jon Smith', organization: 'Acme', provider: 'public-web' }),
      createContact({ fullName: 'Jon Jones', organization: 'Acme', provider: 'apollo' })
    ]);
    assert.equal(out.uniqueCount, 2);
    assert.equal(out.mergedCount, 0);
  });
});
