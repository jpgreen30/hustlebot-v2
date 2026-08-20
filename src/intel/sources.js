/**
 * Dynamic SourceRegistry. Built-in providers plus discovered public sources.
 * Tool Fabric policy remains authoritative for MCP/tools.
 */

import { SOURCE_KIND, SOURCE_STATUS, newId } from './schema.js';
import { COST_CLASS, TOOL_HEALTH, POLICY_STATE } from '../fabric/descriptor.js';

export const BUILTIN_SOURCES = [
  {
    sourceId: 'src_web_search',
    provider: 'web-search',
    sourceType: SOURCE_KIND.SEARCH_ENGINE,
    capabilities: ['search'],
    entityTypes: ['ORGANIZATION', 'PRODUCT', 'EVENT'],
    geography: 'global',
    freshness: 'hours',
    authorityClass: 'SEARCH_SNIPPET',
    costClass: COST_CLASS.FREE,
    latencyClass: 'LOW',
    requiresAuth: false,
    restrictions: ['snippets-not-facts']
  },
  {
    sourceId: 'src_firecrawl',
    provider: 'firecrawl',
    sourceType: SOURCE_KIND.FIRST_PARTY_WEB,
    capabilities: ['scrape', 'extract'],
    entityTypes: ['ORGANIZATION', 'PRODUCT', 'PERSON', 'EVENT'],
    geography: 'global',
    freshness: 'live',
    authorityClass: 'FIRST_PARTY',
    costClass: COST_CLASS.LOW,
    latencyClass: 'MEDIUM',
    requiresAuth: true,
    restrictions: ['js-render']
  },
  {
    sourceId: 'src_spider',
    provider: 'custom-spider',
    sourceType: SOURCE_KIND.FIRST_PARTY_WEB,
    capabilities: ['scrape', 'crawl'],
    entityTypes: ['ORGANIZATION', 'EVENT'],
    geography: 'global',
    freshness: 'live',
    authorityClass: 'FIRST_PARTY',
    costClass: COST_CLASS.FREE,
    latencyClass: 'LOW',
    requiresAuth: false,
    restrictions: ['robots', 'no-captcha-bypass']
  },
  {
    sourceId: 'src_browser',
    provider: 'browser-render',
    sourceType: SOURCE_KIND.DIRECTORY,
    capabilities: ['extract', 'directory'],
    entityTypes: ['ORGANIZATION', 'EVENT'],
    geography: 'global',
    freshness: 'live',
    authorityClass: 'DIRECTORY',
    costClass: COST_CLASS.LOW,
    latencyClass: 'HIGH',
    requiresAuth: true,
    restrictions: ['js-directory']
  },
  {
    sourceId: 'src_apollo',
    provider: 'apollo',
    sourceType: SOURCE_KIND.STRUCTURED_API,
    capabilities: ['people', 'enrich'],
    entityTypes: ['PERSON', 'ORGANIZATION'],
    geography: 'global',
    freshness: 'days',
    authorityClass: 'REPUTABLE_SECONDARY',
    costClass: COST_CLASS.HIGH,
    latencyClass: 'LOW',
    requiresAuth: true,
    restrictions: ['paid', 'not-verification-alone']
  },
  {
    sourceId: 'src_yellowpages',
    provider: 'yellowpages',
    sourceType: SOURCE_KIND.DIRECTORY,
    capabilities: ['directory'],
    entityTypes: ['ORGANIZATION'],
    geography: 'us',
    freshness: 'weeks',
    authorityClass: 'DIRECTORY',
    costClass: COST_CLASS.FREE,
    latencyClass: 'MEDIUM',
    requiresAuth: false,
    restrictions: ['local-business']
  },
  {
    sourceId: 'src_mcp',
    provider: 'mcp',
    sourceType: SOURCE_KIND.MCP,
    capabilities: ['tool'],
    entityTypes: ['ORGANIZATION'],
    geography: 'global',
    freshness: 'unknown',
    authorityClass: 'UNTRUSTED',
    costClass: COST_CLASS.UNKNOWN,
    latencyClass: 'MEDIUM',
    requiresAuth: false,
    restrictions: ['name-is-not-trust', 'fabric-policy']
  }
];

