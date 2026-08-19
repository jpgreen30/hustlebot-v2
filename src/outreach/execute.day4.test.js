import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApprovalGate } from '../core/approval-gate.js';
import { OutreachExecutor } from './execute.js';
import { SuppressionStore } from './suppression.js';
import { OutreachEventLog } from './events.js';

describe('authorized test execution', () => {
  test('approved authorized-test can call Retell and never contacts discovered people', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'exec4-'));
    const gate = new ApprovalGate({ autoApprove: true });
    await gate.initialize();
    const request = await gate.request({ capabilityId: 'outreach.execute', input: { kind: 'authorized-test' } });
    const calls = [];
    const campaign = {
      campaignId: 'cmp_test',
      kind: 'authorized-test',
      lifecycle: 'APPROVED',
      approval: { id: request.id, status: 'approved' },
      allowlist: { phones: ['+18184381415'], emails: [] },
      prospects: [{
        prospectId: 'prs_test',
        outreachState: 'READY',
        contact: { phone: '+18184381415', fullName: 'Operator' },
        contacts: [{ personId: 'per_test', phone: '+18184381415' }],
        outreachPlan: { suggestedCallObjective: 'self-test' }
      }]
    };
    const stored = { ...campaign };
    const executor = new OutreachExecutor({
      approvalGate: gate,
      events: new OutreachEventLog({ dir }),
      suppression: new SuppressionStore({ dir }),
      n8n: { execute: async (alias) => ({ alias, status: 'executed', executionId: 'n8n-run-4' }) },
      retell: {
        makeOutboundCall: async (input) => {
          calls.push(input);
          return { status: 'ok', callId: 'call_real_1', call_id: 'call_real_1' };
        }
      },
      engine: {
        getCampaign: () => stored,
        persistCampaign: (next) => Object.assign(stored, next)
      }
    });
    try {
      const out = await executor.execute({
        approvalId: request.id,
        campaignId: 'cmp_test',
        authorizedTest: true,
        script: 'HustleBot authorized production self-test.'
      });
      assert.equal(out.executed, true);
      assert.equal(out.discoveredProspectsContacted, 0);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].phoneNumber, '+18184381415');
      assert.equal(out.workflowExecutionId, 'n8n-run-4');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('duplicate authorized email is blocked', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'exec4b-'));
    const gate = new ApprovalGate({ autoApprove: true });
    await gate.initialize();
    const request = await gate.request({ capabilityId: 'outreach.execute', input: {} });
    const suppression = new SuppressionStore({ dir });
    const executor = new OutreachExecutor({
      approvalGate: gate,
      suppression,
      engine: {
        getCampaign: () => ({
          campaignId: 'cmp_e',
          kind: 'authorized-test',
          allowlist: { emails: ['ops@hustlebot.test'] }
        })
      },
      email: {
        send: async () => ({ status: 'sent', providerMessageId: 'm1' })
      }
    });
    try {
      process.env.OUTREACH_TEST_EMAIL = 'ops@hustlebot.test';
      const first = await executor.sendEmail({
        approvalId: request.id,
        to: 'ops@hustlebot.test',
        subject: 'HustleBot Production Test',
        body: 'This is a HustleBot controlled outreach production test.',
        campaignId: 'cmp_e',
        contactId: 'per_e'
      });
      assert.equal(first.status, 'sent');
      const second = await executor.sendEmail({
        approvalId: request.id,
        to: 'ops@hustlebot.test',
        subject: 'HustleBot Production Test',
        body: 'This is a HustleBot controlled outreach production test.',
        campaignId: 'cmp_e',
        contactId: 'per_e'
      });
      assert.equal(second.status, 'blocked');
      assert.equal(second.code, 'DUPLICATE');
    } finally {
      delete process.env.OUTREACH_TEST_EMAIL;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
