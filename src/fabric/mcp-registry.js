/**
 * Persistent MCP server registry. Auth material stays in env/secret storage
 * as authReference names only — never plaintext secrets.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const DEFAULT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../.data/mcp');

function newServerId() {
  return `mcp_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

export class McpServerRegistry {
  constructor(config = {}) {
    this.dir = config.dir || process.env.MCP_REGISTRY_DIR || DEFAULT_DIR;
    this.file = join(this.dir, 'servers.json');
    this.servers = new Map();
    this.load();
  }

  ensure() {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }

  load() {
    try {
      if (!existsSync(this.file)) return;
      const payload = JSON.parse(readFileSync(this.file, 'utf8'));
      for (const item of payload.servers || []) {
        if (item.serverId) this.servers.set(item.serverId, this.stripSecrets(item));
      }
    } catch {
      this.servers = new Map();
    }
  }

  persist() {
    this.ensure();
    writeFileSync(this.file, JSON.stringify({
      updatedAt: new Date().toISOString(),
      servers: this.list()
    }, null, 2));
  }

  stripSecrets(record) {
    const copy = { ...record };
    delete copy.authToken;
    delete copy.apiKey;
    delete copy.headers;
    delete copy.secret;
    return copy;
  }

  register(input = {}) {
    const now = new Date().toISOString();
    const existing = input.serverId ? this.servers.get(input.serverId) : null;
    const record = this.stripSecrets({
      serverId: input.serverId || existing?.serverId || newServerId(),
      name: input.name || existing?.name || 'mcp-server',
      transport: input.transport || existing?.transport || 'inprocess',
      endpoint: input.endpoint || existing?.endpoint || null,
      authReference: input.authReference || existing?.authReference || null,
      enabled: input.enabled !== false,
      health: input.health || existing?.health || 'UNVERIFIED',
      lastDiscovery: input.lastDiscovery || existing?.lastDiscovery || null,
      toolCount: input.toolCount ?? existing?.toolCount ?? 0,
      metadata: { ...(existing?.metadata || {}), ...(input.metadata || {}) },
      createdAt: existing?.createdAt || now,
      updatedAt: now
    });
    this.servers.set(record.serverId, record);
    this.persist();
    return record;
  }

  get(serverId) {
    return this.servers.get(serverId) || null;
  }

  list() {
    return [...this.servers.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  disable(serverId) {
    const record = this.get(serverId);
    if (!record) return null;
    return this.register({ ...record, enabled: false, health: 'DISABLED' });
  }
}
