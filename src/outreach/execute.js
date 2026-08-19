/**
 * Outreach execution. Fail closed without ApprovalGate approval.
 * Discovered prospects are never contacted from this path.
 * Only authorized-test destinations may be executed.
 */

import { randomUUID } from 'node:crypto';
import logger from '../utils/logger.js';
import { mapEmailEvent, mapRetellEvent, toStoredEvent } from './outcomes.js';
import { setProspectOutreachState, transitionCampaign } from './campaign.js';

export class OutreachExecutor {
  constructor({
    approvalGate,
    retell,
    email,
    events,
    suppression,
    engine,
    n8n
  } = {}) {
    this.approvalGate = approvalGate;
    this.retell = retell;
    this.email = email;
    this.events = events;
    this.suppression = suppression;
    this.engine = engine;
    this.n8n = n8n;
  }

  isAvailable() {
    return Boolean(this.approvalGate);
  }

  async assertApproved(approvalId) {
    if (!approvalId) {
      return { allowed: false, status: 'blocked', error: 'approval required' };
    }
    if (!this.approvalGate) {
      return { allowed: false, status: 'blocked', error: 'ApprovalGate not initialized' };
    }
    const record = await this.approvalGate.get(approvalId);
    if (!record) {
      return { allowed: false, status: 'blocked', error: `unknown approval ${approvalId}` };
    }
    if (record.status !== 'approved') {
      return {
        allowed: false,
        status: 'blocked',
        error: `approval is ${record.status}`,
        approvalId,
        approvalStatus: record.status
      };
    }
    return { allowed: true, approval: record };
  }

  isAuthorizedTestCampaign(campaign, input = {}) {
    if (input.authorizedTest === true || input.kind === 'authorized-test') return true;
    if (campaign?.kind === 'authorized-test') return true;
    return false;
  }

  destinationAllowlisted(campaign, destination, channel) {
    if (!destination) return false;
    const allow = campaign?.allowlist || {};
    const list = channel === 'email' ? (allow.emails || []) : (allow.phones || []);
    const needle = String(destination).trim().toLowerCase();
    if (list.map((v) => String(v).trim().toLowerCase()).includes(needle)) return true;
    if (channel === 'email') {
      const configured = process.env.OUTREACH_TEST_EMAIL || process.env.EMAIL_TEST_DESTINATION;
      return configured && String(configured).trim().toLowerCase() === needle;
    }
    const testPhone = process.env.RETELL_TEST_NUMBER;
    return testPhone && String(testPhone).replace(/\D/g, '') === String(destination).replace(/\D/g, '');
  }

  async execute(input = {}) {
    const gate = await this.assertApproved(input.approvalId);
    if (!gate.allowed) {
      logger.warn(`Outreach execute blocked: ${gate.error}`);
      return gate;
    }

    if (input.contactDiscoveredProspects === true && !this.isAuthorizedTestCampaign(null, input)) {
      return {
        allowed: false,
        status: 'blocked',
        error: 'contacting discovered prospects is not authorized on Day-3',
        approvalId: input.approvalId
      };
    }

    const campaign = this.engine?.getCampaign?.(input.campaignId) || null;
    if (this.isAuthorizedTestCampaign(campaign, input)) {
      return this.executeAuthorizedTest({ ...input, campaign, approval: gate.approval });
    }

    this.events?.record('outreach.started', {
      campaignId: input.campaignId || campaign?.campaignId || null,
      approvalId: input.approvalId,
      actor: input.actor || 'system'
    });

    return {
      status: 'prepared-only',
      success: true,
      executed: false,
      reason: 'Day-3 execution architecture is ready and gated. No discovered prospect was contacted.',
      approvalId: input.approvalId,
      campaignId: input.campaignId || campaign?.campaignId || null,
      discoveredProspectsContacted: 0
    };
  }

