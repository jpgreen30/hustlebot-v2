/**
 * Objective-driven qualification. Profiles are configuration.
 * Absence of evidence is not a negative.
 */

import { getQualificationProfile } from './profiles.js';

function valueOf(value) {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(valueOf).filter(Boolean).join(' ');
  if (typeof value === 'object' && 'value' in value) return valueOf(value.value);
  return null;
}

function haystack(prospect) {
  const parts = [
    prospect.organizationName,
    prospect.description,
    prospect.category,
    prospect.sourceEvent,
    prospect.sourceType,
    prospect.company?.industry,
    prospect.company?.description,
    valueOf(prospect.intelligence?.description),
    valueOf(prospect.intelligence?.industry),
    valueOf(prospect.intelligence?.classification),
    valueOf(prospect.intelligence?.products),
    ...(prospect.qualification?.tags || []),
    ...(prospect.intelligence?.verticals || [])
  ];
  return parts.filter(Boolean).join(' \n ');
}

function matchSignals(text, rules) {
  const hits = [];
  for (const rule of rules) {
    if (rule.patterns.some((re) => re.test(text))) {
      hits.push({ tag: rule.tag, weight: rule.weight });
    }
  }
  return hits;
}

export function qualifyProspect(prospect, options = {}) {
  const profile = getQualificationProfile(options.profileId || options.qualificationProfile || 'qentrax-buyer');
  const text = haystack(prospect);
  const positives = matchSignals(text, profile.positive);
  const negatives = matchSignals(text, profile.negative);
  const titles = (prospect.contacts || []).map((c) => String(c.title || '').toLowerCase());
  const decisionMaker = titles.some((t) =>
    profile.decisionMakerTitles.some((wanted) => t.includes(wanted))
  );
  if (decisionMaker) {
    positives.push({ tag: 'decision-maker-found', weight: 10 });
  }

  const positiveScore = positives.reduce((sum, s) => sum + s.weight, 0);
  const negativeScore = negatives.reduce((sum, s) => sum + s.weight, 0);
  const raw = Math.max(0, Math.min(100, 40 + positiveScore - negativeScore));
  const evidenceCount = positives.length;
  const confidence = evidenceCount === 0 ? 0.25 : Math.min(0.9, 0.35 + evidenceCount * 0.12);

  let qualificationStatus = 'review';
  if (raw >= 70 && confidence >= 0.5) qualificationStatus = 'qualified';
  else if (raw < 40 && negatives.length && positives.length === 0) qualificationStatus = 'poor-fit';
  else if (positives.length === 0) qualificationStatus = 'unknown';

  const unknowns = [];
  if (!prospect.domain && !prospect.website) unknowns.push('website/domain');
  if (!(prospect.contacts || []).length && !prospect.contact?.fullName) unknowns.push('decision-maker');
  if (!prospect.contact?.email) unknowns.push('email');
  if (!prospect.description && !valueOf(prospect.intelligence?.description)) unknowns.push('company-description');

  const reasoningSummary = positives.length
    ? `Matched ${positives.map((s) => s.tag).join(', ')} against ${profile.id}`
    : `No positive ${profile.id} signals in available public text`;

  return {
    ...prospect,
    qualification: {
      status: qualificationStatus,
      score: raw,
      confidence: Number(confidence.toFixed(2)),
      profileId: profile.id,
      positiveSignals: positives,
      negativeSignals: negatives,
      unknowns,
      reasons: positives.map((s) => s.tag),
      tags: [...new Set([...(prospect.qualification?.tags || []), ...positives.map((s) => s.tag)])],
      reasoningSummary
    }
  };
}

export function qualifyProspects(prospects, options = {}) {
  return prospects.map((p) => qualifyProspect(p, options));
}
