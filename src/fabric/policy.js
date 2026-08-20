/**
 * Policy layer between discovery and planner availability.
 * Dynamic tools cannot rewrite their own classification.
 */

import { SIDE_EFFECT } from '../objective/catalogue.js';
import { POLICY_STATE, TOOL_HEALTH } from './descriptor.js';

export function applyPolicy(descriptor, { operatorState } = {}) {
  if (operatorState === POLICY_STATE.DISABLED || descriptor.enabled === false) {
    return { ...descriptor, policyState: POLICY_STATE.DISABLED, enabled: false, health: TOOL_HEALTH.DISABLED };
  }
  if (descriptor.health === TOOL_HEALTH.UNAVAILABLE) {
    return { ...descriptor, policyState: POLICY_STATE.UNHEALTHY };
  }
  if (!descriptor.inputSchema || typeof descriptor.inputSchema !== 'object') {
    return { ...descriptor, policyState: POLICY_STATE.QUARANTINED, classificationReason: 'invalid input schema' };
  }

  const side = descriptor.sideEffect;
  if (side === SIDE_EFFECT.DESTRUCTIVE || side === SIDE_EFFECT.FINANCIAL) {
    return {
      ...descriptor,
      policyState: POLICY_STATE.QUARANTINED,
      approvalRequired: true,
      classificationReason: descriptor.classificationReason || 'destructive/financial tools never auto-approve'
    };
  }
  if (side === SIDE_EFFECT.EXTERNAL_SIDE_EFFECT || side === SIDE_EFFECT.LOW_RISK_WRITE) {
    return {
      ...descriptor,
      policyState: POLICY_STATE.QUARANTINED,
      approvalRequired: true,
      classificationReason: descriptor.classificationReason || 'write/outbound tools stay quarantined until approved'
    };
  }
  if (side === SIDE_EFFECT.READ_ONLY && descriptor.approvalRequired !== true) {
    return {
      ...descriptor,
      policyState: POLICY_STATE.APPROVED,
      approvalRequired: false,
      health: descriptor.health === TOOL_HEALTH.UNVERIFIED ? TOOL_HEALTH.HEALTHY : descriptor.health
    };
  }
  return { ...descriptor, policyState: POLICY_STATE.QUARANTINED, approvalRequired: true };
}

export function isPlannerVisible(descriptor) {
  return descriptor?.policyState === POLICY_STATE.APPROVED
    && descriptor.enabled !== false
    && descriptor.health !== TOOL_HEALTH.UNAVAILABLE
    && descriptor.health !== TOOL_HEALTH.DISABLED;
}

export function operatorApprove(descriptor) {
  if (descriptor.sideEffect === SIDE_EFFECT.DESTRUCTIVE || descriptor.sideEffect === SIDE_EFFECT.FINANCIAL) {
    return { ...descriptor, policyState: POLICY_STATE.QUARANTINED, approvalRequired: true };
  }
  return { ...descriptor, policyState: POLICY_STATE.APPROVED, enabled: true };
}

export function operatorDisable(descriptor) {
  return { ...descriptor, policyState: POLICY_STATE.DISABLED, enabled: false, health: TOOL_HEALTH.DISABLED };
}
