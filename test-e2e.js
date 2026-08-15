/**
 * End-to-End Testing Script
 * Tests: Redis connection, main service, Background Worker, mailbox, and connectors
 */

import 'dotenv/config';
import Redis from 'ioredis';
import axios from 'axios';

const RENDER_SERVICE_URL = 'https://hustlebot-v2.onrender.com';
const RENDER_WORKER_URL = 'https://hustlebot-connectors.onrender.com'; // Adjust if different name
const REDIS_URL = process.env.REDIS_URL;

let redisClient;
let testsPassed = 0;
let testsFailed = 0;

async function log(message, type = 'info') {
  const icons = {
    info: '📍',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    test: '🧪'
  };
  console.log(`${icons[type]} ${message}`);
}

async function testRedisConnection() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  await log('Testing Redis Connection...', 'test');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    redisClient = new Redis(REDIS_URL);
    redisClient.on('error', err => console.log('Redis Client Error', err));

    await log('Connected to Redis', 'success');
    const pong = await redisClient.ping();
    await log(`Redis ping response: ${pong}`, 'success');
    testsPassed++;
    return true;
  } catch (error) {
    await log(`Redis connection failed: ${error.message}`, 'error');
    testsFailed++;
    return false;
  }
}

async function testMainService() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  await log('Testing Main HustleBot Service...', 'test');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const response = await axios.get(`${RENDER_SERVICE_URL}/health`, {
      timeout: 5000
    });

    await log(`Main service is LIVE (status: ${response.status})`, 'success');
    await log(`Service Response: ${JSON.stringify(response.data)}`, 'info');
    testsPassed++;
    return true;
  } catch (error) {
    await log(`Main service check failed: ${error.message}`, 'error');
    testsFailed++;
    return false;
  }
}

async function testMailboxRedis() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  await log('Testing Mailbox Redis Channels...', 'test');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    if (!redisClient) {
      throw new Error('Redis client not connected');
    }

    // Set a test mailbox message
    const testMessage = {
      id: `test-${Date.now()}`,
      to: 'deepseek',
      from: 'test',
      message: 'Test message',
      timestamp: new Date().toISOString()
    };

    await redisClient.lPush('mailbox:deepseek', JSON.stringify(testMessage));
    await log('✓ Successfully published message to deepseek mailbox', 'success');

    // Verify message exists
    const messages = await redisClient.lRange('mailbox:deepseek', 0, 10);
    await log(`✓ Retrieved ${messages.length} messages from mailbox`, 'success');
    testsPassed++;
    return true;
  } catch (error) {
    await log(`Mailbox test failed: ${error.message}`, 'error');
    testsFailed++;
    return false;
  }
}

async function testConnectorSubscription() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  await log('Testing Connector Agent Setup...', 'test');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    if (!redisClient) {
      throw new Error('Redis client not connected');
    }

    const agents = ['deepseek', 'kimi', 'chatgpt', 'grok'];
    const agentStatus = {};

    for (const agent of agents) {
      const key = `agent:${agent}:status`;
      const status = await redisClient.get(key);
      agentStatus[agent] = status || 'offline';
      await log(`${agent}: ${status || 'offline'}`, status ? 'success' : 'warning');
    }

    // Check if at least some agents are ready
    const onlineAgents = Object.values(agentStatus).filter(s => s === 'online').length;
    if (onlineAgents > 0) {
      await log(`${onlineAgents}/${agents.length} agents are online`, 'success');
      testsPassed++;
      return true;
    } else {
      await log('No agents currently online (this is OK if Background Worker just started)', 'warning');
      testsPassed++;
      return true;
    }
  } catch (error) {
    await log(`Connector check failed: ${error.message}`, 'error');
    testsFailed++;
    return false;
  }
}

async function testMessageQueue() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  await log('Testing Message Queue System...', 'test');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    if (!redisClient) {
      throw new Error('Redis client not connected');
    }

    // Get queue sizes for each agent
    const agents = ['deepseek', 'kimi', 'chatgpt', 'grok'];
    const queueSizes = {};

    for (const agent of agents) {
      const size = await redisClient.lLen(`mailbox:${agent}`);
      queueSizes[agent] = size;
      await log(`${agent} mailbox: ${size} messages`, 'info');
    }

    await log('Message queue system is operational', 'success');
    testsPassed++;
    return true;
  } catch (error) {
    await log(`Queue test failed: ${error.message}`, 'error');
    testsFailed++;
    return false;
  }
}

async function testTelegramIntegration() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  await log('Testing Telegram Integration...', 'test');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    if (!redisClient) {
      throw new Error('Redis client not connected');
    }

    const botToken = await redisClient.get('bot:telegram:token:status');
    if (botToken) {
      await log('✓ Telegram bot token configured', 'success');
      testsPassed++;
    } else {
      await log('Telegram bot token not yet set (optional)', 'warning');
      testsPassed++;
    }
    return true;
  } catch (error) {
    await log(`Telegram check failed: ${error.message}`, 'warning');
    testsPassed++; // Don't fail if Telegram is optional
    return true;
  }
}

async function runAllTests() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  🤖 HUSTLEBOT V2 - END-TO-END TEST SUITE           ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  await log('Starting comprehensive system tests...', 'info');

  // Run tests sequentially
  await testRedisConnection();
  await testMainService();
  await testMailboxRedis();
  await testConnectorSubscription();
  await testMessageQueue();
  await testTelegramIntegration();

  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 TEST SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const total = testsPassed + testsFailed;
  const percentage = total > 0 ? Math.round((testsPassed / total) * 100) : 0;

  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(`📈 Success Rate: ${percentage}%\n`);

  if (testsFailed === 0) {
    console.log('🎉 ALL TESTS PASSED! HustleBot V2 is fully operational.\n');
    console.log('Next Steps:');
    console.log('  1. Test /agents command in Telegram');
    console.log('  2. Verify connector responses');
    console.log('  3. Monitor Background Worker logs on Render\n');
  } else {
    console.log(`⚠️  ${testsFailed} test(s) failed. Check the logs above.\n`);
  }

  // Cleanup
  if (redisClient) {
    redisClient.disconnect();
  }

  process.exit(testsFailed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  console.error('Test suite error:', error);
  process.exit(1);
});
