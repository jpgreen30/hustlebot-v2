/**
 * Represent designated n8n workflows as normalized capabilities.
 * Not every workflow is executable — only aliases HustleBot already owns.
 */

import { SIDE_EFFECT } from '../objective/catalogue.js';
import { COST_CLASS, SOURCE_TYPE, TOOL_HEALTH, createToolDescriptor } from './descriptor.js';
import { POLICY_STATE } from './descriptor.js';
import { applyPolicy } from './policy.js';

const DESIGNATED = {
  'campaign-prepare': {
    description: 'Record a campaign-prepare workflow run. Does not contact anyone.',
    sideEffect: SIDE_EFFECT.LOW_RISK_WRITE,
    approvalRequired: false,
    tags: ['n8n', 'campaign', 'record']
  },
  'campaign-orchestrate': {
    description: 'Record campaign orchestration in n8n. Does not send outreach by itself.',
    sideEffect: SIDE_EFFECT.LOW_RISK_WRITE,
    approvalRequired: true,
    tags: ['n8n', 'campaign']
  },
  'acquisition-test': {
    description: 'Record an acquisition-test workflow run.',
    sideEffect: SIDE_EFFECT.LOW_RISK_WRITE,
    approvalRequired: false,
    tags: ['n8n', 'acquisition']
  },
  test: {
    description: 'Day-1 n8n test webhook.',
    sideEffect: SIDE_EFFECT.LOW_RISK_WRITE,
    approvalRequired: false,
    tags: ['n8n', 'test']
  }
};

export function discoverN8nWorkflows(n8n) {
  const aliases = n8n?.workflows instanceof Map
    ? [...n8n.workflows.keys()]
    : Object.keys(n8n?.workflows || {});
  const allowed = aliases.filter((alias) => DESIGNATED[alias]);
  return allowed.map((alias) => {
    const spec = DESIGNATED[alias];
    const descriptor = createToolDescriptor({
      toolId: `n8n:${alias}`,
      sourceType: SOURCE_TYPE.N8N,
      sourceId: alias,
      name: `n8n ${alias}`,
      description: spec.description,
      inputSchema: {
        type: 'object',
        properties: {
          objectiveId: { type: 'string' },
          payload: { type: 'object' }
        }
      },
      tags: spec.tags,
      provider: 'n8n',
      sideEffect: spec.sideEffect,
      approvalRequired: spec.approvalRequired,
      costClass: COST_CLASS.NEGLIGIBLE,
      timeout: 20000,
      health: n8n?.isReady?.() ? TOOL_HEALTH.HEALTHY : TOOL_HEALTH.UNVERIFIED
    });
    const applied = applyPolicy(descriptor);
    if (spec.sideEffect === SIDE_EFFECT.LOW_RISK_WRITE && !spec.approvalRequired) {
      return { ...applied, policyState: POLICY_STATE.APPROVED, approvalRequired: false };
    }
    return applied;
  });
}
