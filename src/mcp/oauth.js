/**
 * OAUTH 2.1 FOR THE REMOTE MCP ENDPOINT
 *
 * Claude (and other remote MCP clients) will not connect to a bare bearer
 * token endpoint. Per the MCP authorization spec the server must act as an
 * OAuth 2.1 resource server AND point at an authorization server:
 *
 *   GET  /.well-known/oauth-protected-resource   RFC 9728 - names the AS
 *   GET  /.well-known/oauth-authorization-server RFC 8414 - AS metadata
 *   POST /oauth/register                         RFC 7591 - dynamic registration
 *   GET  /oauth/authorize                        consent, issues a code
 *   POST /oauth/token                            code + PKCE -> access token
 *
 * This platform has exactly one operator, so the "user authorizes" step is a
 * page that asks for MCP_AUTH_TOKEN. Holding that token is what proves you
 * are the owner - the same secret that already guarded the endpoint, now
 * wrapped in the flow Claude expects.
 *
 * Deliberate choices:
 * - PKCE S256 is required, not optional. A plain challenge is rejected.
 * - Redirect URIs are matched exactly against what the client registered.
 * - Tokens are opaque and stored server-side, so revocation is immediate and
 *   there is no signing key to leak.
 * - Tokens record the resource they were issued for, and the MCP endpoint
 *   checks it, because the spec requires audience validation.
 */

import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import logger from '../utils/logger.js';

const rand = (bytes = 32) => randomBytes(bytes).toString('base64url');

function safeEqual(a, b) {
  if (!a || !b) return false;
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

/** RFC 7636 S256 verification. */
function verifyPkce(verifier, challenge) {
  if (!verifier || !challenge) return false;
  const hash = createHash('sha256').update(verifier).digest('base64url');
  return safeEqual(hash, challenge);
}

/** Canonical base URL of this deployment, honouring Render's proxy headers. */
function baseUrlFrom(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto']?.split(',')[0] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

const escapeHtml = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

class OAuthProvider {
  constructor({ ownerToken, accessTokenTtlMs, codeTtlMs } = {}) {
    this.ownerToken = ownerToken;
    this.accessTokenTtlMs = accessTokenTtlMs ?? 30 * 24 * 60 * 60 * 1000;
    this.codeTtlMs = codeTtlMs ?? 5 * 60 * 1000;

    this.clients = new Map();       // client_id -> registration
    this.codes = new Map();         // code -> { clientId, redirectUri, challenge, resource, scope, expiresAt }
    this.accessTokens = new Map();  // token -> { clientId, resource, scope, expiresAt }
    this.refreshTokens = new Map(); // token -> { clientId, resource, scope }
  }

  registerClient(metadata = {}) {
    const redirectUris = metadata.redirect_uris || [];
    if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
      throw Object.assign(new Error('redirect_uris is required'), { code: 'invalid_redirect_uri' });
    }
    for (const uri of redirectUris) {
      let parsed;
      try {
        parsed = new URL(uri);
      } catch {
        throw Object.assign(new Error(`Invalid redirect_uri: ${uri}`), { code: 'invalid_redirect_uri' });
      }
      const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      if (parsed.protocol !== 'https:' && !isLocal) {
        throw Object.assign(
          new Error('redirect_uri must use https, or be localhost'),
          { code: 'invalid_redirect_uri' }
        );
      }
    }

    const client = {
      client_id: `mcp-${rand(12)}`,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: redirectUris,
      client_name: metadata.client_name || 'MCP client',
      grant_types: metadata.grant_types || ['authorization_code', 'refresh_token'],
      response_types: metadata.response_types || ['code'],
      // Public client: PKCE is the protection, so no secret is issued.
      token_endpoint_auth_method: 'none',
      scope: metadata.scope || 'mcp'
    };

    this.clients.set(client.client_id, client);
    logger.info(`🔑 OAuth client registered: ${client.client_id} (${client.client_name})`);
    return client;
  }

  issueCode({ clientId, redirectUri, codeChallenge, resource, scope }) {
    const code = rand(24);
    this.codes.set(code, {
      clientId,
      redirectUri,
      challenge: codeChallenge,
      resource: resource || null,
      scope: scope || 'mcp',
      expiresAt: Date.now() + this.codeTtlMs
    });
    return code;
  }

  exchangeCode({ code, clientId, redirectUri, codeVerifier, resource }) {
    const entry = this.codes.get(code);
    if (!entry) throw Object.assign(new Error('Invalid or reused code'), { code: 'invalid_grant' });

    // Single use, whatever happens next.
    this.codes.delete(code);

    if (Date.now() > entry.expiresAt) {
      throw Object.assign(new Error('Authorization code expired'), { code: 'invalid_grant' });
    }
    if (entry.clientId !== clientId) {
      throw Object.assign(new Error('Code was issued to a different client'), { code: 'invalid_grant' });
    }
    if (entry.redirectUri !== redirectUri) {
      throw Object.assign(new Error('redirect_uri does not match the authorization request'), { code: 'invalid_grant' });
    }
    if (!verifyPkce(codeVerifier, entry.challenge)) {
      throw Object.assign(new Error('PKCE verification failed'), { code: 'invalid_grant' });
    }
    // RFC 8707: if the client narrowed the resource, keep it consistent.
    if (resource && entry.resource && resource !== entry.resource) {
      throw Object.assign(new Error('resource does not match the authorization request'), { code: 'invalid_target' });
    }

    return this.issueTokens({ clientId, resource: entry.resource || resource || null, scope: entry.scope });
  }

  issueTokens({ clientId, resource, scope }) {
    const accessToken = rand(32);
    const refreshToken = rand(32);

    this.accessTokens.set(accessToken, {
      clientId,
      resource: resource || null,
      scope: scope || 'mcp',
      expiresAt: Date.now() + this.accessTokenTtlMs
    });
    this.refreshTokens.set(refreshToken, { clientId, resource: resource || null, scope: scope || 'mcp' });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: Math.floor(this.accessTokenTtlMs / 1000),
      refresh_token: refreshToken,
      scope: scope || 'mcp'
    };
  }

  refresh({ refreshToken, clientId }) {
    const entry = this.refreshTokens.get(refreshToken);
    if (!entry) throw Object.assign(new Error('Invalid refresh token'), { code: 'invalid_grant' });
    if (clientId && entry.clientId !== clientId) {
      throw Object.assign(new Error('Refresh token belongs to another client'), { code: 'invalid_grant' });
    }
    // Rotate, as OAuth 2.1 requires for public clients.
    this.refreshTokens.delete(refreshToken);
    return this.issueTokens(entry);
  }

  /**
   * Validate a presented bearer token. Returns the grant, or null.
   * `expectedResource` enforces audience binding.
   */
  validateAccessToken(token, expectedResource = null) {
    const entry = this.accessTokens.get(token);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.accessTokens.delete(token);
      return null;
    }
    if (expectedResource && entry.resource) {
      // Compare host+path, ignoring a trailing slash.
      const norm = (u) => String(u).replace(/\/$/, '').toLowerCase();
      if (norm(entry.resource) !== norm(expectedResource)) return null;
    }
    return entry;
  }

  stats() {
    return {
      clients: this.clients.size,
      activeCodes: this.codes.size,
      accessTokens: this.accessTokens.size,
      refreshTokens: this.refreshTokens.size
    };
  }
}

