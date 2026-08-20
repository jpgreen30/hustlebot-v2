/**
 * Canonical specialist / worker model. Specialists are bounded children of a
 * MacGyver objective — never independent principals.
 */

import { randomUUID } from 'node:crypto';
import { TASK_CLASS } from '../llm/router.js';
import { isOutboundCapability, OUTBOUND_CAPABILITIES } from './catalogue.js';

export const SPECIALIST_STATUS = {
  CREATED: 'CREATED',
  READY: 'READY',
  RUNNING: 'RUNNING',
  WAITING: 'WAITING',
  COMPLETED: 'COMPLETED',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  TIMED_OUT: 'TIMED_OUT'
};

export const ALWAYS_PROHIBITED = [
  ...OUTBOUND_CAPABILITIES,
  'payment.checkout',
  'admin.wipe_database',
  'mcp.hustlebot-local.admin.wipe_database',
  'mcp.hustlebot-local.outbound.blast_email',
  'n8n:campaign-orchestrate'
];

export const ROLE_SPEC = {
  scout: {
    taskClass: TASK_CLASS.EXTRACTION,
    capabilities: ['org.discover', 'web.search', 'web.scrape', 'web.crawl']
  },
  researcher: {
    taskClass: TASK_CLASS.EXTRACTION,
    capabilities: ['company.research', 'company.research.batch', 'web.scrape', 'web.search']
  },
  'contact-researcher': {
    taskClass: TASK_CLASS.EXTRACTION,
    capabilities: ['contact.discover', 'contact.discover.batch']
  },
  analyst: {
    taskClass: TASK_CLASS.REASONING,
    capabilities: ['prospect.qualify', 'prospect.score']
  },
  comparator: {
    taskClass: TASK_CLASS.SUMMARIZATION,
    capabilities: ['objective.report']
  },
  critic: {
    taskClass: TASK_CLASS.REASONING,
    capabilities: []
  },
  synthesizer: {
    taskClass: TASK_CLASS.SUMMARIZATION,
    capabilities: ['objective.report']
  },
  repair: {
    taskClass: TASK_CLASS.EXTRACTION,
    capabilities: ['org.discover', 'company.research', 'company.research.batch', 'web.search']
  }
};

export function newSpecialistId() {
  return `spc_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

export function newTaskId() {
  return `tsk_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

export function inheritConstraints(parent = {}, extraProhibited = []) {
  const constraints = [...new Set([...(parent.constraints || [])])];
  const prohibited = [...new Set([
    ...(parent.prohibitedCapabilities || []),
    ...ALWAYS_PROHIBITED,
    ...extraProhibited
  ])];
  return { constraints, prohibitedCapabilities: prohibited };
}

export function grantForRole(role, catalogue = [], parent = {}) {
  const spec = ROLE_SPEC[role] || ROLE_SPEC.scout;
  const inherited = inheritConstraints(parent);
  const available = new Set(catalogue.filter((c) => c.available !== false).map((c) => c.capabilityId));
  const allowed = spec.capabilities.filter((id) => available.has(id) && !inherited.prohibitedCapabilities.includes(id) && !isOutboundCapability(id));
  for (const cap of catalogue) {
    if (cap.available === false) continue;
    if (/^mcp\..+\.public\.(time|ping|compare)$/.test(cap.capabilityId) && (role === 'scout' || role === 'comparator' || role === 'synthesizer')) {
      if (!inherited.prohibitedCapabilities.includes(cap.capabilityId)) allowed.push(cap.capabilityId);
    }
  }
  return {
    allowedCapabilities: [...new Set(allowed)],
    prohibitedCapabilities: inherited.prohibitedCapabilities,
    constraints: inherited.constraints,
    taskClass: spec.taskClass
  };
}

export function isGranted(specialist, capabilityId) {
  const allowed = specialist?.allowedCapabilities || [];
  if (allowed.includes(capabilityId)) return true;
  return allowed.some((grant) => grant.endsWith('.*') && capabilityId.startsWith(grant.slice(0, -1)));
}

export function createSpecialist({
  objective,
  catalogue = [],
  role = 'scout',
  mission,
  slice = null,
  dependsOn = [],
  scope = {},
  budget = {},
  deadline = null
} = {}) {
  const grant = grantForRole(role, catalogue, objective);
  const now = new Date().toISOString();
  const specialistId = newSpecialistId();
  const taskId = newTaskId();
  return {
    specialistId,
    objectiveId: objective?.objectiveId || null,
    parentPlanId: objective?.planId || objective?.plan?.planId || null,
    role,
    mission: mission || `${role} task`,
    slice,
    scope: {
      location: objective?.context?.location || null,
      industry: slice || objective?.context?.industry || null,
      findN: scope.findN || objective?.context?.findN || 5,
      ...scope
    },
    inputRefs: dependsOn.slice(),
    allowedCapabilities: grant.allowedCapabilities,
    prohibitedCapabilities: grant.prohibitedCapabilities,
    constraints: grant.constraints,
    modelTaskClass: grant.taskClass,
    modelSelected: null,
    modelPreferred: null,
    modelFallback: false,
    budget: { maxActions: budget.maxActions || 6, maxCost: budget.maxCost ?? 0.2, ...budget },
    maxActions: budget.maxActions || 6,
    deadline,
    status: SPECIALIST_STATUS.CREATED,
    createdAt: now,
    startedAt: null,
    completedAt: null,
    resultRef: null,
    confidence: null,
    task: {
      taskId,
      parentObjectiveId: objective?.objectiveId || null,
      goal: mission || `${role} task`,
      successCriteria: objective?.successCriteria || [],
      inputs: {},
      expectedOutputSchema: {
        type: 'object',
        required: ['status', 'findings'],
        properties: {
          status: { type: 'string' },
          findings: { type: 'array' },
          evidence: { type: 'array' },
          sourceRefs: { type: 'array' },
          confidence: { type: 'number' },
          unknowns: { type: 'array' },
          errors: { type: 'array' },
          recommendations: { type: 'array' }
        }
      },
      allowedCapabilities: grant.allowedCapabilities,
      prohibitedCapabilities: grant.prohibitedCapabilities,
      constraints: grant.constraints,
      maxActions: budget.maxActions || 6,
      maxCost: budget.maxCost ?? 0.2,
      timeout: budget.timeout || 40000,
      dependencies: dependsOn.slice()
    },
    executions: [],
    result: null,
    error: null
  };
}

export function validateSpecialistResult(result = {}) {
  const errors = [];
  if (!result || typeof result !== 'object') return { ok: false, errors: ['result is not an object'] };
  if (!result.status) errors.push('missing status');
  if (!Array.isArray(result.findings)) errors.push('findings must be an array');
  const claims = [...(result.findings || []), ...(result.recommendations || [])];
  for (const item of claims) {
    if (item && typeof item === 'object' && item.claim && !item.evidence && !item.source && !item.website && !item.sourceRefs) {
      errors.push(`unsupported claim without evidence: ${String(item.claim).slice(0, 80)}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function emptyResult(status = 'failed', extra = {}) {
  return {
    status,
    findings: [],
    evidence: [],
    sourceRefs: [],
    confidence: 0,
    unknowns: extra.unknowns || [],
    errors: extra.errors || [],
    recommendations: extra.recommendations || [],
    ...extra
  };
}
