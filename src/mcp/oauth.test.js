/**
 * Walks the exact sequence a remote MCP client follows:
 * 401 -> resource metadata -> AS metadata -> register -> authorize -> token
 * -> authenticated MCP handshake.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import { createHash, randomBytes } from 'crypto';
import { mountMcpEndpoint } from './http-transport.js';

const TOKEN = 'owner-token-long-enough-for-mcp-1234';
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';

const fakeHustlebot = () => ({ capabilityRegistry: null, db: null, llm: null });

const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};

const form = (obj) => new URLSearchParams(obj).toString();

describe('MCP OAuth 2.1', () => {
  let server;
  let base;

  before(async () => {
    const app = express();
    const jsonParser = express.json();
    app.use((req, res, next) => (req.path.startsWith('/mcp/') ? next() : jsonParser(req, res, next)));
    app.use(express.urlencoded({ extended: true }));
    mountMcpEndpoint(app, fakeHustlebot(), { token: TOKEN });

    server = await new Promise((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => server?.close());

  test('401 carries the WWW-Authenticate header pointing at resource metadata', async () => {
    const res = await fetch(`${base}/mcp/sse`, { redirect: 'manual' });
    assert.strictEqual(res.status, 401);

    const header = res.headers.get('www-authenticate');
    assert.ok(header, 'WWW-Authenticate is required by RFC 9728');
    assert.match(header, /^Bearer /);
    assert.match(header, /resource_metadata="[^"]+\/\.well-known\/oauth-protected-resource"/);
  });

  test('protected resource metadata names the authorization server', async () => {
    const res = await fetch(`${base}/.well-known/oauth-protected-resource`);
    assert.strictEqual(res.status, 200);

    const meta = await res.json();
    assert.ok(Array.isArray(meta.authorization_servers) && meta.authorization_servers.length > 0);
    assert.match(meta.resource, /\/mcp\/sse$/);
  });

  test('authorization server metadata advertises the required endpoints', async () => {
    const res = await fetch(`${base}/.well-known/oauth-authorization-server`);
    assert.strictEqual(res.status, 200);

    const meta = await res.json();
    for (const field of ['issuer', 'authorization_endpoint', 'token_endpoint', 'registration_endpoint']) {
      assert.ok(meta[field], `metadata must include ${field}`);
    }
    assert.deepStrictEqual(meta.code_challenge_methods_supported, ['S256']);
    assert.ok(meta.grant_types_supported.includes('authorization_code'));
    assert.ok(meta.grant_types_supported.includes('refresh_token'));
  });

  test('metadata is also served on the path-suffixed variant clients probe', async () => {
    const res = await fetch(`${base}/.well-known/oauth-authorization-server/mcp/sse`);
    assert.strictEqual(res.status, 200);
    assert.ok((await res.json()).token_endpoint);
  });

  test('dynamic client registration issues a client_id', async () => {
    const res = await fetch(`${base}/oauth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: 'Claude', redirect_uris: [REDIRECT] })
    });
    assert.strictEqual(res.status, 201);

    const client = await res.json();
    assert.match(client.client_id, /^mcp-/);
    assert.deepStrictEqual(client.redirect_uris, [REDIRECT]);
    assert.strictEqual(client.token_endpoint_auth_method, 'none');
  });

  test('registration rejects a missing or insecure redirect_uri', async () => {
    const post = (body) =>
      fetch(`${base}/oauth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

    assert.strictEqual((await post({ client_name: 'x' })).status, 400);
    assert.strictEqual((await post({ redirect_uris: ['http://evil.example.com/cb'] })).status, 400);
    // localhost over http is allowed, for desktop clients.
    assert.strictEqual((await post({ redirect_uris: ['http://localhost:5173/cb'] })).status, 201);
  });

  async function registerClient() {
    const res = await fetch(`${base}/oauth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: 'Claude', redirect_uris: [REDIRECT] })
    });
    return (await res.json()).client_id;
  }

  test('the consent page appears and requires the owner token', async () => {
    const clientId = await registerClient();
    const { challenge } = pkce();

    const url = `${base}/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT)}` +
      `&code_challenge=${challenge}&code_challenge_method=S256&state=abc&response_type=code`;

    const res = await fetch(url);
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert.match(html, /Connect/);
    assert.match(html, /owner_token/);
    assert.ok(!html.includes(TOKEN), 'the page must never echo the token');
  });

  test('authorize rejects a plain (non-S256) challenge and a bad redirect_uri', async () => {
    const clientId = await registerClient();
    const { challenge } = pkce();

    const plain = await fetch(
      `${base}/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT)}` +
      `&code_challenge=${challenge}&code_challenge_method=plain`
    );
    assert.strictEqual(plain.status, 400);

    const badRedirect = await fetch(
      `${base}/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent('https://evil.test/cb')}` +
      `&code_challenge=${challenge}&code_challenge_method=S256`
    );
    assert.strictEqual(badRedirect.status, 400);
  });

  test('consent with a wrong owner token does not issue a code', async () => {
    const clientId = await registerClient();
    const { challenge } = pkce();

    const res = await fetch(`${base}/oauth/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({
        client_id: clientId, redirect_uri: REDIRECT,
        code_challenge: challenge, owner_token: 'wrong'
      }),
      redirect: 'manual'
    });
    assert.strictEqual(res.status, 401);
  });

  /** The whole flow, end to end. */
  async function fullFlow() {
    const clientId = await registerClient();
    const { verifier, challenge } = pkce();
    const resource = `${base}/mcp/sse`;

    const consent = await fetch(`${base}/oauth/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({
        client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge,
        state: 'xyz', resource, owner_token: TOKEN
      }),
      redirect: 'manual'
    });
    assert.strictEqual(consent.status, 302);

    const location = new URL(consent.headers.get('location'));
    assert.strictEqual(location.searchParams.get('state'), 'xyz');
    const code = location.searchParams.get('code');
    assert.ok(code);

    const tokenRes = await fetch(`${base}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({
        grant_type: 'authorization_code', code, redirect_uri: REDIRECT,
        client_id: clientId, code_verifier: verifier, resource
      })
    });
    assert.strictEqual(tokenRes.status, 200);
    return { tokens: await tokenRes.json(), clientId, verifier, code, resource };
  }

  test('completes register -> authorize -> token', async () => {
    const { tokens } = await fullFlow();
    assert.ok(tokens.access_token);
    assert.strictEqual(tokens.token_type, 'Bearer');
    assert.ok(tokens.expires_in > 0);
    assert.ok(tokens.refresh_token);
  });

  test('the issued token opens an MCP session', async () => {
    const { tokens } = await fullFlow();
    const res = await fetch(`${base}/mcp/sse`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    assert.strictEqual(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/event-stream/);
    await res.body.getReader().cancel().catch(() => {});
  });

  test('an authorization code cannot be replayed', async () => {
    const { clientId, verifier, code, resource } = await fullFlow();
    const again = await fetch(`${base}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({
        grant_type: 'authorization_code', code, redirect_uri: REDIRECT,
        client_id: clientId, code_verifier: verifier, resource
      })
    });
    assert.strictEqual(again.status, 400);
    assert.strictEqual((await again.json()).error, 'invalid_grant');
  });

  test('a wrong PKCE verifier is rejected', async () => {
    const clientId = await registerClient();
    const { challenge } = pkce();

    const consent = await fetch(`${base}/oauth/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({ client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, owner_token: TOKEN }),
      redirect: 'manual'
    });
    const code = new URL(consent.headers.get('location')).searchParams.get('code');

    const res = await fetch(`${base}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({
        grant_type: 'authorization_code', code, redirect_uri: REDIRECT,
        client_id: clientId, code_verifier: 'not-the-verifier'
      })
    });
    assert.strictEqual(res.status, 400);
    assert.match((await res.json()).error_description, /PKCE/);
  });

  test('refresh returns a new token and rotates the refresh token', async () => {
    const { tokens, clientId } = await fullFlow();

    const res = await fetch(`${base}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: clientId })
    });
    assert.strictEqual(res.status, 200);
    const next = await res.json();
    assert.ok(next.access_token);
    assert.notStrictEqual(next.refresh_token, tokens.refresh_token, 'refresh tokens must rotate');

    // The old one is now dead.
    const reuse = await fetch(`${base}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: clientId })
    });
    assert.strictEqual(reuse.status, 400);
  });

  test('an unsupported grant type is refused', async () => {
    const res = await fetch(`${base}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({ grant_type: 'password', username: 'a', password: 'b' })
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual((await res.json()).error, 'unsupported_grant_type');
  });

  test('the static owner token still works alongside OAuth', async () => {
    const res = await fetch(`${base}/mcp/sse`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    assert.strictEqual(res.status, 200);
    await res.body.getReader().cancel().catch(() => {});
  });

  test('a random bearer token is still rejected', async () => {
    const res = await fetch(`${base}/mcp/sse`, { headers: { Authorization: 'Bearer nope-nope-nope' } });
    assert.strictEqual(res.status, 401);
  });
});
