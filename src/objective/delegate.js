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
  const primary = String(text || '')
    .replace(/^(research|find|discover|rank|compare|map|identify)\s+\d*\s*/i, '')
    .replace(/\bdo not contact anyone\.?/gi, '')
    .replace(/\bidentify\b[^.]*/gi, '')
    .split(/[.!?]/)[0];
  const re = /\b((?:ai\s+)?[a-z]{3,}(?:\s+[a-z0-9+]{2,}){0,3}\s+(?:apps?|platforms?|solutions|practices|receptionist))\b/gi;
  const out = [];
  let m;
  while ((m = re.exec(primary))) {
    let phrase = m[1].replace(/^(the|a|an|for|and|their)\s+/i, '').trim();
    phrase = phrase.replace(/^(competitive landscape for|landscape for)\s+/i, '');
    if (!phrase || phrase.split(/\s+/).length > 6) continue;
    if (/^(in|at|from|california|providers|competitive)\b/i.test(phrase)) continue;
    if (!out.some((item) => item.toLowerCase() === phrase.toLowerCase())) out.push(phrase);
  }
  if (!out.length) {
    const fallback = primary.replace(/^(the )?competitive landscape for\s+/i, '').slice(0, 90).trim();
    if (fallback) out.push(fallback);
  }
  return out.slice(0, 3);
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
    return {
      delegate: true,
      reason: `Large set (${findN}) benefits from two bounded scouts rather than one serial discover.`,
      estimatedWorkers: 4,
      estimatedBenefit: 'split discovery queries; shared research/synthesis',
      pattern: 'split-research',
      slices: slices.length ? slices : [objective.context?.industry || 'general']
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
