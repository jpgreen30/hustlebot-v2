/**
 * HUSTLEBOT v2 - Main Server & Telegram Bot
 * 
 * Responsibilities:
 * 1. Start Telegram bot (webhook or polling)
 * 2. Initialize MCP server (expose all tools)
 * 3. Connect to Supabase
 * 4. Start agent orchestrator
 * 5. Handle incoming commands and route to agents
 */

import 'dotenv/config';
import { Telegraf } from 'telegraf';
import express from 'express';
import logger from './utils/logger.js';
import { initSupabase } from './db/supabase.js';
import { initOpenRouter } from './llm/openrouter.js';
import { CommandRouter } from './core/command-router.js';
import { BudgetController } from './core/budget-controller.js';
import { AgentOrchestrator } from './agents/orchestrator.js';
import { TelegramUpdateHandler } from './telegram/handler.js';

class HustleBotServer {
  constructor() {
    this.bot = null;
    this.app = null;
    this.db = null;
    this.llm = null;
    this.commandRouter = null;
    this.budgetController = null;
    this.orchestrator = null;
    this.updateHandler = null;
  }

  async initialize() {
    logger.info('🚀 Initializing HustleBot v2...');

    try {
      // 1. Initialize database
      logger.info('📦 Connecting to Supabase...');
      this.db = await initSupabase();
      logger.info('✅ Supabase connected');

      // 2. Initialize LLM router
      logger.info('🧠 Initializing OpenRouter...');
      this.llm = await initOpenRouter();
      logger.info('✅ OpenRouter ready');

      // 3. Initialize core components
      logger.info('⚙️  Initializing core components...');
      this.budgetController = new BudgetController(this.db);
      this.commandRouter = new CommandRouter(this.db);
      this.orchestrator = new AgentOrchestrator(
        this.db,
        this.llm,
        this.budgetController
      );
      logger.info('✅ Core components initialized');

      // 4. Initialize Telegram bot
      logger.info('📱 Initializing Telegram bot...');
      this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
      this.updateHandler = new TelegramUpdateHandler(
        this.db,
        this.commandRouter,
        this.orchestrator,
        this.budgetController
      );
      this.setupTelegramHandlers();
      logger.info('✅ Telegram bot ready');

      // 5. Initialize Express server (for webhooks)
      logger.info('🌐 Initializing Express server...');
      this.app = express();
      this.setupExpress();
      logger.info('✅ Express server ready');

      logger.info('🎉 HustleBot v2 fully initialized!');
      return true;
    } catch (error) {
      logger.error('❌ Initialization failed:', error);
      throw error;
    }
  }

  setupTelegramHandlers() {
    /**
     * Handle text commands
     * Commands: /start, /help, /status, /budget, /projects, etc.
     */
    this.bot.command('start', (ctx) =>
      this.updateHandler.handleStart(ctx)
    );

    this.bot.command('help', (ctx) =>
      this.updateHandler.handleHelp(ctx)
    );

    this.bot.command('status', (ctx) =>
      this.updateHandler.handleStatus(ctx)
    );

    this.bot.command('budget', (ctx) =>
      this.updateHandler.handleBudget(ctx)
    );

    this.bot.command('projects', (ctx) =>
      this.updateHandler.handleProjects(ctx)
    );

    /**
     * Handle text messages (natural language commands)
     * Examples:
     * - "Build me a landing page"
     * - "Get 50 leads in California"
     * - "Create email sequence"
     */
    this.bot.on('text', async (ctx) => {
      try {
        await this.updateHandler.handleTextCommand(ctx);
      } catch (error) {
        logger.error('Error handling text command:', error);
        await ctx.reply(
          '❌ Error processing command. Please try again.',
          { parse_mode: 'HTML' }
        );
      }
    });

    /**
     * Handle voice messages (speech-to-text)
     */
    this.bot.on('voice', async (ctx) => {
      try {
        await this.updateHandler.handleVoiceCommand(ctx);
      } catch (error) {
        logger.error('Error handling voice command:', error);
        await ctx.reply(
          '❌ Error processing voice message. Please try again.',
          { parse_mode: 'HTML' }
        );
      }
    });

    /**
     * Handle callback queries (button presses)
     */
    this.bot.on('callback_query', async (ctx) => {
      try {
        await this.updateHandler.handleCallback(ctx);
      } catch (error) {
        logger.error('Error handling callback:', error);
        await ctx.answerCbQuery('❌ Error processing request.');
      }
    });

    // Error handler
    this.bot.catch((err, ctx) => {
      logger.error('Telegram error:', err);
      ctx.reply('⚠️ An error occurred. Please try again later.');
    });
  }

