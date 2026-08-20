/**
 * Generic MCP adapter: connect → list tools → normalize → invoke.
 * Uses the installed MCP SDK. In-process transport for the local server;
 * Streamable HTTP when an endpoint is configured.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import logger from '../utils/logger.js';
import { classifyDiscoveredTool, schemaIsValid } from './classify.js';
import { COST_CLASS, SOURCE_TYPE, TOOL_HEALTH, createToolDescriptor, sanitizeToolId } from './descriptor.js';
import { applyPolicy } from './policy.js';
import { connectLocalMcp } from './local-mcp.js';

function parseToolResult(result) {
  const texts = (result?.content || [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .filter(Boolean);
  const joined = texts.join('\n');
  try {
    return JSON.parse(joined);
  } catch {
    return { text: joined, isError: result?.isError === true };
  }
}

export class McpAdapter {
  constructor() {
    this.sessions = new Map();
  }

  async connect(serverRecord) {
    const id = serverRecord.serverId;
    if (this.sessions.has(id)) return this.sessions.get(id);

    if (serverRecord.transport === 'http' && serverRecord.endpoint) {
      const client = new Client({ name: 'hustlebot-fabric', version: '1.0.0' });
      const transport = new StreamableHTTPClientTransport(new URL(serverRecord.endpoint));
      await client.connect(transport);
      const session = { client, transport, kind: 'http' };
      this.sessions.set(id, session);
      return session;
    }

    const local = await connectLocalMcp();
    const client = new Client({ name: 'hustlebot-fabric', version: '1.0.0' });
    await client.connect(local.clientTransport);
    const session = { client, ...local, kind: 'inprocess' };
    this.sessions.set(id, session);
    return session;
  }

  async listTools(serverRecord) {
    const session = await this.connect(serverRecord);
    const listed = await session.client.listTools();
    const tools = Array.isArray(listed?.tools) ? listed.tools : [];
    return tools.map((tool) => this.normalize(serverRecord, tool));
  }

  normalize(serverRecord, tool) {
    if (!schemaIsValid(tool.inputSchema)) {
      return applyPolicy(createToolDescriptor({
        toolId: `mcp.${sanitizeToolId(serverRecord.serverId)}.invalid`,
        sourceType: SOURCE_TYPE.MCP,
        sourceId: serverRecord.serverId,
        name: tool.name || 'invalid',
        description: 'Rejected: invalid input schema',
        inputSchema: null,
        provider: `mcp:${serverRecord.name || serverRecord.serverId}`,
        health: TOOL_HEALTH.UNVERIFIED,
        costClass: COST_CLASS.FREE
      }));
    }
    const classified = classifyDiscoveredTool(tool);
    const descriptor = createToolDescriptor({
      toolId: `mcp.${sanitizeToolId(serverRecord.name || serverRecord.serverId)}.${sanitizeToolId(tool.name)}`,
      sourceType: SOURCE_TYPE.MCP,
      sourceId: serverRecord.serverId,
      name: tool.name,
      description: String(tool.description || '').slice(0, 500),
      inputSchema: tool.inputSchema || { type: 'object', properties: {} },
      tags: ['mcp', 'dynamic'],
      provider: `mcp:${serverRecord.name || serverRecord.serverId}`,
      sideEffect: classified.sideEffect,
      approvalRequired: classified.approvalRequired,
      costClass: COST_CLASS.FREE,
      timeout: 8000,
      health: TOOL_HEALTH.UNVERIFIED,
      classificationReason: classified.reason
    });
    descriptor.mcpName = tool.name;
    return applyPolicy(descriptor);
  }

  async callTool(serverRecord, toolName, args = {}) {
    const session = await this.connect(serverRecord);
    const result = await session.client.callTool({ name: toolName, arguments: args || {} });
    if (result?.isError) {
      return { status: 'failed', error: parseToolResult(result).error || 'mcp tool error', fabricated: false };
    }
    return { status: 'ok', result: parseToolResult(result), provider: `mcp:${serverRecord.name}`, fabricated: false };
  }

  async close(serverId) {
    const session = this.sessions.get(serverId);
    if (!session) return;
    try { await session.client?.close?.(); } catch (error) {
      logger.warn(`MCP client close: ${error.message}`);
    }
    this.sessions.delete(serverId);
  }
}
