#!/usr/bin/env node
/**
 * Smallest correct MCP tool validator.
 * Instantiates the MCP server with a stub host and checks every tool
 * has a name, description, and JSON-schema input.
 */
import { HustleBotMCPServer } from '../src/mcp/server.js';

const stub = {
  db: null,
  llm: null,
  voice: null,
  providers: null,
  capabilityRegistry: {
    list: () => [],
    describe: () => null,
    invoke: async () => ({ success: false })
  },
  workflowRegistry: { workflows: new Map() },
  contentFactory: {},
  leadFactory: {},
  mailbox: { send() {}, getMessages() { return []; }, reply() {} },
  analyticsEngine: {},
  approvalGate: null
};

const server = new HustleBotMCPServer(stub);
const tools = server.getAvailableTools();

if (!Array.isArray(tools) || tools.length === 0) {
  console.error('mcp:validate failed: no tools registered');
  process.exit(1);
}

const errors = [];
const names = new Set();
for (const tool of tools) {
  if (!tool?.name) errors.push('tool missing name');
  else if (names.has(tool.name)) errors.push(`duplicate tool name: ${tool.name}`);
  else names.add(tool.name);
  if (!tool?.description) errors.push(`${tool.name || '(unnamed)'} missing description`);
  if (!tool?.inputSchema || tool.inputSchema.type !== 'object') {
    errors.push(`${tool.name || '(unnamed)'} missing object inputSchema`);
  }
}

if (errors.length) {
  console.error('mcp:validate failed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`mcp:validate ok (${tools.length} tools)`);
