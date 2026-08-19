import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDomain,
  normalizeEmail,
  normalizeOrganizationName,
  normalizePhone,
  normalizeProspect,
  normalizeUrl
} from './normalize.js';

describe('normalization', () => {
  test('normalizes urls, domains, phones, emails, and names', () => {
    assert.equal(normalizeUrl('HTTPS://WWW.Acme.com/path/?utm_source=x#y'), 'https://www.acme.com/path');
    assert.equal(normalizeDomain('https://www.Acme.com/about'), 'acme.com');
    assert.equal(normalizeEmail('  Person@Acme.COM '), 'person@acme.com');
    assert.equal(normalizeEmail('hello@example.com'), null);
    assert.equal(normalizePhone('(818) 438-1415'), '+18184381415');
    assert.equal(normalizeOrganizationName('  Acme Analytics™  '), 'Acme Analytics');
    assert.equal(normalizeOrganizationName('Exhibitors'), null);
  });

  test('leaves missing fields missing instead of guessing', () => {
    const out = normalizeProspect({
      organizationName: '  Qentrax  ',
      website: null,
      contact: { email: '', phone: null, fullName: '  Ada Lovelace  ' },
      company: { employeeRange: undefined }
    });
    assert.equal(out.organizationName, 'Qentrax');
    assert.equal(out.domain, null);
    assert.equal(out.website, null);
    assert.equal(out.contact.email, null);
    assert.equal(out.contact.phone, null);
    assert.equal(out.contact.fullName, 'Ada Lovelace');
    assert.equal(out.company.employeeRange, null);
  });
});
