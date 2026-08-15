/**
 * Telegram Command Center
 *
 * Main hub for all HustleBot operations via Telegram
 * - Inline commands for quick access
 * - Keyboard menus for navigation
 * - Status dashboards
 * - Workflow control
 */

import logger from '../utils/logger.js';

class TelegramCommandCenter {
  constructor(bot, server) {
    this.bot = bot;
    this.server = server;
  }

  async register() {
    logger.info('📍 Registering Telegram command center...');

    // Main menu command
    this.bot.command('menu', this.showMainMenu.bind(this));

    // Content operations
    this.bot.command('generate', async (ctx) => {
      await this.showContentMenu(ctx);
    });

    // Lead generation
    this.bot.command('leads', async (ctx) => {
      await this.showLeadsMenu(ctx);
    });

    // Workflows
    this.bot.command('workflows', async (ctx) => {
      await this.showWorkflowsMenu(ctx);
    });

    // Analytics
    this.bot.command('analytics', async (ctx) => {
      await this.showAnalyticsMenu(ctx);
    });

    // System status
    this.bot.command('system', async (ctx) => {
      await this.showSystemStatus(ctx);
    });

    // AI Agent Commands
    this.bot.command('agents', this.handleAgentsCommand.bind(this));
    this.bot.command('deepseek', this.handleDeepseekCommand.bind(this));
    this.bot.command('kimi', this.handleKimiCommand.bind(this));
    this.bot.command('chatgpt', this.handleChatgptCommand.bind(this));
    this.bot.command('grok', this.handleGrokCommand.bind(this));

    // Inline query for search
    this.bot.on('inline_query', this.handleInlineQuery.bind(this));

    // Callback queries for button presses
    this.bot.on('callback_query', this.handleCallbackQuery.bind(this));

    logger.info('✅ Command center registered');
  }

  async showMainMenu(ctx) {
    const keyboard = {
      inline_keyboard: [
        [
          { text: '📝 Generate Content', callback_data: 'menu:content' },
          { text: '🎯 Lead Generation', callback_data: 'menu:leads' }
        ],
        [
          { text: '🔄 Workflows', callback_data: 'menu:workflows' },
          { text: '📊 Analytics', callback_data: 'menu:analytics' }
        ],
        [
          { text: '🎙️ Voice Commands', callback_data: 'menu:voice' },
          { text: '⚙️ System Status', callback_data: 'menu:system' }
        ],
        [
          { text: '❓ Help', callback_data: 'menu:help' }
        ]
      ]
    };

    await ctx.reply(
      '🤖 *HustleBot v2 Command Center*\n\n' +
      'Choose an operation to get started:',
      { ...keyboard, parse_mode: 'Markdown' }
    );
  }

  async showContentMenu(ctx) {
    const keyboard = {
      inline_keyboard: [
        [
          { text: '✍️ Blog Post', callback_data: 'content:blog' },
          { text: '📧 Email Copy', callback_data: 'content:email' }
        ],
        [
          { text: '🌐 Landing Page', callback_data: 'content:landing' },
          { text: '📱 Social Media', callback_data: 'content:social' }
        ],
        [
          { text: '🎬 Video Script', callback_data: 'content:video' }
        ],
        [
          { text: '◀️ Back', callback_data: 'menu:main' }
        ]
      ]
    };

    await ctx.reply(
      '📝 *Content Generation*\n\n' +
      'Select the type of content to generate:',
      { ...keyboard, parse_mode: 'Markdown' }
    );
  }

