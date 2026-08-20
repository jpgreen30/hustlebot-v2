import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { requireActionAuth } from '../core/action-auth.js';
import { IntelligenceEngine, handleCampaignControlHttp } from './engine.js';
import { AcquisitionStore } from '../acquisition/store.js';
import { OutreachEventLog } from '../outreach/events.js';
import { SuppressionStore } from '../outreach/suppression.js';

const TOKEN = 'day4-control-http-token';
const HERE = dirname(fileURLToPath(import.meta.url));

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

function mount(engine) {
  const app = express();
  app.use(express.json());
  app.post('/api/campaign/control', requireActionAuth(), async (req, res) => {
    try {
      await handleCampaignControlHttp(engine, req, res);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  return app;
}

async function post(url, { token = TOKEN, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${url}/api/campaign/control`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body || {})
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

function makeEngine(dir) {
  return new IntelligenceEngine({
    browser: { render: async () => ({ status: 'ok', records: [] }) },
    store: new AcquisitionStore({ dir }),
    events: new OutreachEventLog({ dir }),
    suppression: new SuppressionStore({ dir }),
    approvalGate: null,
    n8n: null
  });
}

describe('POST /api/campaign/control HTTP', () => {
  const prev = {};
  before(() => {
    for (const key of ['HUSTLEBOT_ACTION_TOKEN', 'INTERNAL_API_KEY', 'MCP_AUTH_TOKEN', 'NODE_ENV', 'RENDER', 'RENDER_GIT_COMMIT']) {
      prev[key] = process.env[key];
    }
    process.env.HUSTLEBOT_ACTION_TOKEN = TOKEN;
    process.env.NODE_ENV = 'test';
    delete process.env.RENDER;
    delete process.env.RENDER_GIT_COMMIT;
  });
  after(() => {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test('production handler awaits control() instead of serializing a Promise to {}', () => {
    const src = readFileSync(join(HERE, '../server.js'), 'utf8');
    assert.match(src, /await handleCampaignControlHttp\(this\.intelligenceEngine/);
    assert.doesNotMatch(src, /res\.json\(this\.intelligenceEngine\.control\(/);
  });

  test('unauthenticated request is 401 and wrong token is 403', async () => {
    const { server, url } = await listen(mount(makeEngine(mkdtempSync(join(tmpdir(), 'ctl-auth-')))));
    try {
      const missing = await post(url, { token: null, body: { query: 'status' } });
      assert.equal(missing.status, 401);
      assert.equal(missing.json.code, 'UNAUTHORIZED');
      const wrong = await post(url, { token: 'nope', body: { query: 'status' } });
      assert.equal(wrong.status, 403);
      assert.equal(wrong.json.code, 'FORBIDDEN');
    } finally {
      server.close();
    }
  });

  test('missing engine is 503', async () => {
    const { server, url } = await listen(mount(null));
    try {
      const res = await post(url, { body: { query: 'status' } });
      assert.equal(res.status, 503);
      assert.match(res.json.error, /not initialized/i);
    } finally {
      server.close();
    }
  });

  test('show/status returns the campaign control payload, not {}', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ctl-show-'));
    const engine = makeEngine(dir);
    try {
      const prepared = await engine.prepareTestCampaign({
        phoneNumber: '+18184381415',
        fullName: 'Authorized Test Contact'
      });
      const { server, url } = await listen(mount(engine));
      try {
        const res = await post(url, { body: { query: 'Show me the campaign status.', campaignId: prepared.campaignId } });
        assert.equal(res.status, 200);
        assert.equal(res.json.status, 'ok');
        assert.equal(res.json.campaignId, prepared.campaignId);
        assert.equal(typeof res.json.report, 'string');
        assert.match(res.json.report, /Campaign/);
        assert.ok(Object.keys(res.json).length > 0);
      } finally {
        server.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('pause then resume round-trip through the HTTP endpoint', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ctl-pause-'));
    const engine = makeEngine(dir);
    try {
      const prepared = await engine.prepareTestCampaign({ phoneNumber: '+18184381415' });
      engine.persistCampaign({
        ...engine.getCampaign(prepared.campaignId),
        lifecycle: 'RUNNING',
        approval: { ...(engine.getCampaign(prepared.campaignId).approval || {}), status: 'approved' }
      });
      const { server, url } = await listen(mount(engine));
      try {
        const paused = await post(url, { body: { action: 'pause', campaignId: prepared.campaignId } });
        assert.equal(paused.status, 200);
        assert.equal(paused.json.status, 'ok');
        assert.equal(paused.json.campaignId, prepared.campaignId);
        assert.equal(paused.json.lifecycle, 'PAUSED');
        assert.match(paused.json.report, /paused/i);
        assert.equal(engine.getCampaign(prepared.campaignId).paused, true);

        const resumed = await post(url, { body: { action: 'resume', campaignId: prepared.campaignId } });
        assert.equal(resumed.status, 200);
        assert.equal(resumed.json.status, 'ok');
        assert.equal(resumed.json.lifecycle, 'RUNNING');
        assert.match(resumed.json.report, /resumed/i);
        assert.equal(engine.getCampaign(prepared.campaignId).paused, false);
      } finally {
        server.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('invalid campaign and control behavior stay explicit', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ctl-invalid-'));
    const engine = makeEngine(dir);
    const { server, url } = await listen(mount(engine));
    try {
      const empty = await post(url, { body: { query: 'status' } });
      assert.equal(empty.status, 200);
      assert.equal(empty.json.status, 'empty');
      assert.match(empty.json.report, /Prepare one first/);

      await engine.prepareTestCampaign({ phoneNumber: '+18184381415' });
      const unknown = await post(url, { body: { action: 'pause', campaignId: 'cmp_does_not_exist' } });
      assert.equal(unknown.status, 200);
      assert.equal(unknown.json.status, 'empty');

      const blocked = await post(url, { body: { action: 'start outreach' } });
      assert.equal(blocked.status, 200);
      assert.equal(blocked.json.status, 'blocked');
      assert.equal(blocked.json.requiresApproval, true);
    } finally {
      server.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
