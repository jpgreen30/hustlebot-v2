/**
 * Strategy playbooks — classes, not vertical competitor lists.
 */

import { inferPlaybookClass } from './classify.js';
import { newId } from './schema.js';

export const SAMPLE_THRESHOLD = 3;

export const PLAYBOOKS = {
  'product-landscape': {
    playbookId: 'pb_product_landscape',
    class: 'product-landscape',
    queryShapes: ['{category} app', '{category} platform', '{category} tracker app', 'site:apps.apple.com {category}'],
    sourceTypes: ['SEARCH_ENGINE', 'FIRST_PARTY_WEB'],
    verification: 'first-party-homepage',
    version: 1
  },
  'local-business': {
    playbookId: 'pb_local_business',
    class: 'local-business',
    queryShapes: ['{industry} {geography} companies', '{geography} {industry} contractors'],
    sourceTypes: ['SEARCH_ENGINE', 'DIRECTORY', 'FIRST_PARTY_WEB'],
    verification: 'directory-then-first-party',
    version: 1
  },
  'event-exhibitors': {
    playbookId: 'pb_event_exhibitors',
    class: 'event-exhibitors',
    queryShapes: ['{event} exhibitors', '{event} exhibitor directory'],
    sourceTypes: ['FIRST_PARTY_WEB', 'SEARCH_ENGINE'],
    verification: 'event-page-then-company-site',
    version: 1
  },
  'b2b-software': {
    playbookId: 'pb_b2b_software',
    class: 'b2b-software',
    queryShapes: ['{category} software', '{category} platform vendors'],
    sourceTypes: ['SEARCH_ENGINE', 'DIRECTORY', 'FIRST_PARTY_WEB'],
    verification: 'first-party',
    version: 1
  },
  'regulated-information': {
    playbookId: 'pb_regulated',
    class: 'regulated-information',
    queryShapes: ['{topic} software', '{topic} association', '{topic} regulation'],
    sourceTypes: ['SEARCH_ENGINE', 'FIRST_PARTY_WEB'],
    verification: 'authority-plus-vendor-split',
    version: 1
  },
  'general-research': {
    playbookId: 'pb_general',
    class: 'general-research',
    queryShapes: ['{question}'],
    sourceTypes: ['SEARCH_ENGINE', 'FIRST_PARTY_WEB'],
    verification: 'evidence',
    version: 1
  }
};

export function matchPlaybook(question = '') {
  const id = inferPlaybookClass(question);
  return { ...PLAYBOOKS[id] };
}

export function shouldTrustObservation(obs = {}) {
  const n = Number(obs.observations || 0);
  const ageMs = Date.now() - Date.parse(obs.lastObservedAt || 0);
  if (n < SAMPLE_THRESHOLD) return false;
  if (!Number.isFinite(ageMs) || ageMs > 30 * 86400000) return false;
  if (obs.trustClass === 'UNTRUSTED' || obs.poisoned === true) return false;
  return true;
}

export function recordPlaybookOutcome(store, playbook, outcome = {}) {
  if (!store || !playbook) return null;
  const rec = {
    playbookId: playbook.playbookId || newId('pb'),
    class: playbook.class,
    version: (playbook.version || 1),
    lastOutcome: {
      acceptedYield: outcome.acceptedYield ?? null,
      noiseRatio: outcome.noiseRatio ?? null,
      quality: outcome.quality || null,
      at: new Date().toISOString()
    },
    observations: Number(playbook.observations || 0) + 1,
    updatedAt: new Date().toISOString()
  };
  if (rec.observations < SAMPLE_THRESHOLD) rec.note = 'below sample threshold — suggestion only';
  return store.put('playbooks', rec);
}