function overlayHealth(provider, overlay = {}) {
  return overlay[provider] || overlay[`${provider}`] || null;
}

export class SourceRegistry {
  constructor({ store, fabric } = {}) {
    this.store = store || null;
    this.fabric = fabric || null;
    this.sources = new Map();
    for (const src of BUILTIN_SOURCES) {
      this.sources.set(src.sourceId, {
        ...src,
        status: SOURCE_STATUS.TRUSTED_FOR_SCOPE,
        health: TOOL_HEALTH.UNVERIFIED,
        observations: []
      });
    }
  }

  list() {
    return [...this.sources.values()];
  }

  get(id) {
    return this.sources.get(id) || null;
  }

  byProvider(provider) {
    return this.list().find((s) => s.provider === provider) || null;
  }

  upsert(source) {
    const rec = {
      sourceId: source.sourceId || newId('src'),
      status: source.status || SOURCE_STATUS.DISCOVERED,
      health: source.health || TOOL_HEALTH.UNVERIFIED,
      observations: source.observations || [],
      ...source
    };
    this.sources.set(rec.sourceId, rec);
    this.store?.putSource?.(rec);
    return rec;
  }

  discoverPublicSource({ url, host, reason, sourceType } = {}) {
    const existing = this.list().find((s) => s.host === host || s.url === url);
    if (existing) return existing;
    return this.upsert({
      sourceId: newId('src'),
      provider: host || 'discovered-web',
      host,
      url,
      sourceType: sourceType || SOURCE_KIND.DOCUMENT,
      capabilities: ['read'],
      entityTypes: ['ORGANIZATION'],
      authorityClass: 'UNTRUSTED',
      costClass: COST_CLASS.FREE,
      status: SOURCE_STATUS.DISCOVERED,
      health: TOOL_HEALTH.UNVERIFIED,
      classificationReason: reason || 'discovered during research; not auto-trusted',
      restrictions: ['not-permanent-provider']
    });
  }

  quarantine(sourceId, reason, { block = false } = {}) {
    const rec = this.get(sourceId);
    if (!rec) return null;
    rec.status = block ? SOURCE_STATUS.BLOCKED : SOURCE_STATUS.QUARANTINED;
    rec.quarantineReason = reason;
    rec.quarantinedAt = new Date().toISOString();
    this.sources.set(sourceId, rec);
    this.store?.putSource?.(rec);
    return rec;
  }

  evaluateDiscovered(sourceId, { robotsOk, structured, relevant, deceptive } = {}) {
    const rec = this.get(sourceId);
    if (!rec) return null;
    if (deceptive || robotsOk === false) return this.quarantine(sourceId, deceptive ? 'deceptive-redirect' : 'robots-disallow');
    rec.status = SOURCE_STATUS.EVALUATED;
    rec.evaluation = { robotsOk, structured, relevant, at: new Date().toISOString() };
    if (relevant && structured) rec.status = SOURCE_STATUS.TRUSTED_FOR_SCOPE;
    this.sources.set(sourceId, rec);
    return rec;
  }

