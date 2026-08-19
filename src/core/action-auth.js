/**
 * Action-taking HTTP auth.
 *
 * Smallest architecture-consistent lock for capability invoke / NL chat
 * / acquisition run. Telegram and in-process execution are unaffected.
 *
 * Tokens (first present wins):
 *   HUSTLEBOT_ACTION_TOKEN
 *   INTERNAL_API_KEY
 *   MCP_AUTH_TOKEN
 *
 * Callers may present the token as:
 *   Authorization: Bearer <token>
 *   x-hustlebot-key: <token>
 *   x-internal-token: <token>
 *
 * Production / Render fail closed when no token is configured.
 * Local development may allow loopback only when no token is set.
 */

import crypto from 'node:crypto';
import logger from '../utils/logger.js';

const TOKEN_ENV = ['HUSTLEBOT_ACTION_TOKEN', 'INTERNAL_API_KEY', 'MCP_AUTH_TOKEN'];

export function resolveActionToken() {
  for (const name of TOKEN_ENV) {
    const value = process.env[name];
    if (value && String(value).trim()) return String(value).trim();
  }
  return null;
}

export function isProductionLike() {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.RENDER === 'true' ||
    Boolean(process.env.RENDER_GIT_COMMIT)
  );
}

export function extractPresentedToken(req) {
  const headerAuth = req.headers?.authorization || req.headers?.Authorization || '';
  if (typeof headerAuth === 'string' && /^Bearer\s+/i.test(headerAuth)) {
    return headerAuth.replace(/^Bearer\s+/i, '').trim();
  }
  const hustle = req.headers?.['x-hustlebot-key'];
  if (hustle) return String(hustle).trim();
  const internal = req.headers?.['x-internal-token'];
  if (internal) return String(internal).trim();
  return null;
}

export function isLoopbackAddress(ip) {
  if (!ip) return false;
  const cleaned = String(ip).replace(/^::ffff:/, '');
  return cleaned === '127.0.0.1' || cleaned === '::1' || cleaned === 'localhost';
}

function tokenFingerprint(token) {
  if (!token) return null;
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 12);
}

export function tokensMatch(presented, expected) {
  if (!presented || !expected) return false;
  const a = Buffer.from(String(presented));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function logSecurityEvent(event) {
  const safe = {
    at: new Date().toISOString(),
    event: event.event,
    path: event.path,
    method: event.method,
    status: event.status,
    actor: event.actor || 'http',
    ip: event.ip || null,
    capabilityId: event.capabilityId || null,
    tokenFp: event.tokenFp || null,
    reason: event.reason || null
  };
  logger.info(`🔐 security ${safe.event} ${safe.method || ''} ${safe.path || ''} ${safe.status || ''} ${safe.reason || ''}`.trim());
}

/**
 * Express middleware. Does not wrap Telegram webhooks.
 */
export function requireActionAuth(options = {}) {
  const realm = options.realm || 'hustlebot-actions';

  return function actionAuthMiddleware(req, res, next) {
    const expected = resolveActionToken();
    const presented = extractPresentedToken(req);
    const ip = req.ip || req.socket?.remoteAddress;
    const tokenFp = tokenFingerprint(presented);
    const meta = {
      path: req.path,
      method: req.method,
      ip,
      actor: req.headers?.['x-actor'] || 'http',
      capabilityId: req.params?.capabilityId || null,
      tokenFp
    };

    if (!expected) {
      if (!isProductionLike() && isLoopbackAddress(ip) && options.allowLocalUnauthenticated !== false) {
        logSecurityEvent({ ...meta, event: 'auth.local_loopback', status: 200, reason: 'no token configured' });
        req.actionAuth = { mode: 'loopback', actor: 'local' };
        return next();
      }
      logSecurityEvent({ ...meta, event: 'auth.misconfigured', status: 503, reason: 'no action token configured' });
      return res.status(503).json({
        error: 'Action endpoints are locked until an action token is configured',
        code: 'ACTION_AUTH_MISCONFIGURED'
      });
    }

    if (!presented) {
      logSecurityEvent({ ...meta, event: 'auth.missing', status: 401, reason: 'no token presented' });
      res.setHeader('WWW-Authenticate', `Bearer realm="${realm}"`);
      return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED' });
    }

    if (!tokensMatch(presented, expected)) {
      logSecurityEvent({ ...meta, event: 'auth.rejected', status: 403, reason: 'token mismatch' });
      return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    logSecurityEvent({ ...meta, event: 'auth.ok', status: 200 });
    req.actionAuth = { mode: 'token', actor: meta.actor, tokenFp };
    return next();
  };
}

/**
 * In-memory sliding-window limiter for action routes.
 */
export function rateLimitActions({ windowMs = 60_000, max = 30, keyFn } = {}) {
  const hits = new Map();

  function prune(now) {
    for (const [key, stamps] of hits.entries()) {
      const kept = stamps.filter((t) => now - t < windowMs);
      if (kept.length === 0) hits.delete(key);
      else hits.set(key, kept);
    }
  }

  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    if (hits.size > 500) prune(now);
    const key = (keyFn ? keyFn(req) : null)
      || req.actionAuth?.tokenFp
      || req.ip
      || 'anon';
    const stamps = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (stamps.length >= max) {
      logSecurityEvent({
        event: 'rate.limited',
        path: req.path,
        method: req.method,
        status: 429,
        ip: req.ip,
        reason: `max ${max} per ${windowMs}ms`
      });
      res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ error: 'Too many action requests', code: 'RATE_LIMITED' });
    }
    stamps.push(now);
    hits.set(key, stamps);
    return next();
  };
}

export { TOKEN_ENV };
