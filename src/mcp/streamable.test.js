/**
 * Streamable HTTP transport - the one newer clients (ChatGPT, current
 * Claude connectors) prefer. Drives a real handshake over POST /mcp.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import { mountMcpEndpoint } from './http-transport.js';

const TOKEN = 'streamable-token-long-enough-12345';

const fakeHustlebot = () => ({
  capabilityRegistry: {
    getStats: () => ({ capabilities: 3 }),
    list: () => [{ capabilityId: 'web.scrape', available: true, providers: ['x'] }],
    describe: () => ({ capabilityId: 'web.scrape', providers: [] }),
    invoke: async () => ({ result: 'ok' })
  },
  db: null,
  llm: null
});

/** Parse either a JSON body or an SSE-framed JSON-RPC response. */
async function readRpc(res) {
  const text = await res.text();
  const ct = res.headers.get('content-type') || '';

  if (ct.includes('application/json')) return JSON.parse(text);

  const line = text.split('\n').find((l) => l.startsWith('data: '));
  assert.ok(line, `no JSON-RPC payload found in response: ${text.slice(0, 200)}`);
  return JSON.parse(line.slice(6));
}

describe('Streamable HTTP transport', () => {
  let server;
  let base;

  const headers = (extra = {}) => ({
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    Authorization: `Bearer ${TOKEN}`,
    ...extra
  });

  const initializeBody = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'streamable-test', version: '1.0.0' }
    }
  };

  before(async () => {
    const app = express();
    const jsonParser = express.json();
    // Mirrors the real server: only '/mcp/' bypasses the parser, so '/mcp'
    // arrives pre-parsed - which is what the transport is handed.
    app.use((req, res, next) => (req.path.startsWith('/mcp/') ? next() : jsonParser(req, res, next)));
    app.use(express.urlencoded({ extended: true }));
    mountMcpEndpoint(app, fakeHustlebot(), { token: TOKEN });

    server = await new Promise((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => server?.close());

  test('health advertises both transports', async () => {
    const body = await (await fetch(`${base}/mcp/health`)).json();
    assert.deepStrictEqual(body.transports, ['streamable-http', 'sse']);
    assert.strictEqual(body.streamableHttp, '/mcp');
    assert.strictEqual(body.sse, '/mcp/sse');
  });

  test('rejects an unauthenticated request with WWW-Authenticate', async () => {
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify(initializeBody)
    });
    assert.strictEqual(res.status, 401);
    assert.match(res.headers.get('www-authenticate') || '', /resource_metadata=/);
  });

  test('initialize returns serverInfo and a session id', async () => {
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(initializeBody)
    });
    assert.strictEqual(res.status, 200);

    const sessionId = res.headers.get('mcp-session-id');
    assert.ok(sessionId, 'server must return mcp-session-id on initialize');

    const reply = await readRpc(res);
    assert.strictEqual(reply.id, 1);
    assert.strictEqual(reply.result.serverInfo.name, 'hustlebot-mcp');
  });

  /** initialize + notifications/initialized, returning the session id. */
  async function openSession() {
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(initializeBody)
    });
    const sessionId = res.headers.get('mcp-session-id');
    await readRpc(res);

    await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: headers({ 'mcp-session-id': sessionId }),
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
    });

    return sessionId;
  }

  test('tools/list returns the full surface over streamable HTTP', async () => {
    const sessionId = await openSession();

    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: headers({ 'mcp-session-id': sessionId }),
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    });
    assert.strictEqual(res.status, 200);

    const reply = await readRpc(res);
    const names = reply.result.tools.map((t) => t.name);

    assert.ok(names.includes('list_capabilities'));
    assert.ok(names.includes('invoke_capability'));
    assert.ok(names.includes('send_message'));
    assert.ok(names.length >= 15, `expected the whole tool surface, got ${names.length}`);
  });

  test('a tool actually executes over streamable HTTP', async () => {
    const sessionId = await openSession();

    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: headers({ 'mcp-session-id': sessionId }),
      body: JSON.stringify({
        jsonrpc: '2.0', id: 3, method: 'tools/call',
        params: { name: 'list_capabilities', arguments: {} }
      })
    });
    assert.strictEqual(res.status, 200);

    const reply = await readRpc(res);
    assert.ok(reply.result, `expected a result, got ${JSON.stringify(reply).slice(0, 200)}`);
  });

  test('an unknown session id is refused', async () => {
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: headers({ 'mcp-session-id': '00000000-0000-0000-0000-000000000000' }),
      body: JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/list', params: {} })
    });
    assert.ok(res.status >= 400, `expected a rejection, got ${res.status}`);
  });

  test('GET without a session is refused rather than hanging', async () => {
    const res = await fetch(`${base}/mcp`, {
      method: 'GET',
      headers: { Accept: 'text/event-stream', Authorization: `Bearer ${TOKEN}` }
    });
    assert.strictEqual(res.status, 400);
  });

  test('the SSE transport still works alongside it', async () => {
    const res = await fetch(`${base}/mcp/sse`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    assert.strictEqual(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/event-stream/);
    await res.body.getReader().cancel().catch(() => {});
  });

  test('two streamable clients get independent sessions', async () => {
    const a = await openSession();
    const b = await openSession();
    assert.notStrictEqual(a, b);

    const health = await (await fetch(`${base}/mcp/health`)).json();
    assert.ok(health.activeSessions >= 2);
  });
});
