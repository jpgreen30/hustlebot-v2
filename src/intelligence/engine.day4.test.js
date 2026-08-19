import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IntelligenceEngine } from './engine.js';
import { AcquisitionStore } from '../acquisition/store.js';
import { ApprovalGate } from '../core/approval-gate.js';
import { OutreachEventLog } from '../outreach/events.js';

describe('Day-4 engine controls + test campaign', () => {
  test('control reports decision makers and blocks start outreach without approval', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'eng4-'));
    const engine = new IntelligenceEngine({
      browser: { render: async () => ({ status: 'ok', records: [] }) },
      store: new AcquisitionStore({ dir }),
      events: new OutreachEventLog({ dir }),
      approvalGate: null,
      n8n: null
    });
    try {
      const prepared = await engine.prepareTestCampaign({
        phoneNumber: '+18184381415',
        email: null,
        fullName: 'Jean Test'
      });
      assert.equal(prepared.status, 'ok');
      assert.equal(prepared.campaign.kind, 'authorized-test');
      assert.equal(prepared.campaign.prospects[0].contact.phone, '+18184381415');
      const show = engine.control({ query: 'Show me the Qentrax campaign.' });
      assert.match(show.report, /Campaign:/);
      const start = engine.control({ query: 'Start outreach' });
      assert.equal(start.status, 'blocked');
      assert.equal(start.requiresApproval, true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('prepareTestCampaign requires an authorized destination', async () => {
    const prevPhone = process.env.RETELL_TEST_NUMBER;
    const prevEmail = process.env.OUTREACH_TEST_EMAIL;
    delete process.env.RETELL_TEST_NUMBER;
    delete process.env.OUTREACH_TEST_EMAIL;
    delete process.env.EMAIL_TEST_DESTINATION;
    const engine = new IntelligenceEngine({
      browser: { render: async () => ({ status: 'ok', records: [] }) }
    });
    try {
      const out = await engine.prepareTestCampaign({});
      assert.equal(out.status, 'blocked');
    } finally {
      if (prevPhone) process.env.RETELL_TEST_NUMBER = prevPhone;
      if (prevEmail) process.env.OUTREACH_TEST_EMAIL = prevEmail;
    }
  });
});
