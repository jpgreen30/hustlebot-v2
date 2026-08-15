/**
 * REMOTE MCP ENDPOINT (HTTP + SSE)
 *
 * The MCP server also speaks stdio (see index.js), but stdio only works for
 * a client that can spawn the process on the same machine. This mounts the
 * same tool surface on the running web service so remote clients - Claude
 * with a custom connector, ChatGPT, anything that speaks remote MCP - can
 * reach it over the public URL.
 *
 *   GET  /mcp/sse       opens the event stream and announces the POST path
 *   POST /mcp/messages  carries client messages, routed by sessionId
 *   GET  /mcp/health    unauthenticated liveness for the connector UI
 *
 * Two things this deliberately does NOT do:
 *
 * 1. Mount without a token. These tools spend money and send email. If
 *    MCP_AUTH_TOKEN is unset the endpoint refuses to mount rather than
 *    exposing the platform to the open internet.
 * 2. Share one MCP Server across clients. An SDK Server binds to a single
 *    transport, so each SSE connection gets its own server instance over
 *    the same HustleBot services.
 */

import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { timingSafeEqual } from 'crypto';
import logger from '../utils/logger.js';
import { HustleBotMCPServer } from './server.js';

const MESSAGE_PATH = '/mcp/messages';

/** Constant-time compare so the token can't be guessed by timing. */
function tokenMatches(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  // Some connector UIs can only pass a query parameter.
  if (typeof req.query?.token === 'string') return req.query.token;
  return null;
}

/**
 * @param {import('express').Express} app
 * @param {object} hustlebot  the running server, for tool handlers
 * @param {object} options    { token }
 */
export function mountMcpEndpoint(app, hustlebot, options = {}) {
  const token = options.token || process.env.MCP_AUTH_TOKEN;

  if (!token) {
    logger.warn(
      '⚠️  MCP_AUTH_TOKEN is not set - the remote MCP endpoint will NOT be mounted. ' +
      'Set it to expose tools at /mcp/sse.'
    );
    return { mounted: false, reason: 'MCP_AUTH_TOKEN not set' };
  }

  if (token.length < 24) {
    logger.warn(
      '⚠️  MCP_AUTH_TOKEN is shorter than 24 characters - the remote MCP endpoint will NOT be mounted. ' +
      'Use a long random value.'
    );
    return { mounted: false, reason: 'MCP_AUTH_TOKEN too short' };
  }

  // sessionId -> { transport, server, openedAt }
  const sessions = new Map();

  const requireAuth = (req, res, next) => {
    if (!tokenMatches(extractToken(req), token)) {
      logger.warn(`🔒 Rejected unauthenticated MCP request from ${req.ip}`);
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  };

  // Unauthenticated, deliberately: lets a connector confirm the endpoint
  // exists without revealing anything about the tools.
  app.get('/mcp/health', (req, res) => {
    res.json({
      status: 'ok',
      transport: 'sse',
      sse: '/mcp/sse',
      messages: MESSAGE_PATH,
      activeSessions: sessions.size,
      authRequired: true
    });
  });

  app.get('/mcp/sse', requireAuth, async (req, res) => {
    try {
      const transport = new SSEServerTransport(MESSAGE_PATH, res);
      // One server per connection - an SDK Server binds a single transport.
      const mcp = new HustleBotMCPServer(hustlebot);

      sessions.set(transport.sessionId, { transport, server: mcp, openedAt: Date.now() });
      logger.info(`🔌 MCP client connected: ${transport.sessionId} (${sessions.size} active)`);

      const drop = () => {
        if (sessions.delete(transport.sessionId)) {
          logger.info(`🔌 MCP client disconnected: ${transport.sessionId} (${sessions.size} active)`);
        }
      };
      transport.onclose = drop;
      transport.onerror = (error) => {
        logger.error(`MCP transport error (${transport.sessionId}): ${error.message}`);
      };
      res.on('close', drop);

      // Some proxies buffer SSE without this.
      res.setHeader('X-Accel-Buffering', 'no');

      // connect() calls transport.start(), which writes the SSE headers.
      await mcp.server.connect(transport);
    } catch (error) {
      logger.error(`Failed to open MCP session: ${error.message}`);
      if (!res.headersSent) res.status(500).json({ error: error.message });
    }
  });

  app.post(MESSAGE_PATH, requireAuth, async (req, res) => {
    const sessionId = req.query.sessionId;
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId query parameter is required' });
      return;
    }

    const session = sessions.get(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Unknown or expired session - reconnect to /mcp/sse' });
      return;
    }

    try {
      // Reads the raw request stream, which is why this path must bypass
      // express.json() - see the skip in setupMiddleware.
      await session.transport.handlePostMessage(req, res);
    } catch (error) {
      logger.error(`MCP message handling failed (${sessionId}): ${error.message}`);
      if (!res.headersSent) res.status(500).json({ error: error.message });
    }
  });

  logger.info('🔌 Remote MCP endpoint mounted at /mcp/sse (bearer token required)');
  return { mounted: true, sessions };
}

export { MESSAGE_PATH };
