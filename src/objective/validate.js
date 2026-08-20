import { isOutboundCapability } from './catalogue.js';

export function validatePlan(plan, { catalogue = [], objective = {}, registry = null } = {}) {
  const errors = [];
  const nodes = plan?.nodes || [];
  const ids = new Set();
  const available = new Set(catalogue.filter((c) => c.available !== false).map((c) => c.capabilityId));
  const prohibited = new Set(objective.prohibitedCapabilities || []);
  const doNotContact = (objective.constraints || []).includes('do-not-contact');

  if (!nodes.length) errors.push('plan has no nodes');
  if (nodes.length > (objective.maxActions || 24)) {
    errors.push(`node count ${nodes.length} exceeds maxActions ${objective.maxActions}`);
  }

  for (const node of nodes) {
    if (!node.id) errors.push('node missing id');
    if (ids.has(node.id)) errors.push(`duplicate node id ${node.id}`);
    ids.add(node.id);
    if (!node.capabilityId) errors.push(`node ${node.id} missing capabilityId`);
    if (node.capabilityId && !available.has(node.capabilityId) && !registry?.has?.(node.capabilityId)) {
      errors.push(`node ${node.id} uses unknown or unavailable capability ${node.capabilityId}`);
    }
    if (prohibited.has(node.capabilityId)) {
      errors.push(`node ${node.id} uses prohibited capability ${node.capabilityId}`);
    }
    if (doNotContact && isOutboundCapability(node.capabilityId)) {
      errors.push(`node ${node.id} introduces outbound ${node.capabilityId} despite do-not-contact`);
    }
    if (objective.context?.megaCapabilityForbidden !== false && node.capabilityId === 'campaign.prepare') {
      errors.push('plan routed to campaign.prepare which is forbidden for MacGyver research objectives');
    }
    for (const dep of node.dependsOn || []) {
      if (!nodes.some((n) => n.id === dep)) errors.push(`node ${node.id} depends on missing ${dep}`);
    }
  }

  const visiting = new Set();
  const seen = new Set();
  const visit = (id, stack) => {
    if (visiting.has(id)) {
      errors.push(`cycle ${[...stack, id].join(' → ')}`);
      return;
    }
    if (seen.has(id)) return;
    visiting.add(id);
    const node = nodes.find((n) => n.id === id);
    for (const dep of node?.dependsOn || []) visit(dep, [...stack, id]);
    visiting.delete(id);
    seen.add(id);
  };
  for (const node of nodes) visit(node.id, []);

  const approvals = nodes
    .filter((n) => n.approvalState === 'required' || isOutboundCapability(n.capabilityId))
    .map((n) => ({ nodeId: n.id, capabilityId: n.capabilityId }));

  return {
    ok: errors.length === 0,
    errors,
    approvals,
    outboundNodes: nodes.filter((n) => isOutboundCapability(n.capabilityId)).map((n) => n.capabilityId)
  };
}
