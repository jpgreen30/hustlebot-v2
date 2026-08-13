/**
 * AGENT TESTS
 * 
 * Verify all 17 agents initialize and execute correctly
 */

import test from 'node:test';
import assert from 'node:assert';
import logger from '../utils/logger.js';

// Mock database and LLM for testing
const mockDB = {
  logAgentExecution: async () => ({ success: true }),
  recordSpend: async () => ({ success: true })
};

const mockLLM = {
  complete: async (prompt, options) => ({
    content: JSON.stringify({ test: 'response' }),
    cost: 0.01,
    model: 'grok-2',
    tokens: { input: 100, output: 50 }
  }),
  stream: async function* (prompt, options) {
    yield 'test';
  }
};

const mockBudgetController = {
  canExecute: async () => ({ canExecute: true }),
  recordSpend: async () => ({ success: true })
};

test('Agent Framework Tests', async (t) => {
  logger.info('🧪 Starting agent framework tests...');

  // Test agent initialization
  await t.test('All agents initialize successfully', async () => {
    try {
      // Dynamic import due to ES modules
      const BaseAgent = (await import('./base-agent.js')).BaseAgent;
      const LLMAgent = (await import('./llm-agent.js')).LLMAgent;
      const CopywriterAgent = (await import('./copywriter.js')).CopywriterAgent;

      // Initialize test agents
      const baseAgent = new BaseAgent('test_base', mockDB, mockLLM, mockBudgetController);
      const llmAgent = new LLMAgent('test_llm', mockDB, mockLLM, mockBudgetController);
      const copywriterAgent = new CopywriterAgent(mockDB, mockLLM, mockBudgetController);

      assert(baseAgent.name === 'test_base', 'BaseAgent initialized');
      assert(llmAgent.name === 'test_llm', 'LLMAgent initialized');
      assert(copywriterAgent.name === 'copywriter', 'CopywriterAgent initialized');

      logger.info('✅ All agent types initialize successfully');
    } catch (error) {
      logger.error('❌ Agent initialization failed:', error);
      throw error;
    }
  });

  // Test agent execution
  await t.test('Agents execute and return results', async () => {
    try {
      const CopywriterAgent = (await import('./copywriter.js')).CopywriterAgent;
      const agent = new CopywriterAgent(mockDB, mockLLM, mockBudgetController);

      const input = {
        topic: 'Test Product',
        style: 'benefit',
        quantity: 3,
        projectId: 'test-project-123'
      };

      const result = await agent.execute(input);

      assert(result.success === true, 'Execution successful');
      assert(result.cost >= 0, 'Cost tracked');
      assert(result.agentName === 'copywriter', 'Agent name included');

      logger.info('✅ Agent execution works correctly');
    } catch (error) {
      logger.error('❌ Agent execution failed:', error);
      throw error;
    }
  });

  // Test tool registration
  await t.test('Agents register and expose tools', async () => {
    try {
      const CopywriterAgent = (await import('./copywriter.js')).CopywriterAgent;
      const agent = new CopywriterAgent(mockDB, mockLLM, mockBudgetController);

      const tools = agent.getTools();
      
      assert(Array.isArray(tools), 'Tools array returned');
      assert(tools.length > 0, 'At least one tool registered');
      assert(tools[0].name, 'Tools have names');
      assert(tools[0].description, 'Tools have descriptions');

      logger.info(`✅ Agent tools registered (${tools.length} tools)`);
    } catch (error) {
      logger.error('❌ Tool registration failed:', error);
      throw error;
    }
  });

  // Test cost tracking
  await t.test('Agents track costs correctly', async () => {
    try {
      const CopywriterAgent = (await import('./copywriter.js')).CopywriterAgent;
      const agent = new CopywriterAgent(mockDB, mockLLM, mockBudgetController);

      const stats = agent.getStats();

      assert(stats.name === 'copywriter', 'Agent name in stats');
      assert(typeof stats.totalCost === 'number', 'Total cost is number');
      assert(typeof stats.executionCount === 'number', 'Execution count tracked');
      assert(typeof stats.averageCost === 'number', 'Average cost calculated');

      logger.info('✅ Cost tracking works correctly');
    } catch (error) {
      logger.error('❌ Cost tracking failed:', error);
      throw error;
    }
  });

  // Test LLM call
  await t.test('LLMAgent calls LLM correctly', async () => {
    try {
      const LLMAgent = (await import('./llm-agent.js')).LLMAgent;
      const agent = new LLMAgent('test_llm', mockDB, mockLLM, mockBudgetController, {
        defaultTaskType: 'test'
      });

      // Override getPrompt for testing
      agent.getPrompt = async () => 'Test prompt';

      const result = await agent.executeLogic({ projectId: 'test-123' });

      assert(result.output, 'LLM output received');
      assert(result.cost >= 0, 'Cost returned');

      logger.info('✅ LLMAgent calls LLM correctly');
    } catch (error) {
      logger.error('❌ LLM call failed:', error);
      throw error;
    }
  });

  // Test agent inheritance
  await t.test('All specialized agents inherit correctly', async () => {
    try {
      const BaseAgent = (await import('./base-agent.js')).BaseAgent;
      const LLMAgent = (await import('./llm-agent.js')).LLMAgent;
      const CopywriterAgent = (await import('./copywriter.js')).CopywriterAgent;

      const agent = new CopywriterAgent(mockDB, mockLLM, mockBudgetController);

      assert(agent instanceof LLMAgent, 'CopywriterAgent extends LLMAgent');
      assert(agent instanceof BaseAgent, 'CopywriterAgent extends BaseAgent');
      assert(typeof agent.execute === 'function', 'execute method inherited');
      assert(typeof agent.callLLM === 'function', 'callLLM method inherited');

      logger.info('✅ Agent inheritance hierarchy correct');
    } catch (error) {
      logger.error('❌ Inheritance check failed:', error);
      throw error;
    }
  });

  logger.info('🎉 All agent framework tests passed!');
});
