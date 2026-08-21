import { OBSERVATION } from './observer.js';
import { pickCapability } from './catalogue.js';
import { newPlanId } from './schema.js';

export function recoveryAction(node, observation, { catalogue = [], retries = 0, maxProviderRetries = 2 } = {}) {
  if (!observation) return { action: 'none' };
  if (observation.status === OBSERVATION.SUCCESS) return { action: 'none' };
  if (observation.status === OBSERVATION.BLOCKED) return { action: 'stop', reason: observation.reason };
  if (observation.status === OBSERVATION.PARTIAL && node.capabilityId?.startsWith('contact.discover')) {
    const alreadyApollo = String(node.provider || '').toLowerCase() === 'apollo'
      || /apollo/i.test(String(node.reasonSelected || ''));
    if (!alreadyApollo) {
      const cap = catalogue.find((c) => c.capabilityId === node.capabilityId);
      const apollo = (cap?.providers || []).find((p) => /apollo/i.test(p.provider) && p.available);
      if (apollo) {
        return {
          action: 'alternate-provider',
          provider: apollo.provider,
          reason: 'public-web contact discovery returned zero named people; Apollo is available on the same capability'
        };
      }
    }
    return { action: 'accept-partial', reason: observation.reason };
  }
  if (observation.status === OBSERVATION.PARTIAL) {
    return { action: 'accept-partial', reason: observation.reason };
  }
  if (retries < maxProviderRetries && (observation.status === OBSERVATION.RETRYABLE_FAILURE || observation.status === OBSERVATION.PROVIDER_FAILURE)) {
    const cap = catalogue.find((c) => c.capabilityId === node.capabilityId);
    const next = (cap?.providers || []).find((p) => p.available && p.provider !== node.provider);
    if (next) {
      return {
        action: 'switch-provider',
        provider: next.provider,
        reason: `${node.provider || 'preferred provider'} failed; ${next.provider} is available`
      };
    }
    if (node.capabilityId === 'org.discover') {
      if (retries < maxProviderRetries) {
        return { action: 'retry', reason: observation.reason };
      }
      return { action: 'fail', reason: observation.reason };
    }
    if (node.capabilityId === 'web.scrape') {
      const alt = pickCapability(catalogue, ['web.search', 'org.discover']);
      if (alt && alt !== node.capabilityId) {
        return { action: 'alternate-capability', capabilityId: alt, reason: `${node.capabilityId} failed; ${alt} is available` };
      }
    }
    return { action: 'retry', reason: observation.reason };
  }
  return { action: 'fail', reason: observation.reason };
}

export function applyReplan(plan, changes = {}) {
  const originalClass = plan.objectiveClass || plan.pattern || null;
  const requestedClass = changes.objectiveClass || originalClass;
  if (originalClass && requestedClass && originalClass !== requestedClass && changes.strongClassEvidence !== true) {
    changes = { ...changes, objectiveClass: originalClass, classChangeRefused: true };
  }
  const next = {
    ...plan,
    planId: plan.planId,
    version: Number(plan.version || 1) + 1,
    revisionId: newPlanId(),
    revisedAt: new Date().toISOString(),
    revisionReason: changes.reason || 'recovery',
    objectiveClass: changes.objectiveClass || originalClass,
    repairSafety: {
      originalPlaybook: originalClass,
      repairPlaybook: changes.objectiveClass || originalClass,
      reason: changes.reason || 'recovery',
      classChangeRefused: changes.classChangeRefused === true
    },
    nodes: (plan.nodes || []).map((node) => {
      if (changes.nodeId && node.id !== changes.nodeId) return node;
      return {
        ...node,
        capabilityId: changes.capabilityId || node.capabilityId,
        provider: changes.provider || node.provider,
        reasonSelected: changes.reason || node.reasonSelected,
        retries: (node.retries || 0) + (changes.bumpRetry ? 1 : 0)
      };
    })
  };
  return next;
}
