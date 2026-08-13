/**
 * HUSTLEBOT v2 - Minimal Working Server
 *
 * A simplified, production-ready server that:
 * 1. Starts Express server
 * 2. Optionally connects to Supabase
 * 3. Optionally starts Telegram bot
 * 4. Gracefully handles failures
 */

import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import logger from './utils/logger.js';

class HustleBotServer {
  constructor() {
    this.app = null;
    this.server = null;
    this.port = process.env.PORT || 3000;
  }

  async initialize() {
    logger.info('🚀 Initializing HustleBot v2...');

    try {
      // Initialize Express
      logger.info('🌐 Setting up Express server...');
      this.app = express();
      this.setupMiddleware();
      this.setupRoutes();
      logger.info('✅ Express server ready');

      // Try to initialize Supabase (graceful failure)
      try {
        logger.info('📦 Connecting to Supabase...');
        const { initSupabase } = await import('./db/supabase.js');
        const db = await initSupabase();
        logger.info('✅ Supabase connected');
        this.db = db;
      } catch (error) {
        logger.warn('⚠️  Supabase connection failed, continuing without DB:', error.message);
      }

      // Try to initialize OpenRouter (graceful failure)
      try {
        logger.info('🧠 Initializing OpenRouter...');
        const { initOpenRouter } = await import('./llm/openrouter.js');
        const llm = await initOpenRouter();
        logger.info('✅ OpenRouter ready');
        this.llm = llm;
      } catch (error) {
        logger.warn('⚠️  OpenRouter initialization failed, continuing:', error.message);
      }

      // Try to initialize Telegram bot (graceful failure)
      if (process.env.TELEGRAM_BOT_TOKEN) {
        try {
          logger.info('📱 Initializing Telegram bot...');
          const { Telegraf } = await import('telegraf');
          this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
          this.setupTelegramHandlers();
          logger.info('✅ Telegram bot ready');
        } catch (error) {
          logger.warn('⚠️  Telegram bot initialization failed:', error.message);
        }
      } else {
        logger.warn('⚠️  TELEGRAM_BOT_TOKEN not set, skipping bot initialization');
      }

      logger.info('🎉 HustleBot v2 initialized successfully!');
      return true;
    } catch (error) {
      logger.error('❌ Initialization failed:', error);
      throw error;
    }
  }

  setupMiddleware() {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'hustlebot-v2'
      });
    });

    // Status endpoint
    this.app.get('/api/status', (req, res) => {
      res.json({
        status: 'running',
        version: '2.0.0',
        database: this.db ? 'connected' : 'disconnected',
        llm: this.llm ? 'ready' : 'unavailable',
        telegram: this.bot ? 'connected' : 'disconnected'
      });
    });

    // Telegram webhook - always register the route
    this.app.post('/api/telegram/webhook', async (req, res) => {
      try {
        logger.info('📨 Webhook received:', JSON.stringify(req.body).substring(0, 200));

        if (!this.bot) {
          logger.warn('⚠️  Bot not initialized, cannot process update');
          return res.status(503).json({ ok: false, error: 'Bot not ready' });
        }

        await this.bot.handleUpdate(req.body);
        res.json({ ok: true });
      } catch (error) {
        logger.error('Webhook error:', error);
        res.status(500).json({ ok: false, error: error.message });
      }
    });

    // Default route
    this.app.get('/', (req, res) => {
      res.json({
        name: 'HustleBot v2',
        description: 'AI-powered business automation platform',
        status: 'running',
        endpoints: {
          health: '/health',
          status: '/api/status'
        }
      });
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not found',
        path: req.path
      });
    });

    // Error handler
    this.app.use((err, req, res, next) => {
      logger.error('Express error:', err);
      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    });
  }

  setupTelegramHandlers() {
    if (!this.bot) return;

    logger.info('📱 Setting up Telegram command handlers...');

    // Handle /start command
    this.bot.command('start', async (ctx) => {
      try {
        logger.info(`/start command from user ${ctx.from.id}`);
        await ctx.reply('👋 Welcome to HustleBot v2!\n\n📚 Send /help for available commands.');
      } catch (error) {
        logger.error('Error handling /start:', error);
      }
    });

    // Handle /help command
    this.bot.command('help', async (ctx) => {
      try {
        logger.info(`/help command from user ${ctx.from.id}`);
        const helpMessage = `
<b>🤖 HustleBot v2 Commands</b>

<b>Core Commands:</b>
/start - Welcome & quick start
/help - This message
/status - Check service status

<b>Features Coming Soon:</b>
• Landing page builder
• Lead generation
• Content creation
• Video production
• E-commerce automation

For more info, visit https://hustlebot.io
`;
        await ctx.reply(helpMessage, { parse_mode: 'HTML' });
      } catch (error) {
        logger.error('Error handling /help:', error);
      }
    });

    // Handle /status command
    this.bot.command('status', async (ctx) => {
      try {
        logger.info(`/status command from user ${ctx.from.id}`);
        await ctx.reply('✅ HustleBot v2 is running and ready!\n\nMore features coming soon...');
      } catch (error) {
        logger.error('Error handling /status:', error);
      }
    });

    // Handle text messages (must come after command handlers)
    this.bot.on('message', async (ctx) => {
      try {
        logger.info(`Message from user ${ctx.from.id}: ${ctx.message.text || '[no text]'}`);
        await ctx.reply('Got your message! More features coming soon...');
      } catch (error) {
        logger.error('Error handling message:', error);
      }
    });

    // Error handling
    this.bot.catch((err, ctx) => {
      logger.error('Telegram bot error:', err);
      if (ctx) {
        logger.error(`Error context: ${ctx.from?.id} - ${ctx.message?.text || 'unknown'}`);
      }
    });

    logger.info('✅ Telegram handlers registered');
  }

  async start() {
    try {
      await this.initialize();

      this.server = this.app.listen(this.port, () => {
        logger.info(`🚀 Server listening on port ${this.port}`);
        logger.info(`📊 Health check: http://localhost:${this.port}/health`);
        logger.info(`🌐 Status: http://localhost:${this.port}/api/status`);
      });
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }
}

// Start server
const server = new HustleBotServer();
server.start();

export default server;