/**
 * Mount the discovery documents and OAuth endpoints.
 */
export function mountOAuth(app, { ownerToken, provider } = {}) {
  const oauth = provider || new OAuthProvider({ ownerToken });

  const metadataFor = (req) => {
    const base = baseUrlFrom(req);
    return {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['mcp'],
      service_documentation: `${base}/mcp/health`
    };
  };

  // RFC 8414. Clients probe the bare path and sometimes a path-suffixed
  // variant derived from the MCP URL, so serve both.
  const asMetadata = (req, res) => res.json(metadataFor(req));
  app.get('/.well-known/oauth-authorization-server', asMetadata);
  app.get('/.well-known/oauth-authorization-server/*', asMetadata);

  // RFC 9728 - the resource pointing at its authorization server.
  const prMetadata = (req, res) => {
    const base = baseUrlFrom(req);
    res.json({
      resource: `${base}/mcp/sse`,
      authorization_servers: [base],
      scopes_supported: ['mcp'],
      bearer_methods_supported: ['header']
    });
  };
  app.get('/.well-known/oauth-protected-resource', prMetadata);
  app.get('/.well-known/oauth-protected-resource/*', prMetadata);

  // RFC 7591 dynamic client registration.
  app.post('/oauth/register', (req, res) => {
    try {
      const client = oauth.registerClient(req.body || {});
      res.status(201).json(client);
    } catch (error) {
      logger.warn(`OAuth registration rejected: ${error.message}`);
      res.status(400).json({
        error: error.code || 'invalid_client_metadata',
        error_description: error.message
      });
    }
  });

  // Consent screen. The owner proves ownership with MCP_AUTH_TOKEN.
  app.get('/oauth/authorize', (req, res) => {
    const {
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: method,
      state,
      resource,
      scope
    } = req.query;

    const client = oauth.clients.get(clientId);
    if (!client) {
      return res.status(400).send(renderError('Unknown client', 'Register the client first.'));
    }
    if (!client.redirect_uris.includes(redirectUri)) {
      return res.status(400).send(renderError('redirect_uri mismatch', 'It must exactly match a registered URI.'));
    }
    if (!codeChallenge || method !== 'S256') {
      return res.status(400).send(renderError('PKCE required', 'code_challenge with S256 is mandatory.'));
    }

    res.type('html').send(renderConsent({
      clientName: client.client_name,
      params: { clientId, redirectUri, codeChallenge, state, resource, scope }
    }));
  });

  app.post('/oauth/authorize', (req, res) => {
    const {
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      state,
      resource,
      scope,
      owner_token: presented
    } = req.body || {};

    const client = oauth.clients.get(clientId);
    if (!client || !client.redirect_uris.includes(redirectUri)) {
      return res.status(400).send(renderError('Invalid request', 'Unknown client or redirect_uri.'));
    }

    if (!safeEqual(presented, ownerToken)) {
      logger.warn(`🔒 Rejected OAuth consent with a bad owner token from ${req.ip}`);
      return res.status(401).type('html').send(
        renderConsent({
          clientName: client.client_name,
          params: { clientId, redirectUri, codeChallenge, state, resource, scope },
          error: 'That token was not correct.'
        })
      );
    }

    const code = oauth.issueCode({ clientId, redirectUri, codeChallenge, resource, scope });
    const target = new URL(redirectUri);
    target.searchParams.set('code', code);
    if (state) target.searchParams.set('state', state);

    logger.info(`🔑 OAuth code issued to ${clientId}`);
    res.redirect(target.toString());
  });

  app.post('/oauth/token', (req, res) => {
    const {
      grant_type: grantType,
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
      refresh_token: refreshToken,
      resource
    } = req.body || {};

    try {
      if (grantType === 'authorization_code') {
        const tokens = oauth.exchangeCode({ code, clientId, redirectUri, codeVerifier, resource });
        logger.info(`🔑 OAuth access token issued to ${clientId}`);
        return res.json(tokens);
      }
      if (grantType === 'refresh_token') {
        return res.json(oauth.refresh({ refreshToken, clientId }));
      }
      return res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: `Unsupported grant_type: ${grantType}`
      });
    } catch (error) {
      logger.warn(`OAuth token request rejected: ${error.message}`);
      return res.status(400).json({
        error: error.code || 'invalid_request',
        error_description: error.message
      });
    }
  });

  logger.info('🔑 OAuth 2.1 endpoints mounted (discovery, registration, authorize, token)');
  return oauth;
}