  async executeAuthorizedTest(input = {}) {
    const campaign = input.campaign || this.engine?.getCampaign?.(input.campaignId);
    if (!campaign) {
      return { status: 'failed', error: 'authorized test campaign not found', executed: false };
    }
    if (campaign.lifecycle === 'PENDING_APPROVAL') {
      return { allowed: false, status: 'blocked', error: 'Cannot start a campaign that is still pending approval' };
    }

    const pause = this.suppression?.check({ campaignId: campaign.campaignId });
    if (pause && pause.allowed === false && pause.code !== 'DUPLICATE') {
      return { allowed: false, status: 'blocked', error: pause.reason, code: pause.code };
    }

    let next = transitionCampaign(campaign, 'APPROVED', 'approval.approved');
    next = transitionCampaign(next, 'RUNNING', 'authorized-test.start');
    this.engine?.persistCampaign?.(next);

    this.events?.record('outreach.started', {
      campaignId: next.campaignId,
      approvalId: input.approvalId,
      kind: 'authorized-test'
    });

    const orchestration = this.n8n?.execute
      ? await this.n8n.execute(input.workflowAlias || 'campaign-orchestrate', {
        campaignId: next.campaignId,
        approvalId: input.approvalId,
        kind: 'authorized-test',
        step: 'select-next-prospect'
      })
      : { status: 'skipped', alias: 'campaign-orchestrate' };

    const actions = [];
    const prospect = next.prospects?.[0];
    const contact = prospect?.contacts?.[0] || prospect?.contact || {};
    const executionId = `exe_${randomUUID().replace(/-/g, '').slice(0, 10)}`;

    if (contact.phone || input.phoneNumber) {
      actions.push(await this.callAuthorizedTest({
        ...input,
        phoneNumber: input.phoneNumber || contact.phone,
        script: input.script || prospect?.outreachPlan?.suggestedCallObjective || 'HustleBot authorized production self-test.',
        campaignId: next.campaignId,
        prospectId: prospect?.prospectId,
        contactId: contact.personId,
        executionId,
        name: contact.fullName || 'Authorized test',
        purpose: 'Day-4 authorized self-test'
      }));
    }

    if ((contact.email || input.email || input.to) && this.email?.send) {
      actions.push(await this.sendAuthorizedEmail({
        ...input,
        to: input.to || input.email || contact.email,
        subject: input.subject || 'HustleBot Production Test',
        body: input.body || 'This is a HustleBot controlled outreach production test.',
        campaignId: next.campaignId,
        prospectId: prospect?.prospectId,
        contactId: contact.personId,
        executionId
      }));
    }

    const executed = actions.some((a) => a && ['sent', 'ok', 'queued', 'registered'].includes(a.status));
    next = {
      ...next,
      contacted: executed,
      lastActions: actions,
      workflow: {
        ...(next.workflow || {}),
        orchestration
      }
    };
    if (prospect) {
      next.prospects = next.prospects.map((p, idx) => (
        idx === 0 ? setProspectOutreachState(p, executed ? 'CONTACTED' : p.outreachState || 'READY', actions[0]) : p
      ));
    }
    next = transitionCampaign(next, executed ? 'COMPLETED' : 'FAILED', 'authorized-test.finished');
    this.engine?.persistCampaign?.(next);

    return {
      status: executed ? 'executed' : 'failed',
      success: executed,
      executed,
      kind: 'authorized-test',
      campaignId: next.campaignId,
      approvalId: input.approvalId,
      executionId,
      workflowExecutionId: orchestration.executionId || orchestration.providerExecutionId || null,
      actions,
      discoveredProspectsContacted: 0,
      report: executed
        ? `Authorized test executed. Discovered prospects contacted: 0.`
        : `Authorized test did not complete: ${actions.map((a) => a?.error).filter(Boolean).join('; ') || 'no action ran'}`
    };
  }

  async sendAuthorizedEmail(input = {}) {
    const to = String(input.to || '').trim();
    const campaign = this.engine?.getCampaign?.(input.campaignId);
    if (!this.destinationAllowlisted(campaign, to, 'email')) {
      return {
        status: 'blocked',
        error: 'email destination is not on the authorized test allowlist',
        fabricated: false
      };
    }
    const suppression = this.suppression?.check({
      campaignId: input.campaignId,
      contactId: input.contactId,
      channel: 'email',
      destination: to
    });
    if (suppression && !suppression.allowed) {
      return { status: 'blocked', error: suppression.reason, code: suppression.code };
    }
    if (!this.email?.send) {
      return { status: 'unavailable', error: 'EMAIL OUTREACH: UNAVAILABLE', fabricated: false };
    }
    const result = await this.email.send({
      to,
      subject: input.subject,
      body: input.body,
      campaignId: input.campaignId,
      prospectId: input.prospectId,
      contactId: input.contactId,
      executionId: input.executionId
    });
    if (result.status === 'sent' || result.status === 'queued') {
      this.suppression?.recordSend({
        campaignId: input.campaignId,
        contactId: input.contactId,
        channel: 'email',
        destination: to
      }, result);
      const mapped = mapEmailEvent(result);
      this.events?.record(mapped.eventType === 'email.queued' ? 'email.queued' : 'email.sent', toStoredEvent(mapped, input));
    }
    return result;
  }

  async sendEmail(input = {}) {
    const gate = await this.assertApproved(input.approvalId);
    if (!gate.allowed) return gate;
    if (input.contactDiscoveredProspects === true) {
      return {
        allowed: false,
        status: 'blocked',
        error: 'contacting discovered prospects is not authorized on Day-3'
      };
    }
    return this.sendAuthorizedEmail(input);
  }

  async callAuthorizedTest(input = {}) {
    const gate = await this.assertApproved(input.approvalId);
    if (!gate.allowed) return gate;
    if (!this.retell?.makeOutboundCall) {
      return { status: 'unavailable', error: 'Retell not configured' };
    }
    const campaign = this.engine?.getCampaign?.(input.campaignId);
    const phone = input.phoneNumber;
    if (campaign && !this.destinationAllowlisted(campaign, phone, 'phone') && campaign.kind === 'authorized-test') {
      return { status: 'blocked', error: 'phone destination is not on the authorized test allowlist' };
    }
    const suppression = this.suppression?.check({
      campaignId: input.campaignId,
      contactId: input.contactId,
      channel: 'retell',
      destination: phone
    });
    if (suppression && !suppression.allowed) {
      return { status: 'blocked', error: suppression.reason, code: suppression.code };
    }
    const result = await this.retell.makeOutboundCall({
      phoneNumber: phone,
      script: input.script,
      name: input.name || 'Authorized test',
      purpose: input.purpose || 'Day-4 authorized self-test',
      campaignId: input.campaignId,
      prospectId: input.prospectId,
      executionId: input.executionId,
      variables: {
        campaignId: input.campaignId || '',
        prospectId: input.prospectId || '',
        contactId: input.contactId || '',
        qualificationScore: String(input.qualificationScore || '')
      }
    });
    if (result.callId || result.call_id) {
      this.suppression?.recordSend({
        campaignId: input.campaignId,
        contactId: input.contactId,
        channel: 'retell',
        destination: phone
      }, { providerMessageId: result.callId || result.call_id, status: result.status });
      const mapped = mapRetellEvent({ ...result, call_id: result.callId || result.call_id });
      const type = mapped.eventType === 'call.completed' ? 'call.completed' : 'call.started';
      this.events?.record(type, toStoredEvent(mapped, input));
    }
    return result;
  }
}
