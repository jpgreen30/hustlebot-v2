import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
  extractPresentedToken,
  isLoopbackAddress,
  requireActionAuth,
  resolveActionToken,
  tokensMatch,
  rateLimitActions
} from './action-auth.js';

describe('action auth helpers', () => {
  test('extracts bearer and custom headers', () => {
    assert.equal(extractPresentedToken({ headers: { authorization: 'Bearer secret-1' } }), 'secret-1');
    assert.equal(extractPresentedToken({ headers: { 'x-hustlebot-key': 'secret-2' } }), 'secret-2');
    assert.equal(extractPresentedToken({ headers: { 'x-internal-token': 'secret-3' } }), 'secret-3');
    assert.equal(extractPresentedToken({ headers: {} }), null);
  });

  test('compares tokens in constant time and rejects length mismatch', () => {
    assert.equal(tokensMatch('abc', 'abc'), true);
    assert.equal(tokensMatch('abc', 'abd'), false);
    assert.equal(tokensMatch('abc', 'ab'), false);
    assert.equal(tokensMatch(null, 'abc'), false);
  });

  test('recognizes loopback addresses', () => {
    assert.equal(isLoopbackAddress('127.0.0.1'), true);
    assert.equal(isLoopbackAddress('::1'), true);
    assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
    assert.equal(isLoopbackAddress('8.8.8.8'), false);
  });
});

describe('action auth middleware', () => {
  const prev = {};
  before(() => {
    for (const key of ['HUSTLEBOT_ACTION_TOKEN', 'INTERNAL_API_KEY', 'MCP_AUTH_TOKEN', 'NODE_ENV', 'RENDER', 'RENDER_GIT_COMMIT']) {
      prev[key] = process.env[key];
    }
  });
  after(() => {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  function appWithAuth() {
    const app = express();
    app.use(express.json());
    app.post('/invoke', requireActionAuth(), (req, res) => res.json({ ok: true, mode: req.actionAuth.mode }));
    return app;
  }

  async function listen(app) {
    return new Promise((resolve) => {
      const server = app.listen(0, '127.0.0.1', () => {
        const { port } = server.address();
        resolve({ server, url: `http://127.0.0.1:${port}` });
      });
    });
  }

  test('unauthenticated request fails with 401 when a token is configured', async () => {
    process.env.HUSTLEBOT_ACTION_TOKEN = 'day2-test-token';
    delete process.env.RENDER_GIT_COMMIT;
    process.env.NODE_ENV = 'test';
    const { server, url } = await listen(appWithAuth());
    try {
      const res = await fetch(`${url}/invoke`, { method: 'POST' });
      assert.equal(res.status, 401);
      const body = await res.json();
      assert.equal(body.code, 'UNAUTHORIZED');
      assert.ok(res.headers.get('www-authenticate'));
    } finally {
      server.close();
    }
  });

  test('wrong token is 403', async () => {
    process.env.HUSTLEBOT_ACTION_TOKEN = 'day2-test-token';
    const { server, url } = await listen(appWithAuth());
    try {
      const res = await fetch(`${url}/invoke`, {
        method: 'POST',
        headers: { Authorization: 'Bearer no-thanks' }
      });
      assert.equal(res.status, 403);
    } finally {
      server.close();
    }
  });

  test('correct token is allowed', async () => {
    process.env.HUSTLEBOT_ACTION_TOKEN = 'day2-test-token';
    const { server, url } = await listen(appWithAuth());
    try {
      const res = await fetch(`${url}/invoke`, {
        method: 'POST',
        headers: { Authorization: 'Bearer day2-test-token' }
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
    } finally {
      server.close();
    }
  });

  test('rate limiter trips after the configured max', async () => {
    const app = express();
    app.post('/x', rateLimitActions({ windowMs: 60_000, max: 2, keyFn: () => 'same' }), (req, res) => res.json({ ok: true }));
    const { server, url } = await listen(app);
    try {
      assert.equal((await fetch(`${url}/x`, { method: 'POST' })).status, 200);
      assert.equal((await fetch(`${url}/x`, { method: 'POST' })).status, 200);
      assert.equal((await fetch(`${url}/x`, { method: 'POST' })).status, 429);
    } finally {
      server.close();
    }
  });

  test('resolveActionToken prefers the dedicated action token', () => {
    process.env.MCP_AUTH_TOKEN = 'mcp';
    process.env.HUSTLEBOT_ACTION_TOKEN = 'action';
    assert.equal(resolveActionToken(), 'action');
  });
});
