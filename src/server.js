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
import { ProviderAbstraction } from './core/provider-abstraction.js';
import { ContentFactory } from './factories/content-factory.js';

class HustleBotServer {
  constructor() {
    this.app = null;
    this.server = null;
    this.port = process.env.PORT || 3000;
    this.providers = null;
    this.contentFactory = null;
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

      // Try to initialize Deepgram voice (graceful failure)
      try {
        logger.info('🎤 Initializing Deepgram voice...');
        const { initDeepgram } = await import('./voice/deepgram.js');
        const voice = await initDeepgram();
        if (voice) {
          this.voice = voice;
          logger.info('✅ Deepgram voice ready');
        }
      } catch (error) {
        logger.warn('⚠️  Deepgram initialization failed, continuing:', error.message);
      }

      // Initialize Provider Abstraction (storage + streaming)
      try {
        logger.info('🔌 Initializing provider abstraction...');
        this.providers = new ProviderAbstraction();
        await this.providers.initialize();
        logger.info('✅ Provider abstraction ready');
      } catch (error) {
        logger.warn('⚠️  Provider abstraction initialization failed, continuing:', error.message);
      }

      // Initialize Content Factory
      try {
        logger.info('📝 Initializing Content Factory...');
        this.contentFactory = new ContentFactory({
          db: this.db,
          llm: this.llm,
          imageGenerator: this.providers
        });
        await this.contentFactory.initialize();
        logger.info('✅ Content Factory ready');
      } catch (error) {
        logger.warn('⚠️  Content Factory initialization failed, continuing:', error.message);
      }

      // Try to initialize Telegram bot (graceful failure)
      if (process.env.TELEGRAM_BOT_TOKEN) {
        try {
          logger.info('📱 Initializing Telegram bot...');
          const { Telegraf } = await import('telegraf');
          this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
          this.setupTelegramHandlers();

          // Register commands with Telegram so they show in UI
          try {
            await this.bot.telegram.setMyCommands([
              { command: 'start', description: 'Welcome & quick start' },
              { command: 'help', description: 'Show available commands' },
              { command: 'status', description: 'Check service status' }
            ]);
            logger.info('✅ Commands registered with Telegram');
          } catch (error) {
            logger.warn('⚠️  Could not register commands:', error.message);
          }

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
      const providerStatus = this.providers ? this.providers.getProviderStatus() : null;
      const storageStatus = this.providers ? this.providers.getProviderStatus().storage.status : null;
      const contentStatus = this.contentFactory ? this.contentFactory.getStatus() : null;

      res.json({
        status: 'running',
        version: '2.0.0',
        database: this.db ? 'connected' : 'disconnected',
        llm: this.llm ? 'ready' : 'unavailable',
        telegram: this.bot ? 'connected' : 'disconnected',
        voice: this.voice ? 'ready' : 'unavailable',
        providers: providerStatus,
        storage: storageStatus,
        content_factory: contentStatus,
        bot_token_set: !!process.env.TELEGRAM_BOT_TOKEN,
        deepgram_key_set: !!process.env.DEEPGRAM_API_KEY,
        features: {
          text_chat: !!this.bot,
          ai_responses: !!this.llm,
          voice_messages: !!this.voice,
          image_generation: !!this.llm,
          streaming: !!this.providers,
          content_generation: !!this.contentFactory
        },
        timestamp: new Date().toISOString()
      });
    });

    // Streaming LLM endpoint
    this.app.post('/api/stream', async (req, res) => {
      try {
        if (!this.providers) {
          return res.status(503).json({ error: 'Provider abstraction not initialized' });
        }

        const { prompt, provider, options } = req.body;

        if (!prompt) {
          return res.status(400).json({ error: 'prompt required' });
        }

        // Set streaming headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const selectedProvider = provider || this.providers.llmProvider;
        const streamOptions = { ...options, provider: selectedProvider };

        try {
          const streamGenerator = this.providers.getStreamingGenerator(prompt, streamOptions);

          // Stream chunks to client
          for await (const chunk of streamGenerator) {
            if (chunk.type === 'chunk') {
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            } else if (chunk.type === 'complete') {
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
              res.write('data: [DONE]\n\n');
            } else if (chunk.type === 'error') {
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            }
          }

          res.end();
        } catch (error) {
          logger.error(`Streaming error: ${error.message}`);
          res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
          res.end();
        }
      } catch (error) {
        logger.error(`Stream endpoint error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });


    // Content Factory endpoints
    this.app.post('/api/content/generate', async (req, res) => {
      try {
        if (!this.contentFactory) {
          return res.status(503).json({ error: 'Content Factory not initialized' });
        }

        const { topic, contentType = 'guide', options = {} } = req.body;

        if (!topic) {
          return res.status(400).json({ error: 'topic required' });
        }

        const result = await this.contentFactory.generateContent(topic, contentType, options);
        res.json(result);
      } catch (error) {
        logger.error(`Content generation error: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/content/status', (req, res) => {
      if (!this.contentFactory) {
        return res.status(503).json({ error: 'Content Factory not initialized' });
      }

      res.json(this.contentFactory.getStatus());
    });

    this.app.get('/api/content/metrics', (req, res) => {
      if (!this.contentFactory) {
        return res.status(503).json({ error: 'Content Factory not initialized' });
      }

      res.json(this.contentFactory.getMetrics());
    });

    // Debug endpoint
    this.app.get('/api/debug', (req, res) => {
      res.json({
        bot_initialized: !!this.bot,
        bot_token_exists: !!process.env.TELEGRAM_BOT_TOKEN,
        port: this.port,
        timestamp: new Date().toISOString()
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
          status: '/api/status',
          streaming: 'POST /api/stream',
          content_factory: {
            generate: 'POST /api/content/generate',
            status: 'GET /api/content/status',
            metrics: 'GET /api/content/metrics'
          }
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
        const userMessage = ctx.message.text || '';
        logger.info(`Message from user ${ctx.from.id}: ${userMessage}`);

        // Show "typing" indicator
        await ctx.sendChatAction('typing');

        // Try to get AI response
        if (this.llm) {
          try {
            const response = await this.llm.complete(userMessage, {
              taskType: 'general',
              maxTokens: 1000,
              temperature: 0.7
            });

            logger.info(`AI response for user ${ctx.from.id}: ${response.tokens.input} in, ${response.tokens.output} out, $${response.cost.toFixed(4)} cost`);
            await ctx.reply(response.content);
          } catch (error) {
            logger.error('LLM error:', error.message);
            await ctx.reply('⚠️ AI service temporarily unavailable. Please try again later.');
          }
        } else {
          logger.warn('LLM not initialized, using fallback response');
          await ctx.reply('Got your message! The AI service is loading. Please try again in a moment.');
        }
      } catch (error) {
        logger.error('Error handling message:', error);
        await ctx.reply('❌ Something went wrong. Please try again.');
      }
    });

    // Handle voice messages
    this.bot.on('voice', async (ctx) => {
      try {
        logger.info(`🎤 Voice message from user ${ctx.from.id}`);

        if (!this.voice) {
          logger.error('Voice service not initialized');
          await ctx.reply('⚠️ Voice service not available. Deepgram not configured.');
          return;
        }

        // Show "recording" indicator
        await ctx.sendChatAction('record_audio');

        try {
          // Download voice file
          logger.info('Downloading voice file...');
          const voiceFile = await ctx.telegram.getFile(ctx.message.voice.file_id);
          const audioUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${voiceFile.file_path}`;
          const audioResponse = await fetch(audioUrl);
          const audioBuffer = await audioResponse.buffer();
          logger.info(`Audio buffer size: ${audioBuffer.length} bytes`);

          // Convert voice to text
          logger.info('Converting speech to text...');
          const { text } = await this.voice.speechToText(audioBuffer, 'audio/ogg');
          logger.info(`✅ Transcribed: "${text}"`);

          // Show "typing" indicator
          await ctx.sendChatAction('typing');

          // For now, just echo back the transcription
          logger.info('Sending transcription back...');
          await ctx.reply(`🎤 You said: "${text}"\n\n(Full AI response coming soon...)`);

          // Try to get AI response (but don't fail if it doesn't work)
          try {
            if (this.llm) {
              logger.info('Getting AI response...');
              const response = await this.llm.complete(text, {
                taskType: 'general',
                maxTokens: 500
              });

              logger.info(`✅ AI response ready: ${response.tokens.output} tokens`);
              await ctx.reply(`🤖 AI: ${response.content}`);
            } else {
              logger.warn('LLM not available');
            }
          } catch (llmError) {
            logger.error('LLM error (non-fatal):', llmError.message);
            logger.info('Voice transcription worked though!');
          }
        } catch (stepError) {
          logger.error('Step error:', stepError.message, stepError.stack);
          await ctx.reply(`❌ Error: ${stepError.message}`);
        }
      } catch (error) {
        logger.error('Voice message error:', error.message, error.stack);
        await ctx.reply(`❌ Voice error: ${error.message}`);
      }
    });

    // Error handling
    this.bot.catch((err, ctx) => {
      logger.error('Telegram bot error:', err);
      if (ctx) {
        logger.error(`Error context: ${ctx.from?.id} - ${ctx.message?.text || 'voice/unknown'}`);
      }
    });

    logger.info('✅ Telegram handlers registered (text + voice)');
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
