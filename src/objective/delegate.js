/**
 * Delegation decision engine. Deterministic rules beat an LLM for "should I swarm?"
 * Trivial lookups never spawn workers. Independent slices may.
 */

import { isTrivialLookup } from './quantities.js';

export const DELEGATION_DEFAULTS = {
  maxConcurrentWorkers: 3,
  maxWorkersPerObjective: 6,
  maxTotalActions: 36,
  objectiveTimeoutMs: 90000,
  maxRepairCycles: 1
};

export function landscapeSlices(text) {
  const cleaned = String(text || '')
    .replace(/^(research|find|discover|rank|compare|map|identify)\s+\d*\s*/i, '')
    .replace(/\bdo not contact anyone\.?/gi, '')
    .replace(/\bidentify\b[^.]*/gi, '')
    .split(/[.!?]/)[0]
    .replace(/^(the )?competitive landscape for\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  const out = [];
  const push = (phrase) => {
    let p = String(phrase || '').replace(/^(the|a|an|for|and|their|solutions serving)\s+/i, '').trim();
    p = p.replace(/\ssolutions$/i, '').trim();
    if (!p || p.split(/\s+/).length > 5) return;
    if (/^(in|at|from|california|providers|competitive|solutions|practices)\b/i.test(p)) return;
    if (/solutions serving/i.test(p)) return;
    if (!out.some((item) => item.toLowerCase() === p.toLowerCase())) out.push(p);
  };

  if (/\bexhibitors?\b/i.test(cleaned)) {
    const event = cleaned.match(/\b([A-Z][\w&]+(?:\s+[A-Z][\w&]+){1,4}(?:\s+\d{4})?)/);
    if (event?.[1]) push(`${event[1].trim()} exhibitors`);
    else push(cleaned.split(/\s+/).slice(0, 6).join(' '));
  }
  const productRe = /\b((?:ai|virtual)\s+receptionist|[a-z]{3,}(?:\s+[a-z0-9+]{2,}){0,2}\s+(?:apps?|platforms?|software|saas|receptionist))\b/gi;
  let m;
  while ((m = productRe.exec(cleaned))) push(m[1]);

  const product = out.find((s) => /\b(receptionist|software|saas|apps?|platforms?)\b/i.test(s));
  const verticalHit = cleaned.match(/\b(dental|medical|legal|hvac|solar|roofing|logistics|insurance|grease-trap|fog)\b/i);
  if (product && verticalHit && !new RegExp(verticalHit[1], 'i').test(product)) {
    out.unshift(`${product} ${verticalHit[1]}`.replace(/\s+/g, ' ').trim());
  }
  const ranked = product
    ? out.filter((s) => /\b(receptionist|software|saas|apps?|platforms?)\b/i.test(s))
    : out;
  if (!ranked.length) {
    const compounds = cleaned.match(/\b[a-z]+(?:-[a-z]+)+\b/gi) || [];
    const acronyms = String(text || '').match(/\b[A-Z]{2,5}\b/g) || [];
    const industry = [
      ...compounds,
      ...acronyms.filter((a) => !/^(US|USA|AI|THE|AND|FOR|NOT)$/.test(a))
    ].slice(0, 3);
    if (industry.length) {
      ranked.push(`${industry.join(' ')} software`.replace(/\s+/g, ' ').trim());
    } else {
      const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 8).join(' ');
      if (words) ranked.push(words);
    }
  }
  return ranked.slice(0, 3);
}

export function decideDelegation(objective = {}, { catalogue = [] } = {}) {
  const text = String(objective.rawRequest || '');
  const findN = Number(objective.context?.findN || 10);
  const slices = Array.isArray(objective.context?.slices) ? objective.context.slices.filter(Boolean) : [];
  const pattern = objective.context?.pattern;

  if (isTrivialLookup(text) || pattern === 'direct_capability') {
    return {
      delegate: false,
      reason: 'Trivial lookup — execute the matching capability directly.',
      estimatedWorkers: 0,
      estimatedBenefit: 'none',
      pattern: 'direct',
      slices: []
    };
  }
  if (pattern === 'authorized_test') {
    return {
      delegate: false,
      reason: 'Authorized test is a single gated side effect, not a swarm.',
      estimatedWorkers: 0,
      estimatedBenefit: 'none',
      pattern: 'direct',
      slices: []
    };
  }

  if (slices.length >= 2) {
    const workers = Math.min(slices.length + 2, DELEGATION_DEFAULTS.maxWorkersPerObjective);
    return {
      delegate: true,
      reason: `${slices.length} independent slices can research in parallel, then a synthesizer merges evidence.`,
      estimatedWorkers: workers,
      estimatedBenefit: 'wall-clock overlap across slices; better comparison coverage',
      pattern: 'parallel-verticals',
      slices
    };
  }

  if (/competitive landscape|strategic opportunit/i.test(text)) {
    const inferred = slices.length ? slices : landscapeSlices(text);
    return {
      delegate: true,
      reason: 'Competitive landscape is independent category research plus synthesis.',
      estimatedWorkers: Math.min(Math.max(inferred.length, 1) + 2, DELEGATION_DEFAULTS.maxWorkersPerObjective),
      estimatedBenefit: 'separate category scouts before a single synthesis',
      pattern: 'competitive-landscape',
      slices: inferred
    };
  }

  if (findN >= 12) {
    const inferred = (slices.length && slices[0] !== 'general') ? slices : landscapeSlices(text);
    return {
      delegate: true,
      reason: `Large set (${findN}) benefits from two bounded scouts rather than one serial discover.`,
      estimatedWorkers: 4,
      estimatedBenefit: 'split discovery queries; shared research/synthesis',
      pattern: 'split-research',
      slices: inferred.length ? inferred : ['general']
    };
  }

  void catalogue;
  return {
    delegate: false,
    reason: 'Single-stream research is cheaper than a swarm for this objective.',
    estimatedWorkers: 0,
    estimatedBenefit: 'none',
    pattern: 'direct',
    slices
  };
}
