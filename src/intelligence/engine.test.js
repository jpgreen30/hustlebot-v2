import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IntelligenceEngine } from './engine.js';
import { AcquisitionStore } from '../acquisition/store.js';
import { ApprovalGate } from '../core/approval-gate.js';
import { CapabilityRegistry } from '../core/capability-registry.js';
import { OutreachExecutor } from '../outreach/execute.js';
import { OutreachEventLog } from '../outreach/events.js';

describe('IntelligenceEngine', () => {
  test('prepares a campaign from rendered records, qualifies, scores, and requests approval', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'intel-engine-'));
    const registry = new CapabilityRegistry();
    registry.register({
      capabilityId: 'outreach.execute',
      name: 'exec',
      provider: 'test',
      requiresApproval: true,
      handler: async () => ({ ok: true })
    });
    const gate = new ApprovalGate({ registry, autoApprove: false });
    await gate.initialize();
    let workflow = null;
    const engine = new IntelligenceEngine({
      browser: {
        render: async () => ({
          status: 'ok',
          provider: 'public-directory',
          records: [
            {
              name: 'Acceleration Partners',
              website: 'https://www.accelerationpartners.com',
              description: 'Affiliate management agency and performance marketing partner',
              location: 'Boston, US',
              profileUrl: 'https://dir.test/ap',
              sourceEvent: 'affiliate-summit-west-2026',
              provenance: { provider: 'public-directory', sourceUrls: ['https://dir.test'], extractionMethod: 'test' }
            },
            {
              name: 'Tipalti',
              website: 'https://tipalti.com',
              description: 'Finance automation platform for partner payouts',
              profileUrl: 'https://dir.test/tipalti',
              sourceEvent: 'affiliate-summit-west-2026',
              provenance: { provider: 'public-directory', sourceUrls: ['https://dir.test'], extractionMethod: 'test' }
            }
          ]
        })
      },
      researcher: {
        research: async (input) => ({
          status: 'ok',
          intelligence: {
            description: { value: input.description, status: 'VERIFIED' },
            classification: { value: 'affiliate-network', status: 'INFERRED' }
          },
          provenance: { sourceUrls: [input.website] }
        })
      },
      contacts: {
        discover: async () => ({ status: 'ok', contacts: [] })
      },
      store: new AcquisitionStore({ dir }),
      events: new OutreachEventLog({ dir }),
      approvalGate: gate,
      n8n: {
        execute: async (alias, payload) => {
          workflow = { alias, payload };
          return { alias, status: 'executed', executionId: 'n8n-cmp-9', providerExecutionId: 'n8n-cmp-9' };
        }
      }
    });

    try {
      const result = await engine.prepare({
        objective: 'Find companies that could buy leads from Qentrax and prepare outreach. Do not contact anyone.',
        sourceUrl: 'https://www.affiliatesummit.com/west/exhibitors-2026',
        maxOrganizations: 10,
        qualificationProfile: 'qentrax-buyer'
      });
      assert.equal(result.status, 'ok');
      assert.equal(result.contacted, false);
      assert.ok(result.prospectsPrepared >= 2);
      assert.equal(result.approvalStatus, 'pending');
      assert.ok(result.approvalId);
      assert.equal(result.workflowExecutionId, 'n8n-cmp-9');
      assert.equal(workflow.alias, 'campaign-prepare');
      assert.equal(workflow.payload.metadata.contacted, false);
      assert.match(result.report, /Approval required/);
      assert.ok(result.campaign.prospects.every((p) => p.score && p.qualification && p.outreachPlan));

      const executor = new OutreachExecutor({ approvalGate: gate });
      const blocked = await executor.execute({
        approvalId: result.approvalId,
        campaignId: result.campaignId
      });
      assert.equal(blocked.allowed, false);
      assert.equal(blocked.status, 'blocked');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('does not invent contacts when discovery returns none', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'intel-empty-'));
    const engine = new IntelligenceEngine({
      browser: {
        render: async () => ({
          status: 'ok',
          provider: 'public-directory',
          records: [{ name: 'Quiet Co', website: 'https://quiet.test', description: 'Boxes', provenance: { sourceUrls: [] } }]
        })
      },
      researcher: { research: async () => ({ status: 'ok', intelligence: { description: { value: null, status: 'UNKNOWN' } }, provenance: { sourceUrls: [] } }) },
      contacts: { discover: async () => ({ status: 'ok', contacts: [] }) },
      store: new AcquisitionStore({ dir }),
      events: new OutreachEventLog({ dir }),
      approvalGate: null,
      n8n: null
    });
    try {
      const result = await engine.prepare({ objective: 'research them and prepare a campaign', maxOrganizations: 5 });
      const prospect = result.campaign.prospects[0];
      assert.equal(prospect.contact.email, null);
      assert.equal(prospect.contacts.length, 0);
      assert.equal(prospect.validation.email.status, 'UNKNOWN');
      assert.equal(result.contacted, false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
