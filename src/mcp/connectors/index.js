/**
 * MCP Connectors Manager
 * Runs all AI agent connectors (DeepSeek, Kimi, etc.)
 *
 * Usage:
 *   node src/mcp/connectors/index.js
 */

import 'dotenv/config';
import { DeepSeekConnector } from './deepseek-connector.js';
import { KimiConnector } from './kimi-connector.js';
import { ChatGPTConnector } from './chatgpt-connector.js';

class ConnectorsManager {
  constructor() {
    this.connectors = [];
    this.running = false;
  }

  async initialize() {
    console.log('[Connectors] 🚀 Initializing MCP Connectors...\n');

    // Initialize DeepSeek
    try {
      console.log('[Connectors] Setting up DeepSeek connector...');
      const deepseek = new DeepSeekConnector({
        redisUrl: process.env.REDIS_URL,
        openrouterKey: process.env.OPENROUTER_API_KEY,
      });
      await deepseek.initialize();
      this.connectors.push(deepseek);
      console.log('[Connectors] ✅ DeepSeek connector ready\n');
    } catch (error) {
      console.error('[Connectors] ❌ DeepSeek connector failed:', error.message, '\n');
    }

    // Initialize Kimi
    try {
      console.log('[Connectors] Setting up Kimi connector...');
      const kimi = new KimiConnector({
        redisUrl: process.env.REDIS_URL,
        openrouterKey: process.env.OPENROUTER_API_KEY,
      });
      await kimi.initialize();
      this.connectors.push(kimi);
      console.log('[Connectors] ✅ Kimi connector ready\n');
    } catch (error) {
      console.error('[Connectors] ❌ Kimi connector failed:', error.message, '\n');
    }

    // Initialize ChatGPT
    try {
      console.log('[Connectors] Setting up ChatGPT connector...');
      const chatgpt = new ChatGPTConnector({
        redisUrl: process.env.REDIS_URL,
        openrouterKey: process.env.OPENROUTER_API_KEY,
      });
      await chatgpt.initialize();
      this.connectors.push(chatgpt);
      console.log('[Connectors] ✅ ChatGPT connector ready\n');
    } catch (error) {
      console.error('[Connectors] ❌ ChatGPT connector failed:', error.message, '\n');
    }

    if (this.connectors.length === 0) {
      console.error('[Connectors] ❌ No connectors initialized');
      throw new Error('Failed to initialize any connectors');
    }

    console.log(`[Connectors] ✅ ${this.connectors.length} connector(s) initialized`);
  }

  async start() {
    console.log('\n[Connectors] 📬 Starting all connectors...\n');

    for (const connector of this.connectors) {
      await connector.start();
    }

    this.running = true;
    console.log('\n[Connectors] ✅ All connectors running');
    console.log('[Connectors] 📬 Ready for mailbox communication\n');

    // Print status
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[Connectors] 📊 Status:');
    console.log(`  • DeepSeek: Ready (chat/voice analysis)`);
    console.log(`  • Kimi: Ready (code reviews & architecture)`);
    console.log(`  • ChatGPT: Ready (reasoning & collaboration)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  async stop() {
    console.log('\n[Connectors] ⏹️  Stopping all connectors...');

    for (const connector of this.connectors) {
      await connector.stop();
    }

    this.running = false;
    console.log('[Connectors] ✅ All connectors stopped');
  }
}

// Run if executed directly
if (process.argv[1].includes('connectors/index.js')) {
  const manager = new ConnectorsManager();

  manager
    .initialize()
    .then(() => manager.start())
    .catch(error => {
      console.error('[Connectors] Fatal error:', error);
      process.exit(1);
    });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    await manager.stop();
    process.exit(0);
  });
}

export { ConnectorsManager };
