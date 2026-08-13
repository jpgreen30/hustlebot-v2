/**
 * AGENT ORCHESTRATOR
 *
 * Simplified orchestrator for future agent support.
 * Agents will be implemented incrementally.
 */

import logger from '../utils/logger.js';

class AgentOrchestrator {
  constructor(db, llm, budgetController) {
    this.db = db;
    this.llm = llm;
    this.budgetController = budgetController;
    this.agents = {};
    this.activeSwarms = new Map();
    logger.info('✅ Agent orchestrator initialized (agent support coming soon)');
  }

  registerAgent(name, agent) {
    this.agents[name] = agent;
  }

  async spawnSwarm(swarmName, userId, projectId, parameters) {
    logger.info(`Swarm requested: ${swarmName} (agent support coming soon)`);
    return {
      success: false,
      message: 'Agent swarms coming soon'
    };
  }

  aggregateResults(results) {
    return {
      summary: 'Agent support coming soon',
      total_cost: 0,
      duration_seconds: 0
    };
  }

  getStats() {
    return {
      active_swarms: this.activeSwarms.size,
      agents: Object.keys(this.agents).length
    };
  }
}

export { AgentOrchestrator };
