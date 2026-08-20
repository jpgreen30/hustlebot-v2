/**
 * Dynamic tool fabric. Discovers MCP/n8n/native tools, classifies them,
 * and registers planner-visible capabilities onto the existing registry.
 */

import logger from '../utils/logger.js';
import { SIDE_EFFECT } from '../objective/catalogue.js';
import { inspectCatalogue } from '../objective/catalogue.js';
import { COST_CLASS, POLICY_STATE, SOURCE_TYPE, TOOL_HEALTH, expectedFromCostClass } from './descriptor.js';
import { McpServerRegistry } from './mcp-registry.js';
import { McpAdapter } from './mcp-adapter.js';
import { discoverN8nWorkflows } from './n8n-discover.js';
import { isPlannerVisible, operatorDisable } from './policy.js';

const LOCAL_SERVER = {
  serverId: 'hustlebot-local',
  name: 'hustlebot-local',
  transport: 'inprocess',
  enabled: true
};

export class ToolFabric {
  constructor({ registry, n8n, mcpRegistry, adapter } = {}) {
    this.registry = registry || null;
    this.n8n = n8n || null;
    this.mcpRegistry = mcpRegistry || new McpServerRegistry();
    this.adapter = adapter || new McpAdapter();
    this.tools = new Map();
    this.forcedDown = new Set();
    this.lastRefresh = null;
  }

  boot() {
    this.mcpRegistry.register(LOCAL_SERVER);
    return this.refresh();
  }

  snapshot() {
    return [...this.tools.values()];
  }

  get(toolId) {
    return this.tools.get(toolId) || null;
  }

  inspect(query = '') {
    const q = String(query || '').toLowerCase();
    const tools = this.snapshot();
    const servers = this.mcpRegistry.list();
    if (/mcp server/i.test(query) || (/connected/i.test(query) && /mcp/i.test(query))) {
      return {
        kind: 'mcp-servers',
        report: servers.length
          ? servers.map((s) => `${s.name} (${s.transport}) health=${s.health} tools=${s.toolCount}`).join('\n')
          : 'No MCP servers registered.',
        servers
      };
    }
    if (/apollo/i.test(query) && /health/i.test(query) && this.registry) {
      const catalogue = inspectCatalogue(this.registry, { availableOnly: false, healthOverlay: this.healthOverlay() });
      const apollo = catalogue.flatMap((c) => (c.providers || []).filter((p) => /apollo/i.test(p.provider)));
      return {
        kind: 'provider-health',
        report: apollo.length
          ? apollo.map((p) => `apollo ${p.health} available=${p.available}`).join('\n')
          : 'Apollo is not registered.',
        providers: apollo
      };
    }
    if (/refresh/i.test(query)) {
      return { kind: 'refresh-request', report: 'Call fabric.refresh to rediscover tools.' };
    }
    const listAll = !q || /what tools|which tools|list .*tools|tool catalogue|capabilities/i.test(query);
    const filtered = listAll
      ? tools.filter(isPlannerVisible)
      : tools.filter((t) => `${t.toolId} ${t.name} ${t.description} ${t.provider}`.toLowerCase().includes(q));
    const native = this.registry
      ? inspectCatalogue(this.registry, { availableOnly: true, healthOverlay: this.healthOverlay() })
          .slice(0, 40)
          .map((c) => `${c.capabilityId} · ${c.preferredProvider} · ${c.health} · ${c.costClass}`)
      : [];
    return {
      kind: 'tools',
      report: [
        filtered.slice(0, 40).map((t) =>
          `${t.toolId} · ${t.sideEffect} · ${t.health} · ${t.costClass} · ${t.policyState}`
        ).join('\n') || 'No matching dynamic tools.',
        native.length ? `\nNative capabilities:\n${native.join('\n')}` : ''
      ].join('\n').trim(),
      tools: filtered
    };
  }

  healthOverlay() {
    const overlay = {};
    for (const provider of this.forcedDown) overlay[provider] = TOOL_HEALTH.UNAVAILABLE;
    return overlay;
  }

  forceProviderDown(provider) {
    this.forcedDown.add(provider);
  }

  restoreProvider(provider) {
    this.forcedDown.delete(provider);
  }

  async refresh(serverId) {
    const servers = serverId
      ? [this.mcpRegistry.get(serverId)].filter(Boolean)
      : this.mcpRegistry.list().filter((s) => s.enabled !== false);
    const discovered = [];
    for (const server of servers) {
      try {
        const tools = await this.adapter.listTools(server);
        this.mcpRegistry.register({
          ...server,
          health: TOOL_HEALTH.HEALTHY,
          lastDiscovery: new Date().toISOString(),
          toolCount: tools.length
        });
        for (const tool of tools) {
          this.tools.set(tool.toolId, tool);
          this.syncRegistry(tool);
          discovered.push(tool);
        }
      } catch (error) {
        logger.warn(`MCP discover failed for ${server.serverId}: ${error.message}`);
        this.mcpRegistry.register({ ...server, health: TOOL_HEALTH.UNAVAILABLE });
      }
    }
    for (const n8nTool of discoverN8nWorkflows(this.n8n)) {
      this.tools.set(n8nTool.toolId, n8nTool);
      this.syncRegistry(n8nTool);
      discovered.push(n8nTool);
    }
    this.lastRefresh = new Date().toISOString();
    return {
      status: 'ok',
      refreshedAt: this.lastRefresh,
      discovered: discovered.length,
      visible: discovered.filter(isPlannerVisible).length,
      quarantined: discovered.filter((t) => t.policyState === POLICY_STATE.QUARANTINED).length
    };
  }

