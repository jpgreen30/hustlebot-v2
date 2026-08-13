/**
 * AGENT ORCHESTRATOR
 * 
 * Responsibilities:
 * 1. Spawn agent swarms based on commands
 * 2. Coordinate multi-agent execution
 * 3. Track execution time and cost
 * 4. Handle inter-agent communication
 * 5. Aggregate results
 * 6. Manage fallbacks and retries
 */

import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

class AgentOrchestrator {
  constructor(db, llm, budgetController) {
    this.db = db;
    this.llm = llm;
    this.budgetController = budgetController;
    
    // Registry of available agents
    this.agents = {};
    this.activeSwarms = new Map();
    this.executionLogs = [];
    
    // Initialize all agents
    this.initializeAgents();
  }

  /**
   * Initialize all 17 agents
   */
  initializeAgents() {
    try {
      // Import agent classes
      const {
        CopywriterAgent
      } = require('./copywriter.js');
      const {
        ContentWriterAgent
      } = require('./content-writer.js');
      const {
        FrontendDeveloperAgent
      } = require('./frontend-developer.js');
      const {
        BackendDeveloperAgent
      } = require('./backend-developer.js');
      const {
        DatabaseAgent
      } = require('./database-agent.js');
      const {
        DevOpsAgent
      } = require('./devops-agent.js');
      const {
        LandingPageAgent,
        ProductAgent,
        MarketingAgent,
        SalesAgent,
        FinanceAgent,
        AnalyticsAgent,
        IdeationAgent,
        VideoAgent,
        SocialMediaAgent
      } = require('./specialized-agents.js');

      // Register all agents
      this.registerAgent('copywriter', new CopywriterAgent(this.db, this.llm, this.budgetController));
      this.registerAgent('content_writer', new ContentWriterAgent(this.db, this.llm, this.budgetController));
      this.registerAgent('frontend_developer', new FrontendDeveloperAgent(this.db, this.llm, this.budgetController));
      this.registerAgent('backend_developer', new BackendDeveloperAgent(this.db, this.llm, this.budgetController));
      this.registerAgent('database_agent', new DatabaseAgent(this.db, this.llm, this.budgetController));
      this.registerAgent('devops_agent', new DevOpsAgent(this.db, this.llm, this.budgetController));
      this.registerAgent('landing_page', new LandingPageAgent(this.db, this.llm, this.budgetController));
      this.registerAgent('product', new ProductAgent(this.db, this.llm, this.budgetController));
      this.registerAgent('marketing', new MarketingAgent(this.db, this.llm, this.budgetController));
      this.registerAgent('sales', new SalesAgent(this.db, this.llm, this.budgetController));
      this.registerAgent('finance', new FinanceAgent(this.db, this.llm, this.budgetController));
      this.registerAgent('analytics', new AnalyticsAgent(this.db, this.llm, this.budgetController));
      this.registerAgent('ideation', new IdeationAgent(this.db, this.llm, this.budgetController));
      this.registerAgent('video', new VideoAgent(this.db, this.llm, this.budgetController));
      this.registerAgent('social_media', new SocialMediaAgent(this.db, this.llm, this.budgetController));

      logger.info(`✅ Initialized all 15 agents`);
    } catch (error) {
      logger.error('Error initializing agents:', error);
      throw error;
    }
  }

  /**
   * Register an agent
   */
  registerAgent(name, agent) {
    this.agents[name] = agent;
    logger.info(`✅ Registered agent: ${name}`);
  }

  /**
   * Get available tools (for MCP exposure)
   */
  getAvailableTools() {
    const tools = [];

    // List all agent capabilities as tools
    for (const [agentName, agent] of Object.entries(this.agents)) {
      if (agent.getTools) {
        const agentTools = agent.getTools();
        tools.push(...agentTools);
      }
    }

    return tools;
  }

