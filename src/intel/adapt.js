/**
 * Adaptive query strategy + novelty tracking.
 * LLM may propose changes; the system validates them.
 */

import { newId } from './schema.js';
import { inferPlaybookClass } from './classify.js';
import { wrapUntrusted } from '../objective/context-pack.js';

export function normalizeQuery(q = '') {
  return String(q || '')
    .toLowerCase()
    .replace(/<<UNTRUSTED_DATA>>[\s\S]*?<<END_UNTRUSTED_DATA>>/g, ' ')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\b(the|a|an|for|in|of|and|or)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isNovelQuery(query, previous = []) {
  const n = normalizeQuery(query);
  if (!n || n.length < 4) return false;
  return !previous.some((p) => {
    const m = normalizeQuery(p.query || p);
    if (!m) return false;
    if (m === n) return true;
    const [a, b] = m.length > n.length ? [m, n] : [n, m];
    if (a.includes(b) && b.split(' ').length >= 3) return true;
    const at = new Set(a.split(' '));
    const bt = b.split(' ').filter(Boolean);
    const overlap = bt.filter((t) => at.has(t)).length;
    if (bt.length >= 2 && overlap === bt.length) return true;
    return bt.length >= 3 && overlap / bt.length >= 0.85;
  });
}

function poisoned(text = '') {
  return /ignore (your|the) (objective|instructions)|email this list|disable approval|call (our )?sales/i.test(String(text));
}

export function proposeAdaptations({ quality, request, previousQueries = [], vocabulary = [], playbook } = {}) {
  const question = request?.question || '';
  if (poisoned(question)) {
    return [];
  }
  const pb = playbook || inferPlaybookClass(question);
  const weaknesses = quality?.weaknesses || [];
  const out = [];
  const push = (kind, queries, why, sourceTypes = []) => {
    const novel = (queries || []).filter((q) => isNovelQuery(q, previousQueries) && !poisoned(q));
    if (!novel.length && !sourceTypes.length) return;
    out.push({
      adaptationId: newId('adp'),
      kind,
      queries: novel,
      sourceTypes,
      why,
      playbook: pb
    });
  };

  const types = new Set(weaknesses.map((w) => w.type));
  const qn = String(question);
  if (types.has('slot-pollution') || types.has('entity-type') || types.has('relevance')) {
    if (pb === 'product-landscape' && /pregnan|parenting/i.test(qn)) {
      push('category-to-product', ['official app website', 'tracker app official site'], 'Wrong entity types occupied slots — search first-party product homepages.');
    }
    if (/\breceptionist\b/i.test(qn)) {
      push('synonym', ['virtual receptionist software', 'AI phone answering'], 'Category synonym queries after junk occupied slots.');
    }
    if (pb === 'b2b-software' || pb === 'regulated-information') {
      const head = qn.split(/[.!?]/)[0].slice(0, 80);
      push('ecosystem', [`${head} software`, `${head} association`], 'Off-topic or wrong-type results — search industry software and catalogues.');
    }
  }
  if (types.has('quantity') || quality?.classification === 'WEAK' || quality?.classification === 'FAILED') {
    if (pb === 'product-landscape' && /pregnan|parenting/i.test(qn)) {
      push('plural-to-product', ['pregnancy tracker app', 'parenting app official', 'baby tracker app'], 'Low legitimate recall — expand product nouns, not competitor lists.');
    } else if (pb === 'product-landscape') {
      const head = qn.split(/[.!?]/)[0].slice(0, 70);
      push('plural-to-product', [`${head} official site`], 'Low legitimate recall — first-party product homepages.');
    }
    if (/\breceptionist\b/i.test(qn) && /\bdental\b/i.test(qn)) {
      push('consumer-to-industry', ['AI receptionist dental', 'dental virtual receptionist', 'dental answering service AI'], 'Dental-specific coverage weak — compose product + vertical nouns from the objective.');
    }
    if (pb === 'local-business') {
      push('search-to-directory', [], 'Generic search returned SEO titles — try public business directories.', ['DIRECTORY', 'FIRST_PARTY_WEB']);
    }
    if (pb === 'b2b-software' || pb === 'regulated-information') {
      push('ecosystem', [`${String(question).split(/[.!?]/)[0].slice(0, 80)} software`, `${String(question).split(/[.!?]/)[0].slice(0, 60)} association`], 'Unknown domain — discover industry vocabulary and catalogues.', ['SEARCH_ENGINE', 'DIRECTORY']);
    }
  }
  if (types.has('first-party')) {
    push('directory-to-first-party', previousQueries.slice(0, 3).map((q) => `${q.query || q} official website`), 'Promote aggregator hits to first-party verification.');
  }
  if (types.has('monoculture')) {
    push('diversify', [], 'One source dominated — seek independent/first-party corroboration.', ['FIRST_PARTY_WEB', 'SEARCH_ENGINE']);
  }
  for (const term of (vocabulary || []).slice(0, 4)) {
    if (term?.term && isNovelQuery(term.term, previousQueries) && !poisoned(term.term)) {
      push('vocabulary', [term.term], `Evidence-backed terminology “${term.term}”.`);
    }
  }
  return out.slice(0, 4);
}

export function extractVocabulary(snippets = [], question = '') {
  const blob = snippets.map((s) => String(s || '')).join(' ').slice(0, 8000);
  if (poisoned(blob)) return [];
  const terms = new Set();
  const re = /\b((?:ai|virtual|cloud|patient|commercial)?\s?(?:receptionist|call automation|scheduling|voice ai|answering service|fog|grease trap|interceptor|hauler|work order|routing)\s?(?:software|platform|system|app)?)\b/gi;
  let m;
  while ((m = re.exec(blob))) {
    const term = m[1].replace(/\s+/g, ' ').trim();
    if (term.length >= 6 && term.length <= 48) terms.add(term);
  }
  return [...terms].slice(0, 8).map((term) => ({
    term,
    provenance: 'search-snippet',
    fromQuestion: new RegExp(term.split(' ')[0], 'i').test(question)
  }));
}
