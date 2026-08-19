/**
 * Campaign and prospect outreach state machines.
 * PENDING_APPROVAL never becomes RUNNING without a valid approval.
 */

export const CAMPAIGN_STATES = [
  'DRAFT',
  'PREPARED',
  'PENDING_APPROVAL',
  'APPROVED',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
  'FAILED'
];

export const PROSPECT_OUTREACH_STATES = [
  'NOT_CONTACTED',
  'READY',
  'SUPPRESSED',
  'QUEUED',
  'CONTACTED',
  'RESPONDED',
  'INTERESTED',
  'NOT_INTERESTED',
  'NO_RESPONSE',
  'INVALID_CONTACT'
];

const CAMPAIGN_TRANSITIONS = {
  DRAFT: ['PREPARED', 'CANCELLED'],
  PREPARED: ['PENDING_APPROVAL', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'CANCELLED', 'FAILED'],
  APPROVED: ['RUNNING', 'PAUSED', 'CANCELLED'],
  RUNNING: ['PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED'],
  PAUSED: ['RUNNING', 'CANCELLED', 'COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  FAILED: ['DRAFT']
};

export function canTransition(from, to) {
  return (CAMPAIGN_TRANSITIONS[from] || []).includes(to);
}

export function transitionCampaign(campaign, to, reason = null) {
  const from = campaign.lifecycle || campaign.status || 'DRAFT';
  const current = normalizeCampaignState(from);
  if (current === to) return { ...campaign, lifecycle: to };
  if (!canTransition(current, to)) {
    const error = current === 'PENDING_APPROVAL' && to === 'RUNNING'
      ? 'Cannot start a campaign that is still pending approval'
      : `Illegal campaign transition ${current} → ${to}`;
    return { ...campaign, lastTransitionError: error };
  }
  if (to === 'RUNNING' && current === 'PENDING_APPROVAL') {
    return { ...campaign, lastTransitionError: 'Cannot start a campaign that is still pending approval' };
  }
  return {
    ...campaign,
    lifecycle: to,
    status: to.toLowerCase(),
    lastTransition: { from: current, to, reason, at: new Date().toISOString() }
  };
}

export function normalizeCampaignState(value) {
  const raw = String(value || 'DRAFT').toUpperCase().replace(/-/g, '_');
  if (raw === 'PREPARED-ONLY' || raw === 'PREPARED_ONLY') return 'PREPARED';
  if (raw === 'PENDING') return 'PENDING_APPROVAL';
  return CAMPAIGN_STATES.includes(raw) ? raw : 'DRAFT';
}

export function setProspectOutreachState(prospect, state, event = null) {
  if (!PROSPECT_OUTREACH_STATES.includes(state)) {
    throw new Error(`Unknown prospect outreach state: ${state}`);
  }
  const events = [...(prospect.outreachEvents || [])];
  if (event) events.push({ ...event, at: event.at || new Date().toISOString() });
  return {
    ...prospect,
    outreachState: state,
    outreachEvents: events
  };
}

export function applyApprovalToCampaign(campaign) {
  const approvalStatus = campaign.approval?.status;
  let next = campaign;
  if (normalizeCampaignState(next.lifecycle || next.status) === 'DRAFT') {
    next = transitionCampaign(next, 'PREPARED', 'prepared');
  }
  if (approvalStatus === 'approved') {
    if (normalizeCampaignState(next.lifecycle) === 'PREPARED') {
      next = transitionCampaign(next, 'PENDING_APPROVAL', 'approval.requested');
    }
    return transitionCampaign(next, 'APPROVED', 'approval.approved');
  }
  if (approvalStatus === 'rejected') return transitionCampaign(next, 'CANCELLED', 'approval.rejected');
  if (approvalStatus === 'pending') {
    if (normalizeCampaignState(next.lifecycle) === 'PREPARED') {
      return transitionCampaign(next, 'PENDING_APPROVAL', 'approval.requested');
    }
    return next;
  }
  return next;
}
