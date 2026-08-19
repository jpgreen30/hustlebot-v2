/**
 * Outreach execution. Fail closed without ApprovalGate approval.
 * Day-3 must not contact discovered prospects.
 */

import logger from '../utils/logger.js';

export class OutreachExecutor {
  constructor({ approvalGate, retell, email, events } = {}) {
    this.approvalGate = approvalGate;
    this.retell = retell;
    this.email = email;
    this.events = events;
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

  async execute(input = {}) {
    const gate = await this.assertApproved(input.approvalId);
    if (!gate.allowed) {
      logger.warn(`Outreach execute blocked: ${gate.error}`);
      return gate;
    }

    if (input.contactDiscoveredProspects === true) {
      return {
        allowed: false,
        status: 'blocked',
        error: 'contacting discovered prospects is not authorized on Day-3',
        approvalId: input.approvalId
      };
    }

    this.events?.record('outreach.started', {
      campaignId: input.campaignId || null,
      approvalId: input.approvalId,
      actor: input.actor || 'system'
    });

    return {
      status: 'prepared-only',
      success: true,
      executed: false,
      reason: 'Day-3 execution architecture is ready and gated. No discovered prospect was contacted.',
      approvalId: input.approvalId,
      campaignId: input.campaignId || null
    };
  }

  async callAuthorizedTest(input = {}) {
    const gate = await this.assertApproved(input.approvalId);
    if (!gate.allowed) return gate;
    if (!this.retell?.makeOutboundCall) {
      return { status: 'unavailable', error: 'Retell not configured' };
    }
    const result = await this.retell.makeOutboundCall({
      phoneNumber: input.phoneNumber,
      script: input.script,
      name: input.name || 'Authorized test',
      purpose: input.purpose || 'Day-3 authorized self-test',
      variables: {
        campaignId: input.campaignId || '',
        prospectId: input.prospectId || '',
        qualificationScore: String(input.qualificationScore || '')
      }
    });
    return result;
  }
}
