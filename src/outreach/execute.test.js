import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ApprovalGate } from '../core/approval-gate.js';
import { CapabilityRegistry } from '../core/capability-registry.js';
import { OutreachExecutor } from './execute.js';

describe('outreach.execute fail-closed', () => {
  test('blocks execution without an approval id', async () => {
    const gate = new ApprovalGate({ autoApprove: false });
    await gate.initialize();
    const executor = new OutreachExecutor({ approvalGate: gate });
    const out = await executor.execute({ campaignId: 'cmp_x' });
    assert.equal(out.allowed, false);
    assert.equal(out.status, 'blocked');
    assert.match(out.error, /approval required/i);
  });

  test('blocks a pending approval and never marks executed', async () => {
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
    const request = await gate.request({
      capabilityId: 'outreach.execute',
      input: { campaignId: 'cmp_1' },
      reasons: [{ policy: 'outbound-prep', reason: 'needs approval' }]
    });
    const events = [];
    const executor = new OutreachExecutor({
      approvalGate: gate,
      events: { record: (type, payload) => events.push({ type, payload }) }
    });
    const out = await executor.execute({ approvalId: request.id, campaignId: 'cmp_1' });
    assert.equal(out.allowed, false);
    assert.equal(out.status, 'blocked');
    assert.match(out.error, /pending/i);
    assert.equal(events.length, 0);
  });

  test('even an approved request refuses contacting discovered prospects on Day-3', async () => {
    const gate = new ApprovalGate({ autoApprove: true });
    await gate.initialize();
    const request = await gate.request({
      capabilityId: 'outreach.execute',
      input: { campaignId: 'cmp_1' }
    });
    const executor = new OutreachExecutor({ approvalGate: gate });
    const out = await executor.execute({
      approvalId: request.id,
      campaignId: 'cmp_1',
      contactDiscoveredProspects: true
    });
    assert.equal(out.allowed, false);
    assert.match(out.error, /not authorized on Day-3/i);
  });

  test('approved execute stays prepared-only', async () => {
    const gate = new ApprovalGate({ autoApprove: true });
    await gate.initialize();
    const request = await gate.request({ capabilityId: 'outreach.execute', input: {} });
    const executor = new OutreachExecutor({ approvalGate: gate, events: { record() {} } });
    const out = await executor.execute({ approvalId: request.id, campaignId: 'cmp_ok' });
    assert.equal(out.status, 'prepared-only');
    assert.equal(out.executed, false);
  });
});