  setupExpress() {
    this.app.use(express.json());

    /**
     * Health check endpoint
     */
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    /**
     * Webhook endpoint for Telegram (alternative to polling)
     * POST /webhook/:token
     */
    this.app.post('/webhook/:token', (req, res) => {
      if (req.params.token !== process.env.TELEGRAM_BOT_TOKEN) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      try {
        this.bot.handleUpdate(req.body);
        res.json({ ok: true });
      } catch (error) {
        logger.error('Webhook error:', error);
        res.status(500).json({ error: 'Internal error' });
      }
    });

    /**
     * Stripe webhook endpoint
     * POST /webhooks/stripe
     */
    this.app.post('/webhooks/stripe', async (req, res) => {
      try {
        await this.updateHandler.handleStripeWebhook(req.body);
        res.json({ ok: true });
      } catch (error) {
        logger.error('Stripe webhook error:', error);
        res.status(500).json({ error: 'Internal error' });
      }
    });

    /**
     * API endpoints for dashboard/monitoring
     * GET /api/status/:projectId
     */
    this.app.get('/api/status/:projectId', async (req, res) => {
      try {
        const status = await this.db.getProjectStatus(req.params.projectId);
        res.json(status);
      } catch (error) {
        logger.error('Status error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    /**
     * MCP Tools endpoint (for external callers)
     * GET /mcp/tools
     */
    this.app.get('/mcp/tools', (req, res) => {
      const tools = this.orchestrator.getAvailableTools();
      res.json(tools);
    });

    /**
     * Execute MCP tool endpoint
     * POST /mcp/execute
     */
    this.app.post('/mcp/execute', async (req, res) => {
      try {
        const { toolName, args, userId } = req.body;

        // Verify user has budget
        const hasBudget = await this.budgetController.canExecute(userId);
        if (!hasBuffer) {
          return res.status(402).json({ error: 'Insufficient budget' });
        }

        // Execute tool
        const result = await this.orchestrator.executeTool(
          toolName,
          args,
          userId
        );

        res.json(result);
      } catch (error) {
        logger.error('Tool execution error:', error);
        res.status(500).json({ error: error.message });
      }
    });
  }

  async start() {
    try {
      await this.initialize();

      const port = process.env.PORT || 3000;

      // Start Express server
      this.app.listen(port, () => {
        logger.info(`🌐 Express server listening on port ${port}`);
      });

      // Start Telegram bot (polling by default)
      // To use webhook instead, set TELEGRAM_WEBHOOK_URL in .env
      if (process.env.TELEGRAM_WEBHOOK_URL) {
        await this.bot.telegram.setWebhook(
          process.env.TELEGRAM_WEBHOOK_URL
        );
        logger.info(`🔗 Telegram webhook set to ${process.env.TELEGRAM_WEBHOOK_URL}`);
      } else {
        await this.bot.launch();
        logger.info('🤖 Telegram bot launched (polling mode)');
      }

      logger.info('✅ HustleBot v2 is LIVE and ready to take commands!');

      // Graceful shutdown
      process.once('SIGINT', () => this.bot.stop('SIGINT'));
      process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }
}

// Start the server
const server = new HustleBotServer();
server.start().catch((err) => {
  logger.error('Fatal error:', err);
  process.exit(1);
});

export default HustleBotServer;
