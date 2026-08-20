/**
 * Canonical tool descriptor. Every native, MCP, n8n, and provider tool
 * is reduced to this shape before the planner sees it.
 */

import { SIDE_EFFECT } from '../objective/catalogue.js';

export const SOURCE_TYPE = {
  NATIVE: 'native',
  MCP: 'mcp',
  N8N: 'n8n',
  PROVIDER: 'provider'
};

export const POLICY_STATE = {
  DISCOVERED: 'DISCOVERED',
  QUARANTINED: 'QUARANTINED',
  APPROVED: 'APPROVED',
  DISABLED: 'DISABLED',
  UNHEALTHY: 'UNHEALTHY'
};

export const TOOL_HEALTH = {
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  UNAVAILABLE: 'UNAVAILABLE',
  UNVERIFIED: 'UNVERIFIED',
  DISABLED: 'DISABLED'
};

export const COST_CLASS = {
  FREE: 'FREE',
  NEGLIGIBLE: 'NEGLIGIBLE',
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  UNKNOWN: 'UNKNOWN'
};

export const COST_RANK = {
  FREE: 0,
  NEGLIGIBLE: 1,
  LOW: 2,
  MEDIUM: 3,
  HIGH: 4,
  UNKNOWN: 3
};

export function costClassFromExpected(expectedCost) {
  if (expectedCost == null || Number.isNaN(Number(expectedCost))) return COST_CLASS.UNKNOWN;
  const n = Number(expectedCost);
  if (n <= 0) return COST_CLASS.FREE;
  if (n < 0.001) return COST_CLASS.NEGLIGIBLE;
  if (n < 0.01) return COST_CLASS.LOW;
  if (n < 0.05) return COST_CLASS.MEDIUM;
  return COST_CLASS.HIGH;
}

export function expectedFromCostClass(costClass) {
  switch (costClass) {
    case COST_CLASS.FREE: return 0;
    case COST_CLASS.NEGLIGIBLE: return 0.0004;
    case COST_CLASS.LOW: return 0.004;
    case COST_CLASS.MEDIUM: return 0.02;
    case COST_CLASS.HIGH: return 0.08;
    default: return 0;
  }
}

export function sanitizeToolId(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9._:\-]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 80);
}

export function createToolDescriptor(input = {}) {
  const now = new Date().toISOString();
  return {
    toolId: input.toolId,
    sourceType: input.sourceType || SOURCE_TYPE.NATIVE,
    sourceId: input.sourceId || null,
    name: input.name || input.toolId,
    description: input.description || '',
    inputSchema: input.inputSchema || { type: 'object', properties: {} },
    outputSchema: input.outputSchema || null,
    tags: Array.isArray(input.tags) ? input.tags : [],
    provider: input.provider || input.sourceType || 'unknown',
    sideEffect: input.sideEffect || SIDE_EFFECT.READ_ONLY,
    approvalRequired: input.approvalRequired === true,
    authRequired: input.authRequired === true,
    costClass: input.costClass || COST_CLASS.UNKNOWN,
    timeout: Number(input.timeout || 8000),
    retryPolicy: input.retryPolicy || { max: 1, backoffMs: 400 },
    idempotent: input.idempotent ?? (input.sideEffect === SIDE_EFFECT.READ_ONLY),
    health: input.health || TOOL_HEALTH.UNVERIFIED,
    enabled: input.enabled !== false,
    policyState: input.policyState || POLICY_STATE.DISCOVERED,
    discoveredAt: input.discoveredAt || now,
    updatedAt: now,
    classificationReason: input.classificationReason || null,
    annotations: null
  };
}
