/**
 * Planner-facing capability introspection.
 * Extra metadata is merged onto the live registry; tools are never assumed.
 */

import { TOOL_HEALTH } from '../fabric/descriptor.js';

export const SIDE_EFFECT = {
  READ_ONLY: 'READ_ONLY',
  LOW_RISK_WRITE: 'LOW_RISK_WRITE',
  EXTERNAL_SIDE_EFFECT: 'EXTERNAL_SIDE_EFFECT',
  FINANCIAL: 'FINANCIAL',
  DESTRUCTIVE: 'DESTRUCTIVE'
};

export const OUTBOUND_CAPABILITIES = [
  'voice.call',
  'outreach.call',
  'outreach.email',
  'outreach.execute',
  'campaign.orchestrate',
  'social.publish',
  'email.send'
];

const SIDE_EFFECT_BY_ID = {
  'voice.call': SIDE_EFFECT.EXTERNAL_SIDE_EFFECT,
  'outreach.call': SIDE_EFFECT.EXTERNAL_SIDE_EFFECT,
  'outreach.email': SIDE_EFFECT.EXTERNAL_SIDE_EFFECT,
  'outreach.execute': SIDE_EFFECT.EXTERNAL_SIDE_EFFECT,
  'campaign.orchestrate': SIDE_EFFECT.EXTERNAL_SIDE_EFFECT,
  'social.publish': SIDE_EFFECT.EXTERNAL_SIDE_EFFECT,
  'email.send': SIDE_EFFECT.EXTERNAL_SIDE_EFFECT,
  'payment.checkout': SIDE_EFFECT.FINANCIAL,
  'prospect.store': SIDE_EFFECT.LOW_RISK_WRITE,
  'acquisition.run': SIDE_EFFECT.LOW_RISK_WRITE,
  'campaign.prepare': SIDE_EFFECT.LOW_RISK_WRITE,
  'campaign.control': SIDE_EFFECT.LOW_RISK_WRITE,
  'objective.run': SIDE_EFFECT.LOW_RISK_WRITE,
  'objective.report': SIDE_EFFECT.READ_ONLY
};

const TAGS_BY_ID = {
  'web.search': ['discover', 'search'],
  'web.scrape': ['discover', 'scrape'],
  'web.crawl': ['discover', 'crawl'],
  'web.browser.extract': ['discover', 'directory'],
  'web.render': ['discover', 'directory'],
  'web.extract': ['discover'],
  'org.discover': ['discover'],
  'company.research': ['research'],
  'company.research.batch': ['research'],
  'contact.discover': ['contacts'],
  'contact.discover.batch': ['contacts'],
  'prospect.qualify': ['qualify'],
  'prospect.score': ['score', 'rank'],
  'prospect.enrich': ['enrich'],
  'objective.report': ['report'],
  'outreach.email': ['outbound', 'email'],
  'outreach.call': ['outbound', 'voice'],
  'outreach.execute': ['outbound']
};

const COST_RANK = { FREE: 0, NEGLIGIBLE: 1, LOW: 2, MEDIUM: 3, HIGH: 4, UNKNOWN: 3 };

function costCategory(expectedCost = 0) {
  if (expectedCost <= 0) return 'free';
  if (expectedCost < 0.01) return 'low';
  if (expectedCost < 0.05) return 'medium';
  return 'high';
}

function defaultRetry(sideEffect) {
  if (sideEffect === SIDE_EFFECT.READ_ONLY) return { max: 2, backoffMs: 400 };
  if (sideEffect === SIDE_EFFECT.LOW_RISK_WRITE) return { max: 1, backoffMs: 800 };
  return { max: 0, backoffMs: 0 };
}