  async showLeadsMenu(ctx) {
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🔍 Search Leads', callback_data: 'leads:search' },
          { text: '📋 Import List', callback_data: 'leads:import' }
        ],
        [
          { text: '📊 Lead Analytics', callback_data: 'leads:analytics' },
          { text: '✉️ Send Campaign', callback_data: 'leads:campaign' }
        ],
        [
          { text: '◀️ Back', callback_data: 'menu:main' }
        ]
      ]
    };

    await ctx.reply(
      '🎯 *Lead Generation & Management*\n\n' +
      'Manage your leads and outreach campaigns:',
      { ...keyboard, parse_mode: 'Markdown' }
    );
  }

  async showWorkflowsMenu(ctx) {
    try {
      let workflowCount = 0;
      if (this.server?.workflowRegistry) {
        // Get workflow count from registry
        workflowCount = this.server.workflowRegistry?.workflows?.size || 0;
      }

      const keyboard = {
        inline_keyboard: [
          [
            { text: '➕ Create Workflow', callback_data: 'workflow:create' },
            { text: '📋 List Workflows', callback_data: 'workflow:list' }
          ],
          [
            { text: '▶️ Run Workflow', callback_data: 'workflow:run' },
            { text: '⚙️ Configure', callback_data: 'workflow:config' }
          ],
          [
            { text: '📊 Analytics', callback_data: 'workflow:stats' }
          ],
          [
            { text: '◀️ Back', callback_data: 'menu:main' }
          ]
        ]
      };

      await ctx.reply(
        `🔄 *Workflow Automation*\n\n` +
        `Active workflows: ${workflowCount}\n\n` +
        'Automate your business processes:',
        { ...keyboard, parse_mode: 'Markdown' }
      );
    } catch (error) {
      logger.error('Error showing workflows menu:', error);
      await ctx.reply('❌ Error loading workflows');
    }
  }

  async showAnalyticsMenu(ctx) {
    const keyboard = {
      inline_keyboard: [
        [
          { text: '📈 Content Performance', callback_data: 'analytics:content' },
          { text: '🎯 Lead Metrics', callback_data: 'analytics:leads' }
        ],
        [
          { text: '🔄 Workflow Stats', callback_data: 'analytics:workflows' },
          { text: '💰 Revenue', callback_data: 'analytics:revenue' }
        ],
        [
          { text: '📅 Date Range', callback_data: 'analytics:daterange' }
        ],
        [
          { text: '◀️ Back', callback_data: 'menu:main' }
        ]
      ]
    };

    await ctx.reply(
      '📊 *Analytics & Reporting*\n\n' +
      'View performance metrics:',
      { ...keyboard, parse_mode: 'Markdown' }
    );
  }

  async showSystemStatus(ctx) {
    try {
      const status = {
        database: this.server?.db ? '✅ Connected' : '⚠️ Disconnected',
        llm: this.server?.llm ? '✅ Ready' : '⚠️ Unavailable',
        voice: this.server?.voice ? '✅ Active' : '⚠️ Unavailable',
        storage: this.server?.providers ? '✅ Ready' : '⚠️ Unavailable',
        workflows: this.server?.workflowRegistry ? '✅ Active' : '⚠️ Inactive',
        agents: this.server?.voiceConversationAgent ? '✅ Ready' : '⚠️ Unavailable'
      };

      const keyboard = {
        inline_keyboard: [
          [
            { text: '🔄 Restart Services', callback_data: 'system:restart' },
            { text: '📋 Detailed Logs', callback_data: 'system:logs' }
          ],
          [
            { text: '⚙️ Configuration', callback_data: 'system:config' },
            { text: '🔐 Security', callback_data: 'system:security' }
          ],
          [
            { text: '◀️ Back', callback_data: 'menu:main' }
          ]
        ]
      };

      const message =
        `⚙️ *System Status*\n\n` +
        `Database: ${status.database}\n` +
        `LLM: ${status.llm}\n` +
        `Voice: ${status.voice}\n` +
        `Storage: ${status.storage}\n` +
        `Workflows: ${status.workflows}\n` +
        `Agents: ${status.agents}`;

      await ctx.reply(message, { ...keyboard, parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Error showing system status:', error);
      await ctx.reply('❌ Error loading system status');
    }
  }

  async handleCallbackQuery(ctx) {
    const action = ctx.callbackQuery.data;
    logger.info(`📍 Callback query: ${action}`);

    try {
      // Menu navigation
      if (action === 'menu:main') {
        await this.showMainMenu(ctx);
      } else if (action === 'menu:content') {
        await this.showContentMenu(ctx);
      } else if (action === 'menu:leads') {
        await this.showLeadsMenu(ctx);
      } else if (action === 'menu:workflows') {
        await this.showWorkflowsMenu(ctx);
      } else if (action === 'menu:analytics') {
        await this.showAnalyticsMenu(ctx);
      } else if (action === 'menu:system') {
        await this.showSystemStatus(ctx);
      } else if (action === 'menu:voice') {
        await ctx.reply(
          '🎙️ *Voice Commands*\n\n' +
          'Send a voice message to:\n' +
          '• Describe content you want generated\n' +
          '• Ask for lead information\n' +
          '• Control workflows\n' +
          '• Query analytics\n\n' +
          '_Voice transcription powered by Deepgram_'
        );
      } else if (action === 'menu:help') {
        await ctx.reply(
          '❓ *Help & Documentation*\n\n' +
          '*Quick Commands:*\n' +
          '/menu - Main command center\n' +
          '/generate - Content generation\n' +
          '/leads - Lead management\n' +
          '/workflows - Workflow automation\n' +
          '/analytics - Performance metrics\n' +
          '/system - System status\n' +
          '/status - Service status\n\n' +
          '*Voice:* Send a voice message for AI processing\n' +
          '*Inline:* Type @botname to search features'
        );
      }
      // Content actions
      else if (action.startsWith('content:')) {
        const type = action.split(':')[1];
        await this.handleContentAction(ctx, type);
      }
      // Lead actions
      else if (action.startsWith('leads:')) {
        const type = action.split(':')[1];
        await this.handleLeadAction(ctx, type);
      }
      // Workflow actions
      else if (action.startsWith('workflow:')) {
        const type = action.split(':')[1];
        await this.handleWorkflowAction(ctx, type);
      }
      // Analytics actions
      else if (action.startsWith('analytics:')) {
        const type = action.split(':')[1];
        await this.handleAnalyticsAction(ctx, type);
      }
      // System actions
      else if (action.startsWith('system:')) {
        const type = action.split(':')[1];
        await this.handleSystemAction(ctx, type);
      }

      await ctx.answerCbQuery();
    } catch (error) {
      logger.error('Callback error:', error);
      await ctx.answerCbQuery('❌ Error processing request', true);
    }
  }

  async handleInlineQuery(ctx) {
    const query = ctx.inlineQuery.query.toLowerCase();
    const results = [];

    // Search different features based on query
    if (query.includes('content') || query.includes('generate')) {
      results.push({
        type: 'article',
        id: 'content_blog',
        title: '✍️ Generate Blog Post',
        description: 'Create a blog post about your topic',
        input_message_content: {
          message_text: 'Generating blog post...'
        }
      });
      results.push({
        type: 'article',
        id: 'content_email',
        title: '📧 Generate Email Copy',
        description: 'Create compelling email marketing copy',
        input_message_content: {
          message_text: 'Generating email...'
        }
      });
    }

    if (query.includes('lead') || query.includes('prospect')) {
      results.push({
        type: 'article',
        id: 'leads_search',
        title: '🔍 Search Leads',
        description: 'Find prospects by criteria',
        input_message_content: {
          message_text: 'Searching leads...'
        }
      });
    }

    if (query.includes('workflow')) {
      results.push({
        type: 'article',
        id: 'workflow_create',
        title: '➕ Create Workflow',
        description: 'Automate a business process',
        input_message_content: {
          message_text: 'Creating workflow...'
        }
      });
    }

    if (query.includes('analytics') || query.includes('metrics')) {
      results.push({
        type: 'article',
        id: 'analytics_dashboard',
        title: '📊 View Analytics',
        description: 'Performance metrics and reports',
        input_message_content: {
          message_text: 'Loading analytics...'
        }
      });
    }

    if (results.length === 0 && query.length > 0) {
      results.push({
        type: 'article',
        id: 'help',
        title: '❓ No results',
        description: 'Try: content, lead, workflow, analytics',
        input_message_content: {
          message_text: '/help'
        }
      });
    }

    await ctx.answerInlineQuery(results.slice(0, 10));
  }

  // Action handlers
  async handleContentAction(ctx, type) {
    const typeMap = {
      blog: '✍️ Blog Post',
      email: '📧 Email Copy',
      landing: '🌐 Landing Page',
      social: '📱 Social Media',
      video: '🎬 Video Script'
    };

    await ctx.reply(
      `📝 *${typeMap[type] || type}*\n\n` +
      `Send me the topic or brief description, and I'll generate:\n` +
      `• Content outline\n` +
      `• Full draft\n` +
      `• SEO optimization\n` +
      `• Call-to-action\n\n` +
      `_Powered by Claude AI_`
    );
  }

  async handleLeadAction(ctx, type) {
    const typeMap = {
      search: '🔍 Search Leads',
      import: '📋 Import List',
      analytics: '📊 Analytics',
      campaign: '✉️ Campaign'
    };

    await ctx.reply(
      `🎯 *${typeMap[type] || type}*\n\n` +
      `Describe what you're looking for:\n` +
      `• Industry or niche\n` +
      `• Company size\n` +
      `• Location\n` +
      `• Job title\n\n` +
      `I'll find and enrich the leads for you.`
    );
  }

  async handleWorkflowAction(ctx, type) {
    const typeMap = {
      create: '➕ Create Workflow',
      list: '📋 List Workflows',
      run: '▶️ Run Workflow',
      config: '⚙️ Configure',
      stats: '📊 Analytics'
    };

    await ctx.reply(
      `🔄 *${typeMap[type] || type}*\n\n` +
      `Tell me what process you want to automate:\n` +
      `• Email sequences\n` +
      `• Lead nurturing\n` +
      `• Social posting\n` +
      `• Content distribution\n\n` +
      `I'll set up the automation.`
    );
  }

  async handleAnalyticsAction(ctx, type) {
    const typeMap = {
      content: '📈 Content Performance',
      leads: '🎯 Lead Metrics',
      workflows: '🔄 Workflow Stats',
      revenue: '💰 Revenue',
      daterange: '📅 Date Range'
    };

    await ctx.reply(
      `📊 *${typeMap[type] || type}*\n\n` +
      `Select time range:\n` +
      `• Last 7 days\n` +
      `• Last 30 days\n` +
      `• Last 90 days\n` +
      `• Custom range\n\n` +
      `I'll generate detailed reports.`
    );
  }

  async handleSystemAction(ctx, type) {
    const typeMap = {
      restart: '🔄 Restart',
      logs: '📋 Logs',
      config: '⚙️ Configuration',
      security: '🔐 Security'
    };

    await ctx.reply(
      `⚙️ *${typeMap[type] || type}*\n\n` +
      `Admin action requested.\n\n` +
      `Please confirm or provide details.`
    );
  }

  // AI Agent Commands
  async handleAgentsCommand(ctx) {
    try {
      if (!this.server?.mailbox) {
        await ctx.reply('❌ Mailbox system not available');
        return;
      }

      const args = ctx.message.text.split(' ').slice(1);
      if (args.length === 0 || args[0] === 'ping') {
        await ctx.reply('🔄 Checking agent status... (this may take a few seconds)');

        const agents = ['deepseek', 'kimi', 'chatgpt', 'grok'];
        const results = [];

        for (const agent of agents) {
          try {
            const msgId = await this.server.mailbox.send(agent, { type: 'ping' }, {
              from: 'telegram',
              ttl: 10000,
              requiresAck: true
            });
            results.push(`✅ ${agent}: Connected`);
          } catch (error) {
            results.push(`⚠️ ${agent}: Offline`);
          }
        }

        await ctx.reply(
          '🤖 *Agent Status*\n\n' +
          results.join('\n') +
          '\n\n_Last updated: ' + new Date().toLocaleTimeString() + '_'
        );
      } else {
        await ctx.reply(
          '🤖 *AI Agents*\n\n' +
          'Usage:\n' +
          '/agents ping - Check all agents\n' +
          '/deepseek [query] - Ask DeepSeek\n' +
          '/kimi [query] - Ask Kimi\n' +
          '/chatgpt [query] - Ask ChatGPT\n' +
          '/grok [query] - Ask Grok'
        );
      }
    } catch (error) {
      logger.error('Error in agents command:', error);
      await ctx.reply('❌ Error checking agents: ' + error.message);
    }
  }

  async handleDeepseekCommand(ctx) {
    await this.handleAgentQuery(ctx, 'deepseek', '🧠 DeepSeek', 'Chat, reasoning, voice analysis');
  }

  async handleKimiCommand(ctx) {
    await this.handleAgentQuery(ctx, 'kimi', '💻 Kimi', 'Code reviews, architecture analysis');
  }

  async handleChatgptCommand(ctx) {
    await this.handleAgentQuery(ctx, 'chatgpt', '🤝 ChatGPT', 'Reasoning, collaboration, complex tasks');
  }

  async handleGrokCommand(ctx) {
    await this.handleAgentQuery(ctx, 'grok', '⚡ Grok', 'Unconventional thinking, wit');
  }

  async handleAgentQuery(ctx, agent, agentName, description) {
    try {
      const query = ctx.message.text.split(' ').slice(1).join(' ');

      if (!query) {
        await ctx.reply(
          `${agentName}\n\n` +
          `${description}\n\n` +
          `Usage: /${agent} [your question here]\n\n` +
          `Example:\n` +
          `/${agent} What is Node.js?\n` +
          `/${agent} Explain quantum computing`
        );
        return;
      }

      const waitMsg = await ctx.reply(`⏳ Sending query to ${agentName}...`);

      try {
        // Send message via mailbox Redis directly for better control
        const redis = this.server?.mailbox?.redis;
        if (!redis) {
          await ctx.editMessageText('❌ Redis mailbox not available');
          return;
        }

        const msgId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const message = {
          id: msgId,
          from: 'telegram',
          to: agent,
          subject: 'Telegram Query',
          content: query,
          timestamp: new Date().toISOString(),
          read: false,
          replies: []
        };

        // Push to agent's mailbox queue
        await redis.rpush(`mailbox:${agent}:queue`, JSON.stringify(message));
        logger.info(`[Telegram] Sent query to ${agent}: ${msgId}`);

        // Wait for response from mailbox:telegram:queue
        const response = await this.waitForAgentResponse(redis, msgId, agent, 15000);

        if (response) {
          await ctx.editMessageText(
            `${agentName}\n\n` +
            `*Your Query:*\n${query}\n\n` +
            `*Response:*\n${response}`,
            { parse_mode: 'Markdown' }
          );
        } else {
          await ctx.editMessageText(
            `${agentName}\n\n` +
            `Query sent but no response received within timeout.\n` +
            `Please try again or check if agent is online with /agents ping`
          );
        }
      } catch (error) {
        await ctx.editMessageText(
          `❌ ${agentName} Error\n\n` +
          `Failed to reach agent: ${error.message}\n\n` +
          `Try: /agents ping`
        );
      }
    } catch (error) {
      logger.error(`Error in ${agent} command:`, error);
      await ctx.reply('❌ Error: ' + error.message);
    }
  }

  async waitForAgentResponse(redis, inReplyToId, agent, timeout = 15000) {
    const startTime = Date.now();
    const pollInterval = 1000;

    while (Date.now() - startTime < timeout) {
      try {
        // Check mailbox:telegram:queue for responses
        const messages = await redis.lrange('mailbox:telegram:queue', 0, 50);

        for (const msgStr of messages) {
          const msg = JSON.parse(msgStr);
          // Look for a reply to our message
          if (msg.inReplyTo === inReplyToId || msg.from === agent) {
            // Found a response, remove it from queue
            await redis.lrem('mailbox:telegram:queue', 1, msgStr);
            return msg.content;
          }
        }
      } catch (error) {
        logger.error('Error waiting for response:', error);
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return null;
  }
}

export { TelegramCommandCenter };