  syncRegistry(descriptor) {
    if (!this.registry?.register) return;
    const visible = isPlannerVisible(descriptor);
    const toolId = descriptor.toolId;
    this.registry.register({
      capabilityId: toolId,
      name: descriptor.name,
      description: descriptor.description,
      provider: descriptor.provider,
      permissions: descriptor.sideEffect === SIDE_EFFECT.READ_ONLY ? ['network.read'] : ['network.read', 'data.write'],
      inputs: descriptor.inputSchema,
      expectedCost: expectedFromCostClass(descriptor.costClass),
      expectedLatencyMs: descriptor.timeout,
      sideEffect: descriptor.sideEffect,
      requiresApproval: descriptor.approvalRequired,
      tags: descriptor.tags,
      costCategory: String(descriptor.costClass || COST_CLASS.UNKNOWN).toLowerCase(),
      handler: (input, context) => this.invoke(toolId, input, context),
      isAvailable: () => visible
        && !this.forcedDown.has(descriptor.provider)
        && descriptor.enabled !== false
        && descriptor.policyState === POLICY_STATE.APPROVED
    });
  }

  async invoke(toolId, input = {}, context = {}) {
    const tool = this.tools.get(toolId);
    if (!tool) return { status: 'failed', error: `unknown tool ${toolId}`, fabricated: false };
    if (tool.policyState === POLICY_STATE.DISABLED) {
      return { status: 'failed', error: `${toolId} is disabled`, fabricated: false };
    }
    if (tool.policyState === POLICY_STATE.QUARANTINED) {
      return { status: 'blocked', error: `${toolId} is quarantined`, fabricated: false };
    }
    if (this.forcedDown.has(tool.provider)) {
      return { status: 'unavailable', error: `${tool.provider} forced unavailable`, fabricated: false };
    }
    if (tool.approvalRequired && !input.approvalId && !context.bypassApproval) {
      return { status: 'blocked', error: `${toolId} requires ApprovalGate`, fabricated: false };
    }
    if (tool.sourceType === SOURCE_TYPE.MCP) {
      const server = this.mcpRegistry.get(tool.sourceId);
      if (!server) return { status: 'failed', error: 'MCP server missing', fabricated: false };
      return this.adapter.callTool(server, tool.mcpName || tool.name, input);
    }
    if (tool.sourceType === SOURCE_TYPE.N8N) {
      if (!this.n8n?.execute) return { status: 'unavailable', error: 'n8n not initialized', fabricated: false };
      const run = await this.n8n.execute(tool.sourceId, input.payload || input);
      return { status: run.status === 'executed' ? 'ok' : run.status, result: run, fabricated: false };
    }
    return { status: 'failed', error: `no invoker for ${tool.sourceType}`, fabricated: false };
  }

  disable(toolId) {
    const tool = this.tools.get(toolId);
    if (!tool) return null;
    const next = operatorDisable(tool);
    this.tools.set(toolId, next);
    this.syncRegistry(next);
    return next;
  }

  stats() {
    const all = this.snapshot();
    return {
      tools: all.length,
      visible: all.filter(isPlannerVisible).length,
      quarantined: all.filter((t) => t.policyState === POLICY_STATE.QUARANTINED).length,
      mcpServers: this.mcpRegistry.list().length,
      lastRefresh: this.lastRefresh
    };
  }
}

export function registerFabricCapabilities(registry, fabric) {
  if (!registry || !fabric) return;
  registry.registerAll([
    {
      capabilityId: 'mcp.discover',
      name: 'Discover MCP tools',
      description: 'List and normalize tools from registered MCP servers',
      provider: 'tool-fabric',
      permissions: ['data.read'],
      sideEffect: SIDE_EFFECT.READ_ONLY,
      tags: ['mcp', 'fabric'],
      expectedCost: 0,
      expectedLatencyMs: 400,
      handler: () => fabric.refresh(),
      isAvailable: () => true
    },
    {
      capabilityId: 'mcp.refresh',
      name: 'Refresh MCP catalogue',
      description: 'Rediscover tools without redeploying',
      provider: 'tool-fabric',
      permissions: ['data.write'],
      sideEffect: SIDE_EFFECT.LOW_RISK_WRITE,
      tags: ['mcp', 'fabric'],
      expectedCost: 0,
      expectedLatencyMs: 800,
      handler: (input) => fabric.refresh(input.serverId),
      isAvailable: () => true
    },
    {
      capabilityId: 'mcp.health',
      name: 'MCP server health',
      description: 'Health of registered MCP servers',
      provider: 'tool-fabric',
      permissions: ['data.read'],
      sideEffect: SIDE_EFFECT.READ_ONLY,
      tags: ['mcp', 'fabric'],
      expectedCost: 0,
      expectedLatencyMs: 40,
      handler: () => ({ servers: fabric.mcpRegistry.list(), stats: fabric.stats() }),
      isAvailable: () => true
    },
    {
      capabilityId: 'fabric.inspect',
      name: 'Inspect the tool fabric',
      description: 'List tools, MCP servers, health and cost class',
      provider: 'tool-fabric',
      permissions: ['data.read'],
      sideEffect: SIDE_EFFECT.READ_ONLY,
      tags: ['fabric'],
      expectedCost: 0,
      expectedLatencyMs: 40,
      handler: (input) => fabric.inspect(input.query || input.q || ''),
      isAvailable: () => true
    }
  ]);
  logger.info('✅ Tool fabric capabilities registered');
}