  /**
   * Execute a specific tool
   */
  async executeTool(toolName, args, userId) {
    try {
      // Find which agent owns this tool
      for (const [agentName, agent] of Object.entries(this.agents)) {
        if (agent.canExecute && agent.canExecute(toolName)) {
          logger.info(`Executing tool: ${toolName} via agent: ${agentName}`);
          return await agent.execute(toolName, args);
        }
      }

      throw new Error(`Tool not found: ${toolName}`);
    } catch (error) {
      logger.error(`Tool execution failed: ${toolName}`, error);
      throw error;
    }
  }

  /**
   * Spawn a swarm of agents for a specific task
   */
  async spawnSwarm(swarmName, userId, projectId, params = {}) {
    try {
      const swarmId = uuidv4();
      const startTime = Date.now();

      logger.info(`🐝 Spawning swarm: ${swarmName} (${swarmId})`);

      const swarm = {
        id: swarmId,
        name: swarmName,
        userId,
        projectId,
        status: 'initializing',
        agents: [],
        results: {},
        startTime,
        endTime: null,
        totalCost: 0,
        error: null
      };

      this.activeSwarms.set(swarmId, swarm);

      // Spawn agents based on swarm type
      let agents = [];
      
      switch (swarmName) {
        case 'landing_page_swarm':
          agents = [
            'copywriter',
            'frontend_developer',
            'designer',
            'integration_agent',
            'devops'
          ];
          break;

        case 'lead_gen_swarm':
          agents = [
            'scraper',
            'lead_validator',
            'lead_enricher',
            'lead_scorer',
            'delivery_agent'
          ];
          break;

        case 'ecommerce_swarm':
          agents = [
            'product_agent',
            'frontend_developer',
            'backend_developer',
            'designer',
            'integration_agent',
            'devops'
          ];
          break;

        case 'content_swarm':
          agents = [
            'content_writer',
            'seo_optimizer',
            'image_generator',
            'distributor'
          ];
          break;

        default:
          logger.warn(`Unknown swarm type: ${swarmName}`);
          agents = [];
      }

      swarm.agents = agents;

      // Execute agents in parallel where possible
      const results = await this.executeAgentPipeline(
        agents,
        projectId,
        params,
        swarm
      );

      swarm.results = results;
      swarm.status = 'completed';
      swarm.endTime = Date.now();

      logger.info(
        `✅ Swarm completed: ${swarmName} in ${swarm.endTime - startTime}ms`
      );

      return swarm;
    } catch (error) {
      logger.error(`Swarm execution failed: ${swarmName}`, error);
      
      const swarm = this.activeSwarms.get(swarmId);
      if (swarm) {
        swarm.status = 'failed';
        swarm.error = error.message;
        swarm.endTime = Date.now();
      }

      throw error;
    }
  }

  /**
   * Execute agents in a pipeline (sequential or parallel)
   */
  async executeAgentPipeline(agents, projectId, params, swarm) {
    try {
      const results = {};
      let previousOutput = null;

      logger.info(`Executing ${agents.length} agents in pipeline`);

      for (const agentName of agents) {
        if (!this.agents[agentName]) {
          logger.warn(`Agent not registered: ${agentName}`);
          continue;
        }

        const agent = this.agents[agentName];

        try {
          // Execute agent with output from previous agent
          const agentInput = {
            ...params,
            previousOutput,
            projectId
          };

          logger.debug(`Executing agent: ${agentName}`);

          const startTime = Date.now();
          const agentResult = await agent.execute(agentInput);
          const executionTime = Date.now() - startTime;

          results[agentName] = agentResult;
          previousOutput = agentResult;

          // Log execution
          await this.db.logAgentExecution(
            agentName,
            projectId,
            agentInput,
            agentResult,
            executionTime
          );

          // Track cost
          if (agentResult.cost) {
            swarm.totalCost += agentResult.cost;
          }

          logger.debug(
            `✅ ${agentName} completed in ${executionTime}ms (cost: $${agentResult.cost || 0})`
          );
        } catch (error) {
          logger.error(`Agent failed: ${agentName}`, error);

          // Store error but continue with next agent
          results[agentName] = {
            error: error.message,
            success: false
          };
        }
      }

      return results;
    } catch (error) {
      logger.error('Pipeline execution failed:', error);
      throw error;
    }
  }

