import { randomUUID } from 'node:crypto';

export const ENTITY_TYPE = {
  ORGANIZATION: 'ORGANIZATION',
  PERSON: 'PERSON',
  PRODUCT: 'PRODUCT',
  APP: 'APP',
  WEBSITE: 'WEBSITE',
  LOCATION: 'LOCATION',
  EVENT: 'EVENT',
  OFFER: 'OFFER',
  DIRECTORY: 'DIRECTORY',
  ARTICLE: 'ARTICLE',
  ASSOCIATION: 'ASSOCIATION',
  PUBLICATION: 'PUBLICATION'
};

export const SOURCE_KIND = {
  SEARCH_ENGINE: 'SEARCH_ENGINE',
  FIRST_PARTY_WEB: 'FIRST_PARTY_WEB',
  DIRECTORY: 'DIRECTORY',
  STRUCTURED_API: 'STRUCTURED_API',
  MCP: 'MCP',
  PUBLIC_DATASET: 'PUBLIC_DATASET',
  NEWS: 'NEWS',
  SOCIAL_PUBLIC: 'SOCIAL_PUBLIC',
  DOCUMENT: 'DOCUMENT'
};

// Roles describe how a page may be used. They are intentionally independent
// from source kind: a directory can be a discovery source and evidence source,
// while never being allowed to occupy an entity slot.
export const SOURCE_ROLE = {
  ENTITY_SOURCE: 'ENTITY_SOURCE',
  DISCOVERY_SOURCE: 'DISCOVERY_SOURCE',
  EVIDENCE_SOURCE: 'EVIDENCE_SOURCE',
  FIRST_PARTY_SOURCE: 'FIRST_PARTY_SOURCE',
  AGGREGATOR: 'AGGREGATOR',
  DIRECTORY: 'DIRECTORY',
  LISTICLE: 'LISTICLE',
  SEARCH_RESULT: 'SEARCH_RESULT',
  UNTRUSTED: 'UNTRUSTED',
  BLOCKED: 'BLOCKED'
};

export const SOURCE_STATUS = {
  DISCOVERED: 'DISCOVERED',
  EVALUATED: 'EVALUATED',
  TRUSTED_FOR_SCOPE: 'TRUSTED_FOR_SCOPE',
  QUARANTINED: 'QUARANTINED',
  BLOCKED: 'BLOCKED'
};

export const CLAIM_STATUS = {
  VERIFIED: 'VERIFIED',
  CORROBORATED: 'CORROBORATED',
  DISCOVERED: 'DISCOVERED',
  INFERRED: 'INFERRED',
  CONFLICTED: 'CONFLICTED',
  STALE: 'STALE',
  UNKNOWN: 'UNKNOWN'
};

export const TRUST_CLASS = {
  FIRST_PARTY: 'FIRST_PARTY',
  AUTHORITATIVE: 'AUTHORITATIVE',
  REPUTABLE_SECONDARY: 'REPUTABLE_SECONDARY',
  DIRECTORY: 'DIRECTORY',
  SEARCH_SNIPPET: 'SEARCH_SNIPPET',
  UNTRUSTED: 'UNTRUSTED'
};

export const INTEL_INTENT = {
  DISCOVER: 'DISCOVER',
  VERIFY: 'VERIFY',
  COMPARE: 'COMPARE',
  RESEARCH: 'RESEARCH',
  ENRICH: 'ENRICH',
  MONITOR: 'MONITOR',
  EXPLAIN: 'EXPLAIN',
  MARKET_MAP: 'MARKET_MAP'
};

export const EVIDENCE_BUDGET = {
  QUICK: 'QUICK',
  STANDARD: 'STANDARD',
  HIGH_CONFIDENCE: 'HIGH_CONFIDENCE'
};

export const FRESHNESS_TTL_MS = {
  founding_year: 3650 * 86400000,
  domain: 3650 * 86400000,
  ceo: 180 * 86400000,
  title: 180 * 86400000,
  pricing: 30 * 86400000,
  exhibitor: 14 * 86400000,
  provider_health: 1 * 86400000,
  default: 90 * 86400000
};

export function newId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function inferIntent(text = '') {
  const value = String(text);
  if (/\bverify|confirm|is it true\b/i.test(value)) return INTEL_INTENT.VERIFY;
  if (/\bcompar|vs\.?|versus\b/i.test(value)) return INTEL_INTENT.COMPARE;
  if (/\bmap the|landscape|market map\b/i.test(value)) return INTEL_INTENT.MARKET_MAP;
  if (/\benrich\b/i.test(value) || /\bdecision maker\b/i.test(value)) return INTEL_INTENT.ENRICH;
  if (/\bexplain|why ranked|why is this\b/i.test(value)) return INTEL_INTENT.EXPLAIN;
  if (/\bmonitor|watch\b/i.test(value) && !/\bweek[- ]by[- ]week\b/i.test(value)) return INTEL_INTENT.MONITOR;
  if (/\bfind|discover|identify\b/i.test(value)) return INTEL_INTENT.DISCOVER;
  return INTEL_INTENT.RESEARCH;
}

export function createIntelligenceRequest(input = {}) {
  const question = String(input.question || input.rawRequest || input.objective || input.query || '').trim();
  return {
    intelligenceRequestId: input.intelligenceRequestId || newId('irq'),
    objectiveId: input.objectiveId || null,
    question,
    intent: input.intent || inferIntent(question),
    entityTypes: input.entityTypes || [ENTITY_TYPE.ORGANIZATION],
    geography: input.geography || input.location || null,
    timeframe: input.timeframe || null,
    quantity: Number(input.quantity || input.maxOrganizations || input.findN || 10),
    freshness: input.freshness || 'default',
    constraints: input.constraints || [],
    evidenceRequirements: input.evidenceRequirements || EVIDENCE_BUDGET.STANDARD,
    sourcePreferences: input.sourcePreferences || [],
    sourceExclusions: input.sourceExclusions || [],
    maxCost: input.maxCost ?? null,
    maxSources: Number(input.maxSources || 8),
    maxQueries: Number(input.maxQueries || 5),
    createdAt: input.createdAt || new Date().toISOString()
  };
}

export const QUALITY_CLASS = {
  STRONG: 'STRONG',
  ACCEPTABLE: 'ACCEPTABLE',
  WEAK: 'WEAK',
  FAILED: 'FAILED'
};

export const CLAIM_CURRENCY = {
  CURRENT: 'CURRENT',
  HISTORICAL: 'HISTORICAL',
  SUPERSEDED: 'SUPERSEDED'
};

export const EMPTY_METRICS = {
  researchRuns: 0,
  queriesIssued: 0,
  sourcesAttempted: 0,
  sourcesUsed: 0,
  sourceFailures: 0,
  entitiesDiscovered: 0,
  entitiesAccepted: 0,
  entitiesRejected: 0,
  entityMerges: 0,
  entityMergeRefusals: 0,
  claimsCreated: 0,
  evidenceCreated: 0,
  conflictsDetected: 0,
  adaptationsTriggered: 0,
  cacheHits: 0
};

export function fingerprintText(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}
