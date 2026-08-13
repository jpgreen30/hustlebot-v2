/**
 * TELEGRAM UPDATE HANDLER
 *
 * Simplified handler for Telegram events.
 * Complex features (voice, agents, etc) can be added later.
 */

import logger from '../utils/logger.js';

class TelegramUpdateHandler {
  constructor(db, commandRouter, orchestrator, budgetController) {
    this.db = db;
    this.commandRouter = commandRouter;
    this.orchestrator = orchestrator;
    this.budgetController = budgetController;
  }

  async handleStart(ctx) {
    try {
      await ctx.reply('👋 Welcome to HustleBot v2!\n\n📚 Send /help for commands.');
    } catch (error) {
      logger.error('Error in handleStart:', error);
    }
  }

  async handleHelp(ctx) {
    try {
      const helpMessage = `
<b>🤖 HustleBot v2 Commands</b>

<b>Core Commands:</b>
/start - Welcome
/help - This message
/status - Service status

<b>Coming Soon:</b>
• Landing pages with Stripe
• Lead generation
• Content creation
• Video production
• E-commerce automation
`;
      await ctx.reply(helpMessage, { parse_mode: 'HTML' });
    } catch (error) {
      logger.error('Error in handleHelp:', error);
    }
  }

  async handleStatus(ctx) {
    try {
      await ctx.reply('✅ HustleBot v2 is running!\n\nMore features coming soon...');
    } catch (error) {
      logger.error('Error in handleStatus:', error);
    }
  }

  async handleTextCommand(ctx) {
    try {
      logger.info(`Text from ${ctx.from.id}: ${ctx.message.text}`);
      await ctx.reply('Got it! More features coming soon...');
    } catch (error) {
      logger.error('Error in handleTextCommand:', error);
    }
  }

  async handleCallback(ctx) {
    try {
      await ctx.answerCbQuery();
    } catch (error) {
      logger.error('Error in handleCallback:', error);
    }
  }
}

export { TelegramUpdateHandler };