  /**
   * Live health wins over historical memory. Memory may tilt cost/reliability
   * among currently healthy sources only.
   */
  select(request = {}, { healthOverlay = {}, memory = [], forceUnavailable = [] } = {}) {
    const down = new Set(forceUnavailable);
    const ranked = [];
    for (const src of this.list()) {
      if (src.status === SOURCE_STATUS.BLOCKED || src.status === SOURCE_STATUS.QUARANTINED) continue;
      if (request.sourceExclusions?.includes(src.provider) || request.sourceExclusions?.includes(src.sourceId)) continue;
      const live = overlayHealth(src.provider, healthOverlay);
      const health = down.has(src.provider) || live === TOOL_HEALTH.UNAVAILABLE || live === 'UNAVAILABLE'
        ? TOOL_HEALTH.UNAVAILABLE
        : (live || src.health);
      if (health === TOOL_HEALTH.UNAVAILABLE) continue;
      if (src.requiresAuth && src.provider === 'apollo' && health === TOOL_HEALTH.UNVERIFIED) {
        /* still selectable if configured; caller marks health */
      }
      let score = 40;
      if (src.sourceType === SOURCE_KIND.SEARCH_ENGINE && /DISCOVER|RESEARCH|MARKET_MAP|COMPARE/i.test(request.intent || '')) score += 25;
      if (src.sourceType === SOURCE_KIND.FIRST_PARTY_WEB && /VERIFY|ENRICH|RESEARCH/i.test(request.intent || '')) score += 30;
      if (src.sourceType === SOURCE_KIND.DIRECTORY && /DISCOVER/i.test(request.intent || '')) score += 20;
      if (src.sourceType === SOURCE_KIND.STRUCTURED_API && /ENRICH/i.test(request.intent || '')) score += 15;
      if (src.authorityClass === 'FIRST_PARTY') score += 12;
      if (src.costClass === COST_CLASS.FREE || src.costClass === COST_CLASS.NEGLIGIBLE) score += 8;
      if (src.costClass === COST_CLASS.HIGH && request.evidenceRequirements !== 'HIGH_CONFIDENCE') score -= 10;
      const lesson = (memory || []).find((m) => m.subject === src.provider || (m.tags || []).includes(src.provider));
      if (lesson && lesson.expiresAt && lesson.expiresAt > new Date().toISOString()) {
        if (/block|403|fail/i.test(lesson.content || '')) score -= 8;
        if (/high-quality|success/i.test(lesson.content || '')) score += 6;
      }
      ranked.push({
        ...src,
        health,
        score,
        reasonSelected: `${src.provider} ${src.sourceType} health=${health} score=${score}`
      });
    }
    ranked.sort((a, b) => b.score - a.score);
    return ranked.slice(0, request.maxSources || 6);
  }

  applyFabricPolicy(descriptor) {
    if (!descriptor) return null;
    if (descriptor.policyState === POLICY_STATE.QUARANTINED || descriptor.policyState === POLICY_STATE.DISABLED) {
      return this.quarantine(descriptor.capabilityId || descriptor.sourceId || newId('src'), 'fabric-policy');
    }
    return null;
  }
}

/**
 * Contextual source quality. First-party is strong for own facts, weak for
 * comparative superlatives. Numbers are explanatory, not fake precision.
 */
export function sourceQuality(source = {}, claim = {}) {
  const firstParty = source.authorityClass === 'FIRST_PARTY' || source.sourceType === SOURCE_KIND.FIRST_PARTY_WEB;
  const predicate = String(claim.predicate || '');
  let relevance = 0.5;
  let note = 'Contextual: first-party is strong for own facts, weak for comparative superlatives.';
  if (firstParty && /pricing|price/.test(predicate)) {
    relevance = 0.9;
    note = 'First-party pricing page is strong evidence of current public pricing, not of being “best”.';
  } else if (firstParty && /founding_year|domain|described_as/.test(predicate)) {
    relevance = 0.85;
    note = 'First-party about page is strong for self-described identity.';
  } else if (firstParty && /best|leader|ranked/.test(predicate)) {
    relevance = 0.2;
    note = 'A company’s own site is poor evidence that it is objectively best.';
  } else if (!firstParty && /founding_year|pricing/.test(predicate)) {
    relevance = 0.45;
    note = 'Secondary source needs independent corroboration for this predicate.';
  }
  return {
    authority: source.authorityClass || 'UNTRUSTED',
    firstParty,
    relevance,
    freshness: source.freshness || 'unknown',
    specificity: source.sourceType || 'unknown',
    corroboration: 'independent evidence counted separately',
    extractionQuality: source.health || 'UNVERIFIED',
    note
  };
}
