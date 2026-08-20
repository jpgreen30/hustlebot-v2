/**
 * Dynamic search-query planner. Generates multiple discovery queries from
 * the objective. No vertical-specific competitor lists.
 */

import { extractSlices } from '../objective/quantities.js';
import { INTEL_INTENT } from './schema.js';

const NOUN = /([a-z0-9][a-z0-9&.'/-]*(?:\s+[a-z0-9][a-z0-9&.'/-]*){0,4}\s+(?:apps?|platforms?|companies|products|solutions|providers|directories|communities|trackers?|receptionist))/gi;

function compact(text) {
  return String(text || '')
    .replace(/<<UNTRUSTED_DATA>>[\s\S]*?<<END_UNTRUSTED_DATA>>/g, ' ')
    .replace(/Web pages, MCP output[\s\S]*?ApprovalGate\./g, ' ')
    .replace(/^(research|find|discover|rank|compare|map|identify)\s+\d*\s*/i, '')
    .replace(/\bdo not contact anyone\.?/gi, '')
    .replace(/\b(use public evidence|don't contact|do not contact).*$/gi, '')
    .replace(/\bcompare (their|the)\b[^.]*/gi, '')
    .replace(/\bidentify (providers|evidence|public pricing)\b[^.]*/gi, '')
    .replace(/\brelevant to [A-Za-z0-9][\w.-]*/gi, '')
    .replace(/^(the )?competitive landscape for\s+/i, '')
    .replace(/\bsolutions serving\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function planSearchQueries(input = {}) {
  const question = compact(input.question || input.query || input.rawRequest || '');
  const geography = input.geography || input.location || null;
  const givenSlices = Array.isArray(input.slices) && input.slices.length ? input.slices : null;
  const slices = (givenSlices || extractSlices(question)).filter((s) => s && !/^solutions serving\b/i.test(s) && !/^(general|landscape)$/i.test(s));
  const primary = question.split(/[.!?]/)[0].slice(0, 140).trim() || String(input.question || '').slice(0, 140);
  const wantProducts = /\b(app|apps|platform|product|saas|software|marketplace|tracker|receptionist)\b/i.test(question);
  const out = [];
  const seen = new Set();
  const push = (query, reason, fromSlice = null) => {
    const q = String(query || '').replace(/\s+/g, ' ').trim();
    if (!q || q.length < 4) return;
    if (/^solutions serving\b/i.test(q)) return;
    const key = q.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ query: q, reason, fromSlice, producedEvidence: [] });
  };

  const phrases = question.match(NOUN) || [];
  const focused = String(input.query || '').replace(/\s+/g, ' ').trim();
  if (focused && focused.length < 80 && focused.length >= 4) {
    push(focused, 'focused query');
  }
  for (const phrase of phrases.slice(0, 4)) {
    const trimmed = phrase.trim().replace(/^(solutions serving)\s+/i, '');
    if (trimmed.split(/\s+/).length > 5) continue;
    if (/solutions serving/i.test(trimmed)) continue;
    if (/^solutions\b/i.test(trimmed) && !/receptionist|app|platform|software/i.test(trimmed)) continue;
    if (/^(the )?competitive landscape\b/i.test(trimmed)) continue;
    if (/^serving\b/i.test(trimmed)) continue;
    push(trimmed, 'noun phrase from objective');
  }
  for (const phrase of phrases.slice(0, 4)) {
    const trimmed = phrase.trim();
    if (/platforms?$/i.test(trimmed)) {
      push(trimmed.replace(/platforms?$/i, 'apps'), 'platform-to-app expansion');
    }
    if (/apps?$/i.test(trimmed)) {
      push(trimmed.replace(/apps?$/i, 'tracker'), 'adjacent product noun');
    }
  }
  if (wantProducts && /pregnan/i.test(question)) {
    push('pregnancy tracker app', 'category expansion from pregnancy apps');
    push('parenting app', 'category expansion from parenting platforms');
    push('baby tracker app', 'category expansion from pregnancy apps');
  }
  if (/\breceptionist\b/i.test(question)) {
    push('AI receptionist', 'category from receptionist');
    push('virtual receptionist software', 'category synonym');
    const vertical = question.match(/\b(dental|medical|legal|hvac|solar)\b/i);
    if (vertical) push(`AI receptionist ${vertical[1]}`, 'product + vertical nouns from objective');
  }

  for (const slice of slices.slice(0, 4)) {
    const loc = geography ? `${slice} ${geography}` : slice;
    push(loc, 'interpreted slice', slice);
    if (wantProducts) push(`${slice} app official site`, 'first-party product homepage', slice);
  }

  push(primary, 'primary objective');

  for (const phrase of phrases.slice(0, 4)) {
    if (wantProducts) {
      push(`${phrase.trim()} official website`, 'product official site');
      push(`${phrase.trim()} companies`, 'commercial entities');
    }
  }
  if (wantProducts) {
    for (const phrase of phrases.slice(0, 2)) {
      push(`${phrase.trim()} site:apps.apple.com`, 'app-store listings');
      push(`${phrase.trim()} site:play.google.com`, 'play-store listings');
      push(`${phrase.trim()} site:producthunt.com`, 'product directory');
    }
  }

  if (geography && !slices.length) {
    push(`${geography} ${primary}`.slice(0, 120), 'geography-constrained');
  } else if (geography && wantProducts) {
    push(`${primary} ${geography}`.slice(0, 120), 'geography-constrained');
  }

  if (input.intent === INTEL_INTENT.VERIFY && input.entityName) {
    push(`${input.entityName} official website`, 'verification first-party');
    push(`${input.entityName} ${input.claimPredicate || 'about'}`, 'verification secondary');
  }

  if (input.intent === INTEL_INTENT.MARKET_MAP) {
    push(`${primary} providers`, 'market-map providers');
    push(`${primary} pricing`, 'market-map public pricing');
  }

  const cap = Number(input.maxQueries || 5);
  return out.slice(0, cap);
}

export function recordQueryHit(plan, query, evidenceIds = []) {
  const row = (plan || []).find((item) => item.query === query);
  if (row) row.producedEvidence.push(...evidenceIds);
  return plan;
}
