/**
 * Exercises the remote MCP endpoint against a real HTTP server, including a
 * full JSON-RPC handshake, rather than only checking status codes.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import { mountMcpEndpoint } from './http-transport.js';

const TOKEN = 'test-token-that-is-long-enough-1234';

/** Minimal stand-in for the running HustleBot server. */
const fakeHustlebot = () => ({
  capabilityRegistry: {
    getStats: () => ({ capabilities: 1 }),
    list: () => [{ capabilityId: 'web.scrape', available: true }],
    describe: () => ({ capabilityId: 'web.scrape', providers: [] }),
    invoke: async () => ({ result: 'ok' })
  },
  db: null, llm: null
});

function startServer(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

/**
 * Open the SSE stream and read events off it as they arrive.
 */
async function openStream(base, token) {
  const res = await fetch(`${base}/mcp/sse`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.strictEqual(res.status, 200);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const next = async () => {
    for (;;) {
      const idx = buffer.indexOf('\n\n');
      if (idx !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const event = {};
        for (const line of raw.split('\n')) {
          if (line.startsWith('event: ')) event.event = line.slice(7);
          else if (line.startsWith('data: ')) event.data = line.slice(6);
        }
        return event;
      }
      const { done, value } = await reader.read();
      if (done) return null;
      buffer += decoder.decode(value, { stream: true });
    }
  };

  return { res, next, close: () => reader.cancel().catch(() => {}) };
}

describe('Remote MCP endpoint', () => {
  let app;
  let server;
  let base;

  before(async () => {
    app = express();
    // Mirrors the real middleware order, including the /mcp/ skip.
    const jsonParser = express.json();
    app.use((req, res, next) => (req.path.startsWith('/mcp/') ? next() : jsonParser(req, res, next)));
    mountMcpEndpoint(app, fakeHustlebot(), { token: TOKEN });
    server = await startServer(app);
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => server?.close());

  test('refuses to mount without a token', () => {
    const bare = express();
    const result = mountMcpEndpoint(bare, fakeHustlebot(), { token: null });
    assert.strictEqual(result.mounted, false);
    assert.match(result.reason, /not set/);
  });

  test('refuses to mount with a short token', () => {
    const bare = express();
    const result = mountMcpEndpoint(bare, fakeHustlebot(), { token: 'short' });
    assert.strictEqual(result.mounted, false);
    assert.match(result.reason, /too short/);
  });

  test('health is reachable without a token and leaks nothing', async () => {
    const res = await fetch(`${base}/mcp/health`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.status, 'ok');
    assert.strictEqual(body.authRequired, true);
    assert.ok(!JSON.stringify(body).includes(TOKEN));
  });

  test('rejects a missing or wrong token', async () => {
    assert.strictEqual((await fetch(`${base}/mcp/sse`)).status, 401);
    assert.strictEqual(
      (await fetch(`${base}/mcp/sse`, { headers: { Authorization: 'Bearer wrong-token-here-padding' } })).status,
      401
    );
    assert.strictEqual((await fetch(`${base}${'/mcp/messages'}?sessionId=x`, { method: 'POST' })).status, 401);
  });

  test('accepts a token passed as a query parameter', async () => {
    const stream = await openStream(base, TOKEN);
    const event = await stream.next();
    assert.strictEqual(event.event, 'endpoint');
    stream.close();
  });

  test('announces the message endpoint with a session id', async () => {
    const stream = await openStream(base, TOKEN);
    const event = await stream.next();

    assert.strictEqual(event.event, 'endpoint');
    assert.match(event.data, /^\/mcp\/messages\?sessionId=[0-9a-f-]{36}$/);
    stream.close();
  });

  test('completes a full initialize handshake and lists tools', async () => {
    const stream = await openStream(base, TOKEN);
    const endpoint = (await stream.next()).data;

    const post = (payload) =>
      fetch(`${base}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify(payload)
      });

    // 1. initialize
    let res = await post({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' }
      }
    });
    assert.strictEqual(res.status, 202, 'server should accept the message');

    const initEvent = await stream.next();
    const initReply = JSON.parse(initEvent.data);
    assert.strictEqual(initReply.id, 1);
    assert.ok(initReply.result.serverInfo, 'initialize should return serverInfo');
    assert.strictEqual(initReply.result.serverInfo.name, 'hustlebot-mcp');

    // 2. tools/list - the surface a connected client actually sees
    res = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    assert.strictEqual(res.status, 202);

    const toolsReply = JSON.parse((await stream.next()).data);
    assert.strictEqual(toolsReply.id, 2);
    const names = toolsReply.result.tools.map((t) => t.name);

    assert.ok(names.includes('list_capabilities'), 'capability tools should be exposed');
    assert.ok(names.includes('invoke_capability'));
    assert.ok(names.includes('send_message'), 'mailbox tools should be exposed');
    assert.ok(names.length >= 15, `expected the full tool surface, got ${names.length}`);

    stream.close();
  });

  test('rejects a post for an unknown session', async () => {
    const res = await fetch(`${base}/mcp/messages?sessionId=00000000-0000-0000-0000-000000000000`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })
    });
    assert.strictEqual(res.status, 404);
    assert.match((await res.json()).error, /reconnect/);
  });

  test('requires a sessionId', async () => {
    const res = await fetch(`${base}/mcp/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })
    });
    assert.strictEqual(res.status, 400);
  });

  test('supports two clients at once with separate sessions', async () => {
    const a = await openStream(base, TOKEN);
    const b = await openStream(base, TOKEN);

    const endpointA = (await a.next()).data;
    const endpointB = (await b.next()).data;
    assert.notStrictEqual(endpointA, endpointB, 'each client needs its own session');

    const health = await (await fetch(`${base}/mcp/health`)).json();
    assert.ok(health.activeSessions >= 2, `expected 2+ sessions, saw ${health.activeSessions}`);

    a.close();
    b.close();
  });
});
