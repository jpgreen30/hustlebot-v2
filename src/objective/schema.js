import { randomUUID } from 'node:crypto';

export const OBJECTIVE_STATUS = {
  DRAFT: 'draft',
  PLANNED: 'planned',
  VALIDATED: 'validated',
  RUNNING: 'running',
  AWAITING_APPROVAL: 'awaiting_approval',
  REPLANNED: 'replanned',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  PAUSED: 'paused',
  BLOCKED: 'blocked'
};

export function newObjectiveId() {
  return `obj_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function newPlanId() {
  return `plan_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function createObjective(input = {}) {
  const rawRequest = String(input.rawRequest || input.objective || '').trim();
  return {
    objectiveId: input.objectiveId || newObjectiveId(),
    rawRequest,
    interpretedGoal: input.interpretedGoal || rawRequest,
    successCriteria: input.successCriteria || [],
    constraints: input.constraints || [],
    exclusions: input.exclusions || [],
    budget: input.budget ?? null,
    deadline: input.deadline || null,
    maxActions: Number(input.maxActions || 24),
    maxReplans: Number(input.maxReplans || 3),
    maxProviderRetries: Number(input.maxProviderRetries || 2),
    allowedCapabilities: input.allowedCapabilities || null,
    prohibitedCapabilities: input.prohibitedCapabilities || [],
    approvalPolicy: input.approvalPolicy || 'side-effect',
    context: input.context || {},
    status: input.status || OBJECTIVE_STATUS.DRAFT,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    actor: input.actor || 'system',
    contacted: false
  };
}

export function compactObjective(objective) {
  if (!objective) return null;
  return {
    objectiveId: objective.objectiveId,
    status: objective.status,
    interpretedGoal: objective.interpretedGoal,
    rawRequest: objective.rawRequest,
    planId: objective.planId || objective.plan?.planId || null,
    planVersion: objective.plan?.version || 1,
    prospects: objective.result?.top?.length || objective.result?.prospects?.length || 0,
    contacted: objective.contacted === true,
    error: objective.error || null,
    updatedAt: objective.updatedAt
  };
}
