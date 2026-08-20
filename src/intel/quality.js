/**
 * Research quality evaluator. Scores against the objective, not aesthetics.
 */

import { classifySearchResult, diversity, inferRequestedType, RESULT_ROLE } from './classify.js';

export const QUALITY = {
  STRONG: 'STRONG',
  ACCEPTABLE: 'ACCEPTABLE',
  WEAK: 'WEAK',
  FAILED: 'FAILED'
};

function clamp(n) {
  return Math.max(0, Math.min(1, Number(n) || 0));
}

export function evaluateResearch(input = {}) {
  const question = input.question || '';
  const requested = Math.max(1, Number(input.requested || input.quantity || 10));
  const accepted = Array.isArray(input.accepted) ? input.accepted : [];
  const rejected = Array.isArray(input.rejected) ? input.rejected : [];
  const evidence = Array.isArray(input.evidence) ? input.evidence : [];
  const geography = input.geography || null;
  const requestedType = inferRequestedType(question);
  const n = accepted.length;
  const totalSeen = n + rejected.length;

  const typeFit = n
    ? accepted.filter((a) => {
      const kind = a.pageKind || a.entityType || a.type;
      if (requestedType === 'PRODUCT') return /PRODUCT|APP|ORGANIZATION/i.test(kind || 'PRODUCT');
      return !/LISTICLE|DIRECTORY|ARTICLE|MIRROR|CLINICAL/i.test(kind || '');
    }).length / n
    : 0;
  const geoNeedle = geography ? String(geography).toLowerCase().split(/\s+/)[0] : null;
  const geoHits = geoNeedle
    ? accepted.filter((a) => `${a.description || ''} ${a.location || ''} ${a.snippet || ''}`.toLowerCase().includes(geoNeedle)).length
    : n;
  const geographicFit = geography ? (n ? geoHits / n : 0) : 1;
  const firstPartyCoverage = n
    ? accepted.filter((a) => a.firstParty === true || a.trustClass === 'FIRST_PARTY').length / n
    : 0;
  const uniqueness = n ? new Set(accepted.map((a) => (a.domain || a.organizationName || a.name || '').toLowerCase())).size / n : 0;
  const requestedQuantityCoverage = Math.min(1, n / requested);
  const evidenceCoverage = n
    ? accepted.filter((a) => (a.evidenceIds || []).length || a.website || a.sourceUrl).length / n
    : 0;
  const freshness = evidence.length
    ? evidence.filter((e) => {
      const t = Date.parse(e.retrievedAt || e.updatedAt || 0);
      return Number.isFinite(t) && Date.now() - t < 14 * 86400000;
    }).length / evidence.length
    : 0.5;
  const div = diversity(accepted);
  const noiseRatio = totalSeen ? rejected.length / totalSeen : 0;
  const contradictionRate = input.conflicts != null
    ? Number(input.conflicts) / Math.max(n, 1)
    : 0;
  const sourceAuthority = firstPartyCoverage * 0.7 + (1 - Math.min(1, div.concentration)) * 0.3;

  const dimensions = {
    relevance: clamp(typeFit * 0.6 + requestedQuantityCoverage * 0.4),
    entityTypeFit: clamp(typeFit),
    geographicFit: clamp(geographicFit),
    sourceAuthority: clamp(sourceAuthority),
    firstPartyCoverage: clamp(firstPartyCoverage),
    uniqueness: clamp(uniqueness),
    requestedQuantityCoverage: clamp(requestedQuantityCoverage),
    evidenceCoverage: clamp(evidenceCoverage),
    freshness: clamp(freshness),
    diversity: clamp(1 - div.concentration),
    noiseRatio: clamp(noiseRatio),
    contradictionRate: clamp(contradictionRate)
  };

  const occupyingJunk = accepted.filter((a) => {
    const classified = classifySearchResult({
      title: a.organizationName || a.name,
      url: a.website || a.url,
      snippet: a.description
    }, question);
    return classified.role !== RESULT_ROLE.CANDIDATE;
  }).length;

  let classification = QUALITY.FAILED;
  if (n === 0) classification = QUALITY.FAILED;
  else if (occupyingJunk > 0 && occupyingJunk / Math.max(n, 1) >= 0.3) classification = QUALITY.WEAK;
  else if (requestedQuantityCoverage >= 0.7 && typeFit >= 0.85 && noiseRatio <= 0.3) classification = QUALITY.STRONG;
  else if (requestedQuantityCoverage >= 0.4 && typeFit >= 0.7 && noiseRatio <= 0.5) classification = QUALITY.ACCEPTABLE;
  else if (n >= 1 && typeFit >= 0.5) classification = QUALITY.WEAK;
  else classification = QUALITY.FAILED;

  const weaknesses = [];
  if (requestedQuantityCoverage < 0.7) {
    weaknesses.push({
      type: 'quantity',
      detail: `Requested ${requested}, accepted ${n} legitimate entities.`
    });
  }
  if (typeFit < 0.85) weaknesses.push({ type: 'entity-type', detail: 'Some results are the wrong entity type.' });
  if (noiseRatio > 0.35) weaknesses.push({ type: 'noise', detail: `Noise ratio ${noiseRatio.toFixed(2)}.` });
  if (firstPartyCoverage < 0.4 && n) weaknesses.push({ type: 'first-party', detail: 'Low first-party coverage.' });
  if (div.concentration >= 0.6 && n >= 3) {
    weaknesses.push({ type: 'monoculture', detail: `Domain ${div.dominantDomain} supplied ${div.dominantCount}/${n} candidates.` });
  }
  if (occupyingJunk) weaknesses.push({ type: 'slot-pollution', detail: `${occupyingJunk} listicles/directories/mirrors occupying candidate slots.` });

  const gaps = [];
  if (n < requested) {
    gaps.push({
      type: 'quantity',
      requested,
      legitimateFound: n,
      gap: requested - n,
      reason: n === 0 ? 'no legitimate entities' : 'research incomplete or saturating',
      detail: `Requested ${requested}, found ${n} legitimate entities. Not padded with junk.`
    });
  }

  return {
    classification,
    dimensions,
    weaknesses,
    gaps,
    diversity: div,
    requested,
    legitimateFound: n,
    rejectedCount: rejected.length,
    occupyingJunk,
    contacted: false
  };
}

export function rankingComponents(entity = {}, question = '', extra = {}) {
  const classified = classifySearchResult({
    title: entity.organizationName || entity.name,
    url: entity.website,
    snippet: entity.description
  }, question);
  return {
    name: entity.organizationName || entity.name,
    entityId: entity.entityId || null,
    relevance: classified.role === RESULT_ROLE.CANDIDATE ? 'strong' : 'weak',
    entityTypeFit: classified.pageKind,
    geography: extra.geographyEvidence ? 'verified' : (extra.geography ? 'unverified' : 'n/a'),
    scaleSignal: extra.scale || 'UNKNOWN',
    firstPartyEvidence: extra.firstParty === true ? 'yes' : 'no',
    evidenceCompleteness: (entity.evidenceIds || []).length >= 2 ? 'medium' : 'low',
    reasons: classified.reasons
  };
}