  /**
   * Aggregate swarm results into user-facing output
   */
  aggregateResults(swarm) {
    const { name, results, totalCost, startTime, endTime } = swarm;

    const aggregated = {
      swarm_name: name,
      duration_seconds: (endTime - startTime) / 1000,
      total_cost: parseFloat(totalCost.toFixed(4)),
      status: swarm.status,
      results: {},
      summary: ''
    };

    // Aggregate by swarm type
    switch (name) {
      case 'landing_page_swarm':
        aggregated.results = {
          landing_page_url: results.frontend_developer?.url,
          domain: results.integration_agent?.domain,
          stripe_connected: results.integration_agent?.stripe_active,
          email_capture_active: results.integration_agent?.email_capture_active,
          analytics_configured: results.integration_agent?.analytics_active
        };
        aggregated.summary = `✅ Landing page live at ${results.frontend_developer?.url}`;
        break;

      case 'lead_gen_swarm':
        aggregated.results = {
          leads_generated: results.lead_enricher?.leads?.length || 0,
          leads_validated: results.lead_validator?.validated_count || 0,
          average_quality_score: results.lead_scorer?.average_score || 0,
          delivery_status: results.delivery_agent?.status
        };
        aggregated.summary = `✅ ${results.lead_enricher?.leads?.length || 0} leads generated`;
        break;

      case 'content_swarm':
        aggregated.results = {
          content_pieces: results.content_writer?.count || 0,
          seo_optimized: results.seo_optimizer?.optimized_count || 0,
          images_generated: results.image_generator?.count || 0,
          distribution_status: results.distributor?.status
        };
        aggregated.summary = `✅ ${results.content_writer?.count || 0} content pieces created`;
        break;

      default:
        aggregated.summary = '✅ Swarm execution completed';
    }

    return aggregated;
  }

  /**
   * Get swarm status (real-time)
   */
  getSwarmStatus(swarmId) {
    const swarm = this.activeSwarms.get(swarmId);
    if (!swarm) {
      return null;
    }

    const elapsed = Date.now() - swarm.startTime;

    return {
      swarm_id: swarmId,
      name: swarm.name,
      status: swarm.status,
      agents_running: swarm.agents.length,
      elapsed_seconds: (elapsed / 1000).toFixed(1),
      cost_so_far: parseFloat(swarm.totalCost.toFixed(4)),
      progress: this.estimateProgress(swarm)
    };
  }

  /**
   * Estimate swarm progress (0-100%)
   */
  estimateProgress(swarm) {
    if (swarm.status === 'completed') return 100;
    if (swarm.status === 'failed') return 0;

    const completedAgents = Object.keys(swarm.results).length;
    const totalAgents = swarm.agents.length;

    return Math.round((completedAgents / totalAgents) * 100);
  }

  /**
   * Cancel a running swarm
   */
  async cancelSwarm(swarmId) {
    try {
      const swarm = this.activeSwarms.get(swarmId);
      if (!swarm) {
        throw new Error(`Swarm not found: ${swarmId}`);
      }

      swarm.status = 'cancelled';
      swarm.endTime = Date.now();

      logger.info(`Cancelled swarm: ${swarmId}`);
      return { success: true, swarmId };
    } catch (error) {
      logger.error('Error cancelling swarm:', error);
      throw error;
    }
  }

  /**
   * Get execution statistics
   */
  getStats() {
    const activeSwarms = Array.from(this.activeSwarms.values());
    const completedSwarms = activeSwarms.filter(s => s.status === 'completed');
    const failedSwarms = activeSwarms.filter(s => s.status === 'failed');

    return {
      total_swarms: activeSwarms.length,
      completed: completedSwarms.length,
      failed: failedSwarms.length,
      active: activeSwarms.filter(s => s.status === 'initializing' || s.status === 'in_progress').length,
      total_cost: activeSwarms.reduce((sum, s) => sum + s.totalCost, 0),
      average_cost_per_swarm: completedSwarms.length > 0 
        ? (activeSwarms.reduce((sum, s) => sum + s.totalCost, 0) / completedSwarms.length)
        : 0
    };
  }
}

export { AgentOrchestrator };
