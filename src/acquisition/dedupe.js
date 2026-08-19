/**
 * Deterministic prospect deduplication.
 *
 * Strong keys only:
 *   1. normalized domain
 *   2. normalized email
 *   3. normalized phone
 *   4. organization + location
 *   5. source-specific stable identifier
 *
 * Weak fuzzy matches are retained as separate records.
 */

import { assignProspectId } from './schema.js';

function mergeArrays(...lists) {
  return [...new Set(lists.flat().filter(Boolean))];
}

function prefer(a, b) {
  if (a !== null && a !== undefined && a !== '') return a;
  return b ?? null;
}

export function mergeProspects(winner, incoming, reason) {
  const merged = {
    ...winner,
    organizationName: prefer(winner.organizationName, incoming.organizationName),
    domain: prefer(winner.domain, incoming.domain),
    website: prefer(winner.website, incoming.website),
    description: prefer(winner.description, incoming.description),
    category: prefer(winner.category, incoming.category),
    sourceUrl: prefer(winner.sourceUrl, incoming.sourceUrl),
    sourceType: prefer(winner.sourceType, incoming.sourceType),
    sourceEvent: prefer(winner.sourceEvent, incoming.sourceEvent),
    sourceDate: prefer(winner.sourceDate, incoming.sourceDate),
    contact: {
      firstName: prefer(winner.contact?.firstName, incoming.contact?.firstName),
      lastName: prefer(winner.contact?.lastName, incoming.contact?.lastName),
      fullName: prefer(winner.contact?.fullName, incoming.contact?.fullName),
      title: prefer(winner.contact?.title, incoming.contact?.title),
      email: prefer(winner.contact?.email, incoming.contact?.email),
      phone: prefer(winner.contact?.phone, incoming.contact?.phone),
      linkedinUrl: prefer(winner.contact?.linkedinUrl, incoming.contact?.linkedinUrl)
    },
    company: {
      industry: prefer(winner.company?.industry, incoming.company?.industry),
      location: prefer(winner.company?.location, incoming.company?.location),
      employeeRange: prefer(winner.company?.employeeRange, incoming.company?.employeeRange),
      socialUrls: mergeArrays(winner.company?.socialUrls, incoming.company?.socialUrls)
    },
    qualification: {
      score: prefer(winner.qualification?.score, incoming.qualification?.score),
      reasons: mergeArrays(winner.qualification?.reasons, incoming.qualification?.reasons),
      tags: mergeArrays(winner.qualification?.tags, incoming.qualification?.tags)
    },
    provenance: {
      discoveredAt: prefer(winner.provenance?.discoveredAt, incoming.provenance?.discoveredAt),
      provider: prefer(winner.provenance?.provider, incoming.provenance?.provider),
      sourceUrls: mergeArrays(winner.provenance?.sourceUrls, incoming.provenance?.sourceUrls),
      extractionMethod: prefer(winner.provenance?.extractionMethod, incoming.provenance?.extractionMethod)
    },
    workflow: winner.workflow || incoming.workflow
  };

  merged.mergeHistory = [
    ...(winner.mergeHistory || []),
    {
      mergedProspectId: incoming.prospectId,
      reason,
      at: new Date().toISOString()
    }
  ];
  return merged;
}

function orgLocationKey(prospect) {
  const org = (prospect.organizationName || '').toLowerCase();
  const loc = (prospect.company?.location || '').toLowerCase();
  if (!org || !loc) return null;
  return `orgloc:${org}|${loc}`;
}

export function matchKey(prospect) {
  if (prospect.domain) return { type: 'domain', key: `domain:${prospect.domain}` };
  if (prospect.contact?.email) return { type: 'email', key: `email:${prospect.contact.email}` };
  if (prospect.contact?.phone) return { type: 'phone', key: `phone:${prospect.contact.phone}` };
  const orgLoc = orgLocationKey(prospect);
  if (orgLoc) return { type: 'organization+location', key: orgLoc };
  if (prospect.sourceUrl && prospect.organizationName) {
    return { type: 'source-id', key: `src:${prospect.sourceUrl}|${prospect.organizationName.toLowerCase()}` };
  }
  return null;
}

export function dedupeProspects(records = []) {
  const kept = [];
  const index = new Map();
  const merges = [];

  for (const record of records) {
    const keys = [];
    if (record.domain) keys.push({ type: 'domain', key: `domain:${record.domain}` });
    if (record.contact?.email) keys.push({ type: 'email', key: `email:${record.contact.email}` });
    if (record.contact?.phone) keys.push({ type: 'phone', key: `phone:${record.contact.phone}` });
    const orgLoc = orgLocationKey(record);
    if (orgLoc) keys.push({ type: 'organization+location', key: orgLoc });
    if (record.sourceUrl && record.organizationName) {
      keys.push({
        type: 'source-id',
        key: `src:${record.sourceUrl}|${record.organizationName.toLowerCase()}`
      });
    }

    let winnerIndex = -1;
    let reason = null;
    for (const candidate of keys) {
      if (index.has(candidate.key)) {
        winnerIndex = index.get(candidate.key);
        reason = candidate.type;
        break;
      }
    }

    if (winnerIndex >= 0) {
      const merged = mergeProspects(kept[winnerIndex], record, reason);
      kept[winnerIndex] = merged;
      merges.push({
        into: merged.prospectId,
        from: record.prospectId,
        reason
      });
      for (const candidate of keys) index.set(candidate.key, winnerIndex);
      continue;
    }

    if (!record.prospectId) record.prospectId = assignProspectId(record);
    kept.push(record);
    const idx = kept.length - 1;
    for (const candidate of keys) index.set(candidate.key, idx);
  }

  return {
    prospects: kept,
    inputCount: records.length,
    uniqueCount: kept.length,
    duplicatesRemoved: records.length - kept.length,
    merges
  };
}
