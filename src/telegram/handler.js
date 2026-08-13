/**
 * TELEGRAM UPDATE HANDLER
 * 
 * Processes all Telegram events:
 * - Commands (/start, /help, /status, etc)
 * - Text messages (natural language commands)
 * - Voice messages (speech-to-text)
 * - Callback queries (button presses)
 * - Webhooks (Stripe, etc)
 */

import logger from '../utils/logger.js';
import { Deepgram } from 'deepgram-sdk';
import { ElevenLabs } from 'elevenlabs';

class TelegramUpdateHandler {
  constructor(db, commandRouter, orchestrator, budgetController) {
    this.db = db;
    this.commandRouter = commandRouter;
    this.orchestrator = orchestrator;
    this.budgetController = budgetController;
    
    this.deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);
    this.elevenlabs = new ElevenLabs(process.env.ELEVENLABS_API_KEY);
  }

  /**
   * Handle /start command
   */
  async handleStart(ctx) {
    try {
      const userId = ctx.from.id;
      const username = ctx.from.username || ctx.from.first_name;

      logger.info(`User started bot: ${username} (${userId})`);

      // Get or create user
      const user = await this.db.getOrCreateUser(userId, username);

      const welcomeMessage = `
👋 <b>Welcome to HustleBot v2!</b>

I'm your AI business automation assistant. I can:

🏗️ <b>Build</b> landing pages with payments (Stripe)
🔍 <b>Generate</b> qualified leads in any vertical
🛒 <b>Create</b> e-commerce stores with automation
📝 <b>Write</b> SEO-optimized content & email sequences
📺 <b>Produce</b> videos & social media content
💰 <b>Manage</b> budgets and track spending

<b>Quick Start Examples:</b>
• "Build me a personal loan landing page"
• "Get 50 leads in California, max $20"
• "Create email sequence for SaaS"
• "Generate 10 TikTok videos"

💡 <b>Your Budget:</b> $100/month
💵 <b>Spent This Month:</b> $0

/help - See all commands
/status - Check active projects
/budget - View spending breakdown
/projects - List your projects
`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '📚 Help', callback_data: 'help' },
            { text: '📊 Status', callback_data: 'status' }
          ],
          [
            { text: '💰 Budget', callback_data: 'budget' },
            { text: '📋 Projects', callback_data: 'projects' }
          ]
        ]
      };

      await ctx.reply(welcomeMessage, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
    } catch (error) {
      logger.error('Error in handleStart:', error);
      await ctx.reply('❌ Error initializing. Please try again.');
    }
  }

  /**
   * Handle /help command
   */
  async handleHelp(ctx) {
    try {
      const helpMessage = `
<b>🤖 HustleBot v2 Commands</b>

<b>Core Commands:</b>
/start - Welcome & quick start
/status - View all active projects
/budget - Check monthly budget & spending
/projects - List all your projects
/help - This message

<b>Natural Language Examples:</b>

<b>Landing Pages:</b>
• "Build a landing page for personal loans"
• "Create a SaaS landing page with Stripe"

<b>Lead Generation:</b>
• "Get 50 leads in California"
• "Generate 100 business leads, max $30"
• "Find prospects in tech industry"

<b>E-Commerce:</b>
• "Build me a dropshipping store"
• "Create store with 50 products"

<b>Content:</b>
• "Write 5 SEO blog posts about fitness"
• "Create 20 Instagram posts"
• "Generate email sequence for onboarding"

<b>Video/Social:</b>
• "Make 10 TikTok videos about crypto"
• "Create 50 LinkedIn posts"
• "Generate video scripts for YouTube"

<b>💡 Pro Tips:</b>
• Add budgets: "...max $50"
• Add locations: "...in California"
• Add quantities: "...50 leads"
• Send voice: Record and send voice message

<b>Questions?</b>
Reply to any message for help!
`;

      await ctx.reply(helpMessage, { parse_mode: 'HTML' });
    } catch (error) {
      logger.error('Error in handleHelp:', error);
      await ctx.reply('❌ Error retrieving help.');
    }
  }

  /**
   * Handle /status command
   */
  async handleStatus(ctx) {
    try {
      const userId = ctx.from.id;
      const projects = await this.db.listUserProjects(userId);

      if (projects.length === 0) {
        await ctx.reply('📭 No active projects. Start with: /help');
        return;
      }

      let statusMessage = '<b>📊 Your Projects</b>\n\n';

      for (const project of projects.slice(0, 10)) {
        const icon = {
          completed: '✅',
          in_progress: '⏳',
          initializing: '🚀',
          failed: '❌'
        }[project.status] || '❓';

        statusMessage += `${icon} <b>${project.name}</b>\n`;
        statusMessage += `Type: ${project.type}\n`;
        statusMessage += `Status: ${project.status}\n`;
        statusMessage += `Cost: $${project.budget_spent}\n`;
        statusMessage += `Created: ${new Date(project.created_at).toLocaleDateString()}\n\n`;
      }

      if (projects.length > 10) {
        statusMessage += `\n... and ${projects.length - 10} more projects`;
      }

      await ctx.reply(statusMessage, { parse_mode: 'HTML' });
    } catch (error) {
      logger.error('Error in handleStatus:', error);
      await ctx.reply('❌ Error retrieving status.');
    }
  }

  /**
   * Handle /budget command
   */
  async handleBudget(ctx) {
    try {
      const userId = ctx.from.id;
      const report = await this.budgetController.getBudgetReport(userId);

      const budgetMessage = `
<b>💰 Budget Report</b>

Monthly Budget: $${report.monthly_budget} ${report.currency}
Spent: $${report.spent}
Remaining: $${report.remaining}
Usage: ${report.percent_used}%

<b>Breakdown by Service:</b>
`;

      let breakdown = '';
      for (const [service, data] of Object.entries(report.breakdown_by_service)) {
        breakdown += `${service}: $${data.amount} (${data.percent}%)\n`;
      }

      const fullMessage = budgetMessage + breakdown + `\n<b>Status:</b> ${report.status}`;

      await ctx.reply(fullMessage, { parse_mode: 'HTML' });
    } catch (error) {
      logger.error('Error in handleBudget:', error);
      await ctx.reply('❌ Error retrieving budget.');
    }
  }

  /**
   * Handle /projects command
   */
  async handleProjects(ctx) {
    try {
      const userId = ctx.from.id;
      const projects = await this.db.listUserProjects(userId);

      if (projects.length === 0) {
        await ctx.reply('📭 No projects yet. Send a command to create one!');
        return;
      }

      let message = '<b>📋 Your Projects</b>\n\n';
      for (const p of projects) {
        message += `• ${p.name} (${p.type}) - ${p.status}\n`;
      }

      await ctx.reply(message, { parse_mode: 'HTML' });
    } catch (error) {
      logger.error('Error in handleProjects:', error);
      await ctx.reply('❌ Error retrieving projects.');
    }
  }

  /**
   * Handle text commands (natural language)
   */
  async handleTextCommand(ctx) {
    try {
      const userId = ctx.from.id;
      const text = ctx.message.text;

      logger.info(`Text command from ${userId}: ${text}`);

      // Check budget first
      const budgetStatus = await this.budgetController.canExecute(userId);
      if (!budgetStatus.canExecute) {
        const alert = await this.budgetController.recordSpend(
          userId,
          null,
          0,
          'system',
          'Budget exceeded - command rejected'
        );

        await ctx.reply(
          this.budgetController.formatBudgetAlert(userId, budgetStatus, alert.alerts[0]),
          { parse_mode: 'HTML' }
        );
        return;
      }

      // Show thinking state
      await ctx.reply('🤔 Processing your command...');

      // Parse command
      const parsed = await this.commandRouter.parseCommand(text);

      // Route command
      const route = await this.commandRouter.routeCommand(parsed);

      if (route.error) {
        await ctx.reply(`❌ ${route.error}\n\nTry: /help`);
        return;
      }

      // Show summary
      const summary = this.commandRouter.formatCommandSummary(parsed);
      await ctx.reply(summary + `\n💭 Estimated cost: $${route.estimated_cost.toFixed(2)}`, {
        parse_mode: 'HTML'
      });

      // Check if user has budget for this
      const canAfford = budgetStatus.remaining >= route.estimated_cost;
      if (!canAfford) {
        const needed = route.estimated_cost - budgetStatus.remaining;
        await ctx.reply(
          `⚠️ This command costs $${route.estimated_cost.toFixed(2)} but you only have $${budgetStatus.remaining.toFixed(2)} remaining.\n\nYou need $${needed.toFixed(2)} more budget.\n\n[Increase Budget]`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      // Confirm execution
      const confirmMessage = `✅ Confirmed!\n\nStarting: ${route.swarms.join(', ')}\nEstimated time: 5-30 minutes\n\nI'll update you as work progresses...`;
      await ctx.reply(confirmMessage, { parse_mode: 'HTML' });

      // Create project
      const project = await this.db.createProject(
        userId,
        route.intent,
        {
          name: `${route.intent} - ${route.vertical}`,
          description: text,
          metadata: { ...route.parameters },
          budget_allocated: route.estimated_cost
        }
      );

      // Spawn swarms
      for (const swarm of route.swarms) {
        try {
          const swarmResult = await this.orchestrator.spawnSwarm(
            swarm,
            userId,
            project.id,
            route.parameters
          );

          const aggregated = this.orchestrator.aggregateResults(swarmResult);

          // Send completion message
          await ctx.reply(
            `${aggregated.summary}\n\n💰 Cost: $${aggregated.total_cost}\n⏱️ Time: ${aggregated.duration_seconds.toFixed(1)}s`,
            { parse_mode: 'HTML' }
          );

          // Record spend
          await this.budgetController.recordSpend(
            userId,
            project.id,
            aggregated.total_cost,
            'orchestrator',
            aggregated.swarm_name
          );
        } catch (error) {
          logger.error(`Swarm failed: ${swarm}`, error);
          await ctx.reply(`❌ Swarm failed: ${error.message}`);
        }
      }
    } catch (error) {
      logger.error('Error in handleTextCommand:', error);
      await ctx.reply('❌ Error processing command. Please try again.');
    }
  }

  /**
   * Handle voice commands (speech-to-text)
   */
  async handleVoiceCommand(ctx) {
    try {
      const userId = ctx.from.id;

      logger.info(`Voice command from ${userId}`);

      await ctx.reply('🎤 Processing voice message...');

      // Get voice file
      const file = await ctx.telegram.getFile(ctx.message.voice.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

      // Transcribe with Deepgram
      const response = await fetch(fileUrl);
      const audioBuffer = await response.arrayBuffer();

      const { result } = await this.deepgram.listen.prerecorded.transcribeBuffer(
        audioBuffer,
        { model: 'nova-2', smart_format: true }
      );

      const transcript = result.results.channels[0].alternatives[0].transcript;

      logger.info(`Transcribed: "${transcript}"`);

      // Send as text command
      await this.handleTextCommand({ 
        ...ctx,
        message: { 
          ...ctx.message, 
          text: transcript 
        }
      });
    } catch (error) {
      logger.error('Error in handleVoiceCommand:', error);
      await ctx.reply('❌ Error processing voice message. Please try text instead.');
    }
  }

  /**
   * Handle callback queries (button presses)
   */
  async handleCallback(ctx) {
    try {
      const { data } = ctx.callbackQuery;

      logger.info(`Callback: ${data} from user ${ctx.from.id}`);

      switch (data) {
        case 'help':
          await this.handleHelp(ctx);
          break;
        case 'status':
          await this.handleStatus(ctx);
          break;
        case 'budget':
          await this.handleBudget(ctx);
          break;
        case 'projects':
          await this.handleProjects(ctx);
          break;
        default:
          await ctx.answerCbQuery('Unknown action');
      }

      await ctx.answerCbQuery();
    } catch (error) {
      logger.error('Error in handleCallback:', error);
      await ctx.answerCbQuery('❌ Error processing action');
    }
  }

  /**
   * Handle Stripe webhooks
   */
  async handleStripeWebhook(body) {
    try {
      const { type, data } = body;

      logger.info(`Stripe webhook: ${type}`);

      // Handle different event types
      switch (type) {
        case 'payment_intent.succeeded':
          logger.info(`Payment succeeded: ${data.object.id}`);
          // Update project payment status
          break;
        case 'payment_intent.payment_failed':
          logger.error(`Payment failed: ${data.object.id}`);
          break;
      }

      return { success: true };
    } catch (error) {
      logger.error('Error handling Stripe webhook:', error);
      throw error;
    }
  }
}

export { TelegramUpdateHandler };
