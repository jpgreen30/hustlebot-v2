/**
 * Dynamic search-query planner. Generates multiple discovery queries from
 * the objective. No vertical-specific competitor lists.
 */

import { extractSlices } from '../objective/quantities.js';
import { INTEL_INTENT } from './schema.js';

const NOUN = /([a-z0-9][a-z0-9&.'/-]*(?:\s+[a-z0-9][a-z0-9&.'/-]*){0,5}\s+(?:apps?|platforms?|companies|products|solutions|practices|providers|directories|communities|trackers?))/gi;

function compact(text) {
  return String(text || '')
    .replace(/^(research|find|discover|rank|compare|map|identify)\s+\d*\s*/i, '')
    .replace(/\bdo not contact anyone\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function planSearchQueries(input = {}) {
  const question = String(input.question || input.query || input.rawRequest || '');
  const geography = input.geography || input.location || null;
  const slices = (input.slices || extractSlices(question)).filter(Boolean);
  const primary = compact(question).split(/[.!?]/)[0].slice(0, 140).trim() || question.slice(0, 140);
  const wantProducts = /\b(app|apps|platform|product|saas|software|marketplace|tracker)\b/i.test(question);
  const out = [];
  const seen = new Set();
  const push = (query, reason, fromSlice = null) => {
    const q = String(query || '').replace(/\s+/g, ' ').trim();
    if (!q || q.length < 4) return;
    const key = q.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ query: q, reason, fromSlice, producedEvidence: [] });
  };

  push(primary, 'primary objective');

  for (const slice of slices.slice(0, 4)) {
    const loc = geography ? `${slice} ${geography}` : slice;
    push(loc, 'interpreted slice', slice);
    if (wantProducts) push(`${slice} app official site`, 'first-party product homepage', slice);
  }

  const phrases = question.match(NOUN) || [];
  for (const phrase of phrases.slice(0, 4)) {
    push(phrase, 'noun phrase from objective');
  }
  for (const phrase of phrases.slice(0, 4)) {
    if (wantProducts) {
      push(`${phrase} official website`, 'product official site');
      push(`${phrase} companies`, 'commercial entities');
    }
  }
  if (wantProducts) {
    for (const phrase of phrases.slice(0, 2)) {
      push(`${phrase} site:apps.apple.com`, 'app-store listings');
      push(`${phrase} site:producthunt.com`, 'product directory');
    }
  }

  if (geography && !slices.length) {
    push(`${geography} ${primary}`.slice(0, 120), 'geography-constrained');
  }

  if (input.intent === INTEL_INTENT.VERIFY && input.entityName) {
    push(`${input.entityName} official website`, 'verification first-party');
    push(`${input.entityName} ${input.claimPredicate || 'about'}`, 'verification secondary');
  }

  if (input.intent === INTEL_INTENT.MARKET_MAP) {
    push(`${primary} providers`, 'market-map providers');
    push(`${primary} pricing`, 'market-map public pricing');
  }

  return out.slice(0, Number(input.maxQueries || 5));
}

export function recordQueryHit(plan, query, evidenceIds = []) {
  const row = (plan || []).find((item) => item.query === query);
  if (row) row.producedEvidence.push(...evidenceIds);
  return plan;
}
