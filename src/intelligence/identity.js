/**
 * Identity resolution across providers.
 * Strong keys only — never merge on weak fuzzy name similarity.
 */

import { createContact } from './contact-schema.js';
import { normalizeEmail, normalizePhone, normalizeSocialUrl, normalizeUrl } from '../acquisition/normalize.js';

function normName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normOrg(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function linkedinKey(url) {
  const social = normalizeSocialUrl(url) || normalizeUrl(url);
  if (!social) return null;
  try {
    const parsed = new URL(social);
    if (!/linkedin\.com$/i.test(parsed.hostname.replace(/^www\./, ''))) return null;
    const match = parsed.pathname.match(/\/in\/([^/]+)/i);
    return match ? `li:${match[1].toLowerCase()}` : null;
  } catch {
    return null;
  }
}

export function identityKeys(contact) {
  const keys = [];
  if (contact.providerPersonId) keys.push(`pid:${contact.provider}:${contact.providerPersonId}`);
  const profile = linkedinKey(contact.linkedinUrl || contact.publicProfileUrl);
  if (profile) keys.push(profile);
  const email = normalizeEmail(contact.email);
  if (email && contact.emailStatus === 'VALIDATED') keys.push(`email:${email}`);
  const phone = normalizePhone(contact.phone) || contact.phone;
  if (phone && String(phone).replace(/\D/g, '').length >= 10) keys.push(`phone:${String(phone).replace(/\D/g, '')}`);
  const name = normName(contact.fullName);
  const org = normOrg(contact.organization || contact.organizationDomain);
  if (name && org && name.split(' ').length >= 2) keys.push(`nameorg:${name}|${org}`);
  return keys;
}

function mergeContact(a, b, reason) {
  const pick = (left, right) => left || right || null;
  const merged = createContact({
    ...a,
    personId: a.personId,
    fullName: pick(a.fullName, b.fullName),
    title: pick(a.title, b.title),
    organization: pick(a.organization, b.organization),
    organizationDomain: pick(a.organizationDomain, b.organizationDomain),
    publicProfileUrl: pick(a.publicProfileUrl, b.publicProfileUrl),
    linkedinUrl: pick(a.linkedinUrl, b.linkedinUrl),
    email: pick(a.email, b.email),
    phone: pick(a.phone, b.phone),
    emailStatus: a.emailStatus === 'VALIDATED' ? a.emailStatus : (b.emailStatus || a.emailStatus),
    phoneStatus: a.phoneStatus === 'VALIDATED' ? a.phoneStatus : (b.phoneStatus || a.phoneStatus),
    verificationStatus: a.verificationStatus === 'VALIDATED' ? a.verificationStatus : (b.verificationStatus || a.verificationStatus),
    provider: a.provider || b.provider,
    providerPersonId: pick(a.providerPersonId, b.providerPersonId),
    source: pick(a.source, b.source),
    confidence: Math.max(a.confidence || 0, b.confidence || 0)
  });
  merged.sourceRecords = [
    ...(a.sourceRecords || []),
    ...(b.sourceRecords || []),
    { provider: b.provider, personId: b.personId, source: b.source }
  ];
  merged.mergeReasons = [...new Set([...(a.mergeReasons || []), ...(b.mergeReasons || []), reason])];
  return merged;
}

export function resolveContacts(contacts = []) {
  const groups = [];
  for (const raw of contacts) {
    const contact = raw.personId ? raw : createContact(raw);
    const keys = identityKeys(contact);
    let matched = null;
    let reason = null;
    if (keys.length) {
      for (const group of groups) {
        const overlap = group.keys.filter((key) => keys.includes(key));
        if (overlap.length) {
          matched = group;
          reason = overlap[0].split(':')[0];
          break;
        }
      }
    }
    if (matched) {
      matched.contact = mergeContact(matched.contact, contact, reason);
      matched.keys = [...new Set([...matched.keys, ...keys])];
    } else {
      groups.push({
        contact: {
          ...contact,
          sourceRecords: contact.sourceRecords?.length
            ? contact.sourceRecords
            : [{ provider: contact.provider, personId: contact.personId, source: contact.source }]
        },
        keys
      });
    }
  }

  return {
    contacts: groups.map((group) => ({
      ...group.contact,
      identityKeys: group.keys
    })),
    inputCount: contacts.length,
    uniqueCount: groups.length,
    mergedCount: Math.max(0, contacts.length - groups.length),
    fabricated: false
  };
}

export function resolvePeople(contacts) {
  return resolveContacts(contacts);
}
