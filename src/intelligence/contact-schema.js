/**
 * Canonical person/contact record for Day-4 contact intelligence.
 * Missing fields stay null. Inferred emails are never mixed with discovered.
 */

import { randomUUID } from 'node:crypto';
import { normalizeEmail, normalizePhone, normalizeSocialUrl, normalizeUrl } from '../acquisition/normalize.js';

export const CONTACT_EMAIL_STATES = [
  'UNKNOWN',
  'DISCOVERED',
  'FORMAT_VALID',
  'VALIDATED',
  'RISKY',
  'INVALID',
  'INFERRED'
];

export const CONTACT_PHONE_STATES = [
  'UNKNOWN',
  'DISCOVERED',
  'FORMAT_VALID',
  'VALIDATED',
  'INVALID'
];

export function createContact(partial = {}) {
  const fullName = String(partial.fullName || '').trim() || null;
  const parts = fullName ? fullName.split(/\s+/) : [];
  return {
    personId: partial.personId || `per_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    fullName,
    firstName: partial.firstName || parts[0] || null,
    lastName: partial.lastName || (parts.length > 1 ? parts.slice(1).join(' ') : null),
    title: partial.title || null,
    organization: partial.organization || null,
    organizationDomain: partial.organizationDomain || null,
    publicProfileUrl: normalizeUrl(partial.publicProfileUrl || partial.linkedinUrl),
    linkedinUrl: normalizeSocialUrl(partial.linkedinUrl || partial.publicProfileUrl),
    email: normalizeEmail(partial.email),
    phone: normalizePhone(partial.phone) || partial.phone || null,
    emailStatus: partial.emailStatus || (partial.email ? 'DISCOVERED' : 'UNKNOWN'),
    phoneStatus: partial.phoneStatus || (partial.phone ? 'DISCOVERED' : 'UNKNOWN'),
    verificationStatus: partial.verificationStatus || 'UNKNOWN',
    provider: partial.provider || null,
    providerPersonId: partial.providerPersonId || null,
    source: partial.source || null,
    confidence: Number.isFinite(partial.confidence) ? partial.confidence : 0.4,
    sourceRecords: Array.isArray(partial.sourceRecords) ? partial.sourceRecords : [],
    mergeReasons: Array.isArray(partial.mergeReasons) ? partial.mergeReasons : [],
    contactQuality: partial.contactQuality || null,
    fabricated: false
  };
}
