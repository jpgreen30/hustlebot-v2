/**
 * HustleBot MCP Server
 * Exposes HustleBot factories, integrations, and mailbox as MCP tools
 * Allows Claude and other AI agents to use HustleBot capabilities
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

class HustleBotMCPServer {
  constructor(hustlebot) {
    this.hustlebot = hustlebot;
    this.server = new Server({
      name: 'hustlebot-mcp',
      version: '1.0.0',
    });
    this.setupHandlers();
  }

  setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getAvailableTools(),
      };
    });

    // Execute tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return this.executeTool(request.params.name, request.params.arguments);
    });
  }

  getAvailableTools() {
    return [
      // Content Generation Tools
      {
        name: 'generate_content',
        description: 'Generate content using ContentFactory (blog posts, emails, landing pages, social media, video scripts)',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['blog', 'email', 'landing', 'social', 'video'],
              description: 'Type of content to generate',
            },
            topic: {
              type: 'string',
              description: 'Topic or subject for the content',
            },
            audience: {
              type: 'string',
              description: 'Target audience',
            },
            tone: {
              type: 'string',
              description: 'Tone (professional, casual, creative, etc.)',
            },
            maxLength: {
              type: 'number',
              description: 'Maximum length in tokens (optional)',
            },
          },
          required: ['type', 'topic'],
        },
      },

      // Workflow Tools
      {
        name: 'create_workflow',
        description: 'Create and register a new workflow automation',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Workflow name',
            },
            description: {
              type: 'string',
              description: 'What the workflow does',
            },
            triggers: {
              type: 'array',
              items: { type: 'string' },
              description: 'Trigger events (e.g., "daily", "on_lead_capture")',
            },
            actions: {
              type: 'array',
              items: { type: 'string' },
              description: 'Actions to execute in sequence',
            },
          },
          required: ['name', 'description', 'triggers', 'actions'],
        },
      },

      {
        name: 'run_workflow',
        description: 'Execute a registered workflow',
        inputSchema: {
          type: 'object',
          properties: {
            workflowId: {
              type: 'string',
              description: 'ID of the workflow to run',
            },
            inputs: {
              type: 'object',
              description: 'Input parameters for the workflow',
            },
          },
          required: ['workflowId'],
        },
      },

      {
        name: 'list_workflows',
        description: 'List all registered workflows',
        inputSchema: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['active', 'inactive', 'all'],
              description: 'Filter by status',
            },
          },
        },
      },

      // Lead Management Tools
      {
        name: 'search_leads',
        description: 'Search for leads using LeadFactory',
        inputSchema: {
          type: 'object',
          properties: {
            industry: {
              type: 'string',
              description: 'Industry or niche to search',
            },
            location: {
              type: 'string',
              description: 'Geographic location',
            },
            companySize: {
              type: 'string',
              description: 'Company size (SMB, mid-market, enterprise)',
            },
            jobTitle: {
              type: 'string',
              description: 'Target job title',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results',
            },
          },
          required: ['industry'],
        },
      },

      {
        name: 'enrich_lead',
        description: 'Enrich lead data with additional information',
        inputSchema: {
          type: 'object',
          properties: {
            leadId: {
              type: 'string',
              description: 'Lead ID to enrich',
            },
            fields: {
              type: 'array',
              items: { type: 'string' },
              description: 'Additional fields to enrich (email, phone, company, etc.)',
            },
          },
          required: ['leadId'],
        },
      },

      // Mailbox Tools (Agent Communication)
      {
        name: 'send_message',
        description: 'Send a message to another AI agent via mailbox (ChatGPT, Grok, etc.)',
        inputSchema: {
          type: 'object',
          properties: {
            recipient: {
              type: 'string',
              description: 'Target agent (chatgpt, grok, claude, etc.)',
            },
            subject: {
              type: 'string',
              description: 'Message subject',
            },
            content: {
              type: 'string',
              description: 'Message content',
            },
            priority: {
              type: 'string',
              enum: ['low', 'normal', 'high', 'urgent'],
              description: 'Message priority',
            },
            metadata: {
              type: 'object',
              description: 'Additional metadata (optional)',
            },
          },
          required: ['recipient', 'subject', 'content'],
        },
      },

      {
        name: 'check_mailbox',
        description: 'Check mailbox for incoming messages from other agents',
        inputSchema: {
          type: 'object',
          properties: {
            agent: {
              type: 'string',
              description: 'Optional: check specific agent\'s messages',
            },
            limit: {
              type: 'number',
              description: 'Maximum messages to retrieve',
            },
          },
        },
      },

      {
        name: 'reply_to_message',
        description: 'Reply to a message from another agent',
        inputSchema: {
          type: 'object',
          properties: {
            messageId: {
              type: 'string',
              description: 'ID of the message to reply to',
            },
            content: {
              type: 'string',
              description: 'Reply content',
            },
          },
          required: ['messageId', 'content'],
        },
      },

      // Analytics Tools
      {
        name: 'get_analytics',
        description: 'Get analytics for content, leads, workflows, or revenue',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['content', 'leads', 'workflows', 'revenue'],
              description: 'Type of analytics',
            },
            timeRange: {
              type: 'string',
              description: 'Time range (7d, 30d, 90d, custom)',
            },
            filters: {
              type: 'object',
              description: 'Optional filters',
            },
          },
          required: ['type'],
        },
      },

      // Email Marketing Tools
      {
        name: 'send_campaign',
        description: 'Create and send email campaign',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Campaign name',
            },
            recipients: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of recipient lead IDs',
            },
            subject: {
              type: 'string',
              description: 'Email subject line',
            },
            body: {
              type: 'string',
              description: 'Email body content',
            },
            template: {
              type: 'string',
              description: 'Optional: template ID',
            },
          },
          required: ['name', 'recipients', 'subject', 'body'],
        },
      },

      // Knowledge Base Tools
      {
        name: 'add_knowledge',
        description: 'Add content to knowledge base',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Knowledge title',
            },
            content: {
              type: 'string',
              description: 'Knowledge content',
            },
            category: {
              type: 'string',
              description: 'Knowledge category',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tags for searchability',
            },
          },
          required: ['title', 'content'],
        },
      },

      {
        name: 'search_knowledge',
        description: 'Search knowledge base',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            category: {
              type: 'string',
              description: 'Optional: filter by category',
            },
            limit: {
              type: 'number',
              description: 'Maximum results',
            },
          },
          required: ['query'],
        },
      },

      // System Status
      {
        name: 'get_system_status',
        description: 'Get current system status (database, LLM, voice, storage, workflows, agents)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ];
  }

  async executeTool(name, args) {
    try {
      switch (name) {
        case 'generate_content':
          return await this.generateContent(args);
        case 'create_workflow':
          return await this.createWorkflow(args);
        case 'run_workflow':
          return await this.runWorkflow(args);
        case 'list_workflows':
          return await this.listWorkflows(args);
        case 'search_leads':
          return await this.searchLeads(args);
        case 'enrich_lead':
          return await this.enrichLead(args);
        case 'send_message':
          return await this.sendMessage(args);
        case 'check_mailbox':
          return await this.checkMailbox(args);
        case 'reply_to_message':
          return await this.replyToMessage(args);
        case 'get_analytics':
          return await this.getAnalytics(args);
        case 'send_campaign':
          return await this.sendCampaign(args);
        case 'add_knowledge':
          return await this.addKnowledge(args);
        case 'search_knowledge':
          return await this.searchKnowledge(args);
        case 'get_system_status':
          return await this.getSystemStatus(args);
        default:
          return { error: `Unknown tool: ${name}` };
      }
    } catch (error) {
      return { error: error.message };
    }
  }

  async generateContent(args) {
    if (!this.hustlebot.contentFactory) {
      return { error: 'Content factory not initialized' };
    }

    try {
      const result = await this.hustlebot.contentFactory.generate({
        type: args.type,
        topic: args.topic,
        audience: args.audience,
        tone: args.tone,
        maxTokens: args.maxLength || 2000,
      });

      return {
        success: true,
        type: args.type,
        content: result.content,
        tokens: result.tokens,
        cost: result.cost,
      };
    } catch (error) {
      return { error: `Content generation failed: ${error.message}` };
    }
  }

  async createWorkflow(args) {
    if (!this.hustlebot.workflowRegistry) {
      return { error: 'Workflow registry not initialized' };
    }

    try {
      const workflow = {
        name: args.name,
        description: args.description,
        triggers: args.triggers,
        actions: args.actions,
        createdAt: new Date().toISOString(),
      };

      const id = this.hustlebot.workflowRegistry.register(workflow);

      return {
        success: true,
        workflowId: id,
        workflow: workflow,
      };
    } catch (error) {
      return { error: `Workflow creation failed: ${error.message}` };
    }
  }

  async runWorkflow(args) {
    if (!this.hustlebot.workflowRegistry) {
      return { error: 'Workflow registry not initialized' };
    }

    try {
      const result = await this.hustlebot.workflowRegistry.execute(
        args.workflowId,
        args.inputs || {}
      );

      return {
        success: true,
        workflowId: args.workflowId,
        result: result,
      };
    } catch (error) {
      return { error: `Workflow execution failed: ${error.message}` };
    }
  }

  async listWorkflows(args) {
    if (!this.hustlebot.workflowRegistry) {
      return { error: 'Workflow registry not initialized' };
    }

    const workflows = Array.from(
      this.hustlebot.workflowRegistry.workflows?.values() || []
    );
    const filtered = args.status
      ? workflows.filter((w) => w.status === args.status)
      : workflows;

    return {
      success: true,
      count: filtered.length,
      workflows: filtered,
    };
  }

  async searchLeads(args) {
    if (!this.hustlebot.leadFactory) {
      return { error: 'Lead factory not initialized' };
    }

    try {
      const results = await this.hustlebot.leadFactory.search({
        industry: args.industry,
        location: args.location,
        companySize: args.companySize,
        jobTitle: args.jobTitle,
        limit: args.limit || 10,
      });

      return {
        success: true,
        count: results.length,
        leads: results,
      };
    } catch (error) {
      return { error: `Lead search failed: ${error.message}` };
    }
  }

  async enrichLead(args) {
    if (!this.hustlebot.leadFactory) {
      return { error: 'Lead factory not initialized' };
    }

    try {
      const enriched = await this.hustlebot.leadFactory.enrich(
        args.leadId,
        args.fields || []
      );

      return {
        success: true,
        leadId: args.leadId,
        data: enriched,
      };
    } catch (error) {
      return { error: `Lead enrichment failed: ${error.message}` };
    }
  }

  async sendMessage(args) {
    if (!this.hustlebot.mailbox) {
      return { error: 'Mailbox not initialized' };
    }

    try {
      const messageId = this.hustlebot.mailbox.send({
        from: 'claude',
        to: args.recipient,
        subject: args.subject,
        content: args.content,
        priority: args.priority || 'normal',
        metadata: args.metadata || {},
      });

      return {
        success: true,
        messageId: messageId,
        recipient: args.recipient,
        subject: args.subject,
      };
    } catch (error) {
      return { error: `Message send failed: ${error.message}` };
    }
  }

  async checkMailbox(args) {
    if (!this.hustlebot.mailbox) {
      return { error: 'Mailbox not initialized' };
    }

    try {
      const messages = this.hustlebot.mailbox.getMessages(
        args.agent || 'claude',
        args.limit || 10
      );

      return {
        success: true,
        agent: args.agent || 'claude',
        count: messages.length,
        messages: messages,
      };
    } catch (error) {
      return { error: `Mailbox check failed: ${error.message}` };
    }
  }

  async replyToMessage(args) {
    if (!this.hustlebot.mailbox) {
      return { error: 'Mailbox not initialized' };
    }

    try {
      const replyId = this.hustlebot.mailbox.reply(
        args.messageId,
        args.content
      );

      return {
        success: true,
        replyId: replyId,
        inReplyTo: args.messageId,
      };
    } catch (error) {
      return { error: `Reply failed: ${error.message}` };
    }
  }

  async getAnalytics(args) {
    if (!this.hustlebot.analyticsEngine) {
      return { error: 'Analytics engine not initialized' };
    }

    try {
      const analytics = await this.hustlebot.analyticsEngine.get(
        args.type,
        args.timeRange || '30d',
        args.filters || {}
      );

      return {
        success: true,
        type: args.type,
        timeRange: args.timeRange || '30d',
        data: analytics,
      };
    } catch (error) {
      return { error: `Analytics fetch failed: ${error.message}` };
    }
  }

  async sendCampaign(args) {
    if (!this.hustlebot.emailIntegration) {
      return { error: 'Email integration not initialized' };
    }

    try {
      const campaignId = await this.hustlebot.emailIntegration.sendCampaign({
        name: args.name,
        recipients: args.recipients,
        subject: args.subject,
        body: args.body,
        template: args.template,
      });

      return {
        success: true,
        campaignId: campaignId,
        recipientCount: args.recipients.length,
      };
    } catch (error) {
      return { error: `Campaign send failed: ${error.message}` };
    }
  }

  async addKnowledge(args) {
    if (!this.hustlebot.knowledgeFactory) {
      return { error: 'Knowledge factory not initialized' };
    }

    try {
      const id = await this.hustlebot.knowledgeFactory.add({
        title: args.title,
        content: args.content,
        category: args.category,
        tags: args.tags || [],
      });

      return {
        success: true,
        knowledgeId: id,
        title: args.title,
      };
    } catch (error) {
      return { error: `Knowledge add failed: ${error.message}` };
    }
  }

  async searchKnowledge(args) {
    if (!this.hustlebot.knowledgeFactory) {
      return { error: 'Knowledge factory not initialized' };
    }

    try {
      const results = await this.hustlebot.knowledgeFactory.search(
        args.query,
        args.category,
        args.limit || 10
      );

      return {
        success: true,
        query: args.query,
        count: results.length,
        results: results,
      };
    } catch (error) {
      return { error: `Knowledge search failed: ${error.message}` };
    }
  }

  async getSystemStatus(args) {
    const status = {
      database: this.hustlebot.db ? '✅ Connected' : '⚠️ Disconnected',
      llm: this.hustlebot.llm ? '✅ Ready' : '⚠️ Unavailable',
      voice: this.hustlebot.voice ? '✅ Active' : '⚠️ Unavailable',
      storage: this.hustlebot.providers ? '✅ Ready' : '⚠️ Unavailable',
      workflows: this.hustlebot.workflowRegistry ? '✅ Active' : '⚠️ Inactive',
      agents: this.hustlebot.voiceConversationAgent ? '✅ Ready' : '⚠️ Unavailable',
      mailbox: this.hustlebot.mailbox ? '✅ Ready' : '⚠️ Unavailable',
    };

    return {
      success: true,
      status: status,
      timestamp: new Date().toISOString(),
    };
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('[MCP] HustleBot MCP Server started');
  }
}

export { HustleBotMCPServer };
