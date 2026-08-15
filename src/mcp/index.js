/**
 * HustleBot MCP Server Entry Point
 * Run this to start the MCP server for Claude integration
 *
 * Usage:
 *   node src/mcp/index.js
 */

import 'dotenv/config';
import { HustleBotMCPServer } from './server.js';

// Simple mock HustleBot instance for standalone MCP server
// In production, this would be imported from the main server
const createMockHustleBot = () => {
  return {
    db: null,
    llm: null,
    voice: null,
    providers: null,
    workflowRegistry: {
      workflows: new Map(),
      register: (workflow) => {
        const id = `wf_${Date.now()}`;
        workflow.id = id;
        this.workflows.set(id, workflow);
        return id;
      },
      execute: async (id, inputs) => {
        const workflow = this.workflows.get(id);
        if (!workflow) throw new Error('Workflow not found');
        return { success: true, workflowId: id, result: {} };
      },
    },
    contentFactory: {
      generate: async (config) => {
        return {
          content: `Generated ${config.type} about ${config.topic}`,
          tokens: { input: 100, output: 500 },
          cost: 0.01,
        };
      },
    },
    leadFactory: {
      search: async (criteria) => {
        return [
          {
            id: 'lead_001',
            name: 'Sample Lead',
            company: 'Sample Corp',
            industry: criteria.industry,
          },
        ];
      },
      enrich: async (leadId, fields) => {
        return { leadId, enrichedFields: fields };
      },
    },
    mailbox: {
      send: (msg) => {
        const id = `msg_${Date.now()}`;
        console.log(`[Mailbox] Message sent to ${msg.to}: ${msg.subject}`);
        return id;
      },
      getMessages: (agent, limit) => {
        return [];
      },
      reply: (messageId, content) => {
        const id = `reply_${Date.now()}`;
        console.log(`[Mailbox] Reply sent to message ${messageId}`);
        return id;
      },
    },
    analyticsEngine: {
      get: async (type, timeRange, filters) => {
        return {
          type,
          timeRange,
          metrics: {},
        };
      },
    },
    emailIntegration: null,
    knowledgeFactory: null,
    voiceConversationAgent: null,
  };
};

async function main() {
  try {
    console.log('[MCP] Starting HustleBot MCP Server...');
    const hustlebot = createMockHustleBot();
    const mcpServer = new HustleBotMCPServer(hustlebot);
    await mcpServer.start();
    console.log('[MCP] Server ready for Claude connection');
  } catch (error) {
    console.error('[MCP] Fatal error:', error);
    process.exit(1);
  }
}

main();
