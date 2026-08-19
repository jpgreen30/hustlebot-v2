/**
 * Deterministic campaign orchestration.
 * HustleBot owns policy. n8n records the workflow step.
 * Discovered prospects are never selected for live send.
 */

import { setProspectOutreachState, transitionCampaign } from './campaign.js';

export class CampaignOrchestrator {
  constructor({ engine, executor, suppression, n8n, events } = {}) {
    this.engine = engine;
    this.executor = executor;
    this.suppression = suppression;
    this.n8n = n8n;
    this.events = events;
  }

  isAvailable() {
    return Boolean(this.engine && this.executor);
  }

  selectNext(campaign) {
    return (campaign.prospects || []).find((p) => ['READY', 'QUEUED', 'NOT_CONTACTED'].includes(p.outreachState || 'NOT_CONTACTED')) || null;
  }

  chooseChannel(prospect) {
    const plan = prospect.outreachPlan?.channelPriority || [];
    if (plan.includes('retell') && (prospect.contact?.phone || prospect.contacts?.[0]?.phone)) return 'retell';
    if (plan.includes('email') && (prospect.contact?.email || prospect.contacts?.[0]?.email)) return 'email';
    return null;
  }

  async run(input = {}) {
    const campaign = this.engine.getCampaign(input.campaignId || 'latest');
    if (!campaign) return { status: 'failed', error: 'campaign not found' };

    const wf = this.n8n?.execute
      ? await this.n8n.execute(input.workflowAlias || 'campaign-orchestrate', {
        campaignId: campaign.campaignId,
        approvalId: input.approvalId || campaign.approval?.id,
        step: 'orchestrate'
      })
      : { status: 'skipped' };

    if (campaign.kind !== 'authorized-test') {
      this.events?.record('outreach.blocked', {
        campaignId: campaign.campaignId,
        reason: 'discovered prospects cannot be contacted'
      });
      return {
        status: 'prepared-only',
        executed: false,
        workflowExecutionId: wf.executionId || wf.providerExecutionId || null,
        discoveredProspectsContacted: 0,
        report: 'Orchestration recorded. Discovered prospects were not contacted.'
      };
    }

    return this.executor.execute({
      ...input,
      campaignId: campaign.campaignId,
      approvalId: input.approvalId || campaign.approval?.id,
      authorizedTest: true,
      workflowAlias: input.workflowAlias || 'campaign-orchestrate'
    });
  }

  applyProviderEvent(campaignId, mapped, context = {}) {
    const campaign = this.engine?.getCampaign?.(campaignId);
    if (!campaign) return { status: 'failed', error: 'campaign not found' };
    const prospectId = context.prospectId;
    const nextProspects = (campaign.prospects || []).map((prospect) => {
      if (prospectId && prospect.prospectId !== prospectId) return prospect;
      let state = prospect.outreachState || 'CONTACTED';
      if (mapped.normalizedStatus === 'failed' || mapped.eventType === 'email.bounced') state = 'INVALID_CONTACT';
      else if (mapped.eventType === 'email.replied' || mapped.normalizedStatus === 'completed') state = 'RESPONDED';
      else if (['sent', 'queued', 'registered', 'ongoing'].includes(mapped.normalizedStatus)) state = 'CONTACTED';
      return setProspectOutreachState(prospect, state, mapped);
    });
    let next = { ...campaign, prospects: nextProspects };
    const remaining = nextProspects.some((p) => ['READY', 'QUEUED'].includes(p.outreachState));
    if (!remaining && next.lifecycle === 'RUNNING') {
      next = transitionCampaign(next, 'COMPLETED', 'all prospects terminal');
    }
    this.engine.persistCampaign(next);
    this.events?.record(
      mapped.eventType.startsWith('email.') ? (mapped.eventType === 'email.replied' ? 'email.replied' : 'email.sent') : 'call.outcome',
      { campaignId, ...context, eventType: mapped.eventType }
    );
    return { status: 'ok', campaign: next };
  }
}