function renderPage(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         max-width: 30rem; margin: 4rem auto; padding: 0 1.5rem; line-height: 1.6; }
  h1 { font-size: 1.35rem; margin-bottom: .25rem; }
  p { color: #566; }
  form { display: flex; flex-direction: column; gap: .75rem; margin-top: 1.5rem; }
  input[type=password] { padding: .7rem; font-size: 1rem; border: 1px solid #bbc; border-radius: 6px; }
  button { padding: .7rem; font-size: 1rem; border: 0; border-radius: 6px;
           background: #1B4F8A; color: #fff; cursor: pointer; }
  .err { color: #a3372f; font-weight: 600; }
  .app { font-weight: 600; }
</style></head><body>${body}</body></html>`;
}

function renderConsent({ clientName, params, error }) {
  const hidden = Object.entries({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    code_challenge: params.codeChallenge,
    state: params.state,
    resource: params.resource,
    scope: params.scope
  })
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${escapeHtml(v)}">`)
    .join('');

  return renderPage(
    'Connect to HustleBot',
    `<h1>Connect <span class="app">${escapeHtml(clientName)}</span> to HustleBot?</h1>
     <p>This grants access to your platform tools, including ones that spend money and send email.
        Consequential actions will still ask for approval.</p>
     ${error ? `<p class="err">${escapeHtml(error)}</p>` : ''}
     <form method="POST" action="/oauth/authorize">
       ${hidden}
       <label for="owner_token">Paste your MCP access token</label>
       <input id="owner_token" type="password" name="owner_token" autocomplete="off" autofocus required>
       <button type="submit">Authorize</button>
     </form>`
  );
}

function renderError(title, detail) {
  return renderPage(title, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p>`);
}

export { OAuthProvider, verifyPkce, baseUrlFrom };
