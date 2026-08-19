/**
 * Canonical prospect / entity schema.
 * Unknown fields stay null. Nothing is guessed into a verified value.
 */

import crypto from 'node:crypto';

export const SOURCE_TYPES = ['exhibitor', 'sponsor', 'vendor', 'directory', 'search', 'website', 'unknown'];

export function emptyContact() {
  return {
    firstName: null,
    lastName: null,
    fullName: null,
    title: null,
    email: null,
    phone: null,
    linkedinUrl: null
  };
}

export function emptyCompany() {
  return {
    industry: null,
    location: null,
    employeeRange: null,
    socialUrls: []
  };
}

export function createProspect(partial = {}) {
  const now = new Date().toISOString();
  const prospect = {
    prospectId: partial.prospectId || null,
    organizationName: partial.organizationName ?? null,
    domain: partial.domain ?? null,
    website: partial.website ?? null,
    description: partial.description ?? null,
    category: partial.category ?? null,
    sourceUrl: partial.sourceUrl ?? null,
    sourceType: partial.sourceType && SOURCE_TYPES.includes(partial.sourceType)
      ? partial.sourceType
      : (partial.sourceType || null),
    sourceEvent: partial.sourceEvent ?? null,
    sourceDate: partial.sourceDate ?? null,
    contact: { ...emptyContact(), ...(partial.contact || {}) },
    company: {
      ...emptyCompany(),
      ...(partial.company || {}),
      socialUrls: Array.isArray(partial.company?.socialUrls) ? partial.company.socialUrls : []
    },
    qualification: {
      score: partial.qualification?.score ?? null,
      reasons: Array.isArray(partial.qualification?.reasons) ? partial.qualification.reasons : [],
      tags: Array.isArray(partial.qualification?.tags) ? partial.qualification.tags : []
    },
    provenance: {
      discoveredAt: partial.provenance?.discoveredAt || now,
      provider: partial.provenance?.provider || null,
      sourceUrls: Array.isArray(partial.provenance?.sourceUrls)
        ? [...new Set(partial.provenance.sourceUrls.filter(Boolean))]
        : (partial.sourceUrl ? [partial.sourceUrl] : []),
      extractionMethod: partial.provenance?.extractionMethod || null
    },
    workflow: {
      status: partial.workflow?.status || 'discovered',
      executionId: partial.workflow?.executionId || null
    }
  };

  if (!prospect.prospectId) {
    prospect.prospectId = assignProspectId(prospect);
  }
  return prospect;
}

export function assignProspectId(prospect) {
  const basis = [
    prospect.domain,
    prospect.contact?.email,
    prospect.contact?.phone,
    prospect.organizationName,
    prospect.company?.location,
    prospect.sourceUrl
  ].filter(Boolean).join('|').toLowerCase();
  const hash = crypto.createHash('sha1').update(basis || `anon:${Date.now()}`).digest('hex').slice(0, 12);
  return `prs_${hash}`;
}

export function compactProspect(prospect) {
  return {
    prospectId: prospect.prospectId,
    organizationName: prospect.organizationName,
    domain: prospect.domain,
    website: prospect.website,
    description: prospect.description,
    category: prospect.category,
    sourceUrl: prospect.sourceUrl,
    sourceType: prospect.sourceType,
    sourceEvent: prospect.sourceEvent,
    contact: prospect.contact,
    company: prospect.company,
    qualification: prospect.qualification,
    provenance: prospect.provenance,
    workflow: prospect.workflow
  };
}
