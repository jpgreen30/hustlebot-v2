import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CampaignOrchestrator } from './orchestrate.js';

describe('n8n campaign orchestration', () => {
  test('records workflow but does not contact discovered prospects', async () => {
    const events = [];
    const orchestrator = new CampaignOrchestrator({
      engine: {
        getCampaign: () => ({
          campaignId: 'cmp_disc',
          kind: 'discovery',
          approval: { id: 'apr_1', status: 'approved' },
          prospects: [{ prospectId: 'p1', outreachState: 'READY', contact: { email: 'a@brand.test' } }]
        })
      },
      executor: { execute: async () => ({ status: 'should-not-run' }) },
      n8n: { execute: async (alias) => ({ alias, status: 'executed', executionId: 'n8n-orch-1' }) },
      events: { record: (type, payload) => events.push({ type, payload }) }
    });
    const out = await orchestrator.run({ campaignId: 'cmp_disc', approvalId: 'apr_1' });
    assert.equal(out.status, 'prepared-only');
    assert.equal(out.executed, false);
    assert.equal(out.discoveredProspectsContacted, 0);
    assert.equal(out.workflowExecutionId, 'n8n-orch-1');
    assert.ok(events.some((e) => e.type === 'outreach.blocked'));
  });
});