export function classifyCapability(capabilityId, entry = {}) {
  if (entry.sideEffect) return entry.sideEffect;
  if (SIDE_EFFECT_BY_ID[capabilityId]) return SIDE_EFFECT_BY_ID[capabilityId];
  if (entry.requiresApproval) return SIDE_EFFECT.EXTERNAL_SIDE_EFFECT;
  if (/\b(delete|destroy|purge|drop|wipe)\b/i.test(capabilityId)) return SIDE_EFFECT.DESTRUCTIVE;
  if (/payment|purchase|checkout|transfer/.test(capabilityId)) return SIDE_EFFECT.FINANCIAL;
  return SIDE_EFFECT.READ_ONLY;
}

export function isOutboundCapability(capabilityId) {
  return OUTBOUND_CAPABILITIES.includes(capabilityId)
    || /outbound\.|email\.send|blast_email|voice\.call/.test(String(capabilityId || ''));
}

export function inspectCatalogue(registry, { availableOnly = true, vertical, healthOverlay = {} } = {}) {
  if (!registry) return [];
  const listed = registry.list({ availableOnly: false, vertical });
  return listed.map((cap) => {
    const described = registry.describe(cap.capabilityId);
    const rawProviders = described?.providers || [];
    const providers = rawProviders.map((p) => {
      const overlay = healthOverlay[p.provider] || healthOverlay[cap.capabilityId];
      const available = overlay === TOOL_HEALTH.UNAVAILABLE || overlay === 'UNAVAILABLE' ? false : p.available;
      return {
        provider: p.provider,
        available,
        health: overlay || (p.available ? TOOL_HEALTH.HEALTHY : TOOL_HEALTH.UNAVAILABLE),
        expectedCost: p.expectedCost,
        expectedLatencyMs: p.expectedLatencyMs,
        requiresApproval: p.requiresApproval,
        fallbackProvider: p.fallbackProvider || null,
        failureModes: p.failureModes || []
      };
    });
    const availableProviders = providers.filter((p) => p.available).sort((a, b) => (a.expectedCost || 0) - (b.expectedCost || 0));
    const preferred = availableProviders[0] || providers[0] || {};
    const preferredMeta = rawProviders.find((p) => p.provider === preferred.provider) || rawProviders[0] || {};
    const sideEffect = classifyCapability(cap.capabilityId, preferredMeta);
    const available = providers.some((p) => p.available);
    return {
      capabilityId: cap.capabilityId,
      description: preferredMeta.description || preferredMeta.name || cap.capabilityId,
      inputSchema: preferredMeta.inputs || null,
      outputSchema: preferredMeta.outputs || null,
      providers,
      preferredProvider: preferred.provider || cap.preferredProvider,
      available,
      sideEffect,
      requiresApproval: cap.requiresApproval || preferred.requiresApproval || isOutboundCapability(cap.capabilityId),
      costCategory: costCategory(preferred.expectedCost),
      costClass: costCategory(preferred.expectedCost).toUpperCase(),
      expectedCost: preferred.expectedCost ?? 0,
      timeoutMs: preferred.expectedLatencyMs ?? 8000,
      retryPolicy: preferredMeta.retryPolicy || defaultRetry(sideEffect),
      idempotent: preferredMeta.idempotent ?? sideEffect === SIDE_EFFECT.READ_ONLY,
      prerequisites: preferredMeta.prerequisites || [],
      tags: preferredMeta.tags || TAGS_BY_ID[cap.capabilityId] || [],
      permissions: cap.permissions || [],
      health: preferred.health || (available ? TOOL_HEALTH.HEALTHY : TOOL_HEALTH.UNAVAILABLE)
    };
  }).filter((cap) => !availableOnly || cap.available);
}

export function catalogueHas(catalogue, capabilityId) {
  return catalogue.some((cap) => cap.capabilityId === capabilityId && cap.available !== false);
}

export function pickCapability(catalogue, ids = []) {
  return pickCapabilityEntry(catalogue, ids)?.capabilityId || null;
}

export function pickCapabilityEntry(catalogue, ids = []) {
  for (const id of ids) {
    const cap = catalogue.find((c) => c.capabilityId === id && c.available !== false && c.health !== 'UNAVAILABLE');
    if (cap) return cap;
  }
  return null;
}
