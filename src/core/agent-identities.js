/**
 * AGENT IDENTITIES
 *
 * Responsibilities:
 * 1. Define and manage versioned agent objects
 * 2. Track agent metadata (name, role, version, capabilities)
 * 3. Maintain deployment state (active, deprecated, beta)
 * 4. Support agent discovery and querying
 * 5. Enable swarm composition (which agents are deployed together)
 */

import logger from '../utils/logger.js';

class AgentIdentities {
  constructor(db, capabilityRegistry) {
    this.db = db;
    this.capabilityRegistry = capabilityRegistry;
    this.agents = new Map(); // key = agentId, value = agent identity
    this.agentsByRole = new Map(); // key = role, value = array of agent IDs
    this.initialized = false;
  }

  /**
   * Initialize agent identities from database
   */
  async initialize() {
    try {
      logger.info('🤖 Initializing Agent Identities...');

      if (this.db) {
        const rows = await this.db.getAllAgents();
        for (const row of rows) {
          const agent = {
            id: row.id,
            name: row.name,
            version: row.version,
            role: row.role,
            description: row.description,
            capabilities: row.capabilities, // Array of capability IDs
            status: row.status, // active | deprecated | beta
            max_concurrent_instances: row.max_concurrent_instances || 1,
            memory_required_mb: row.memory_required_mb || 256,
            timeout_seconds: row.timeout_seconds || 300,
            cost_per_execution: row.cost_per_execution || 0,
            parameters: row.parameters || {},
            created_at: row.created_at,
            updated_at: row.updated_at
          };

          this.agents.set(row.id, agent);

          if (!this.agentsByRole.has(row.role)) {
            this.agentsByRole.set(row.role, []);
          }
          this.agentsByRole.get(row.role).push(row.id);
        }

        logger.info(`✅ Loaded ${this.agents.size} agent identities`);
      }

      this.initialized = true;
      logger.info(`✅ Agent Identities initialized`);
    } catch (error) {
      logger.error('Error initializing agent identities:', error);
      throw error;
    }
  }

  /**
   * Register a new agent identity
   */
  async registerAgent(agentId, metadata) {
    try {
      const {
        name = agentId,
        version = '1.0',
        role = 'general',
        description = '',
        capabilities = [],
        status = 'active',
        max_concurrent_instances = 1,
        memory_required_mb = 256,
        timeout_seconds = 300,
        cost_per_execution = 0,
        parameters = {}
      } = metadata;

      const agent = {
        id: agentId,
        name,
        version,
        role,
        description,
        capabilities,
        status,
        max_concurrent_instances,
        memory_required_mb,
        timeout_seconds,
        cost_per_execution,
        parameters,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      this.agents.set(agentId, agent);

      if (!this.agentsByRole.has(role)) {
        this.agentsByRole.set(role, []);
      }
      if (!this.agentsByRole.get(role).includes(agentId)) {
        this.agentsByRole.get(role).push(agentId);
      }

      if (this.db) {
        await this.db.registerAgent(agent);
      }

      logger.info(`✅ Agent registered: ${name} (${version}) @ ${role}`);
      return agent;
    } catch (error) {
      logger.error('Error registering agent:', error);
      throw error;
    }
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId) {
    return this.agents.get(agentId) || null;
  }

  /**
   * Get agents by role
   */
  getAgentsByRole(role) {
    const agentIds = this.agentsByRole.get(role) || [];
    return agentIds
      .map(id => this.agents.get(id))
      .filter(agent => agent && agent.status === 'active');
  }

  /**
   * Find best agent for a task (by role, considering capabilities)
   */
  async findAgentForTask(role, requiredCapabilities = []) {
    try {
      const candidates = this.getAgentsByRole(role);

      if (candidates.length === 0) {
        logger.warn(`No agents found for role: ${role}`);
        return null;
      }

      // Filter by required capabilities
      if (requiredCapabilities.length > 0) {
        const filtered = candidates.filter(agent => {
          for (const capId of requiredCapabilities) {
            if (!agent.capabilities.includes(capId)) {
              return false;
            }
          }
          return true;
        });

        if (filtered.length === 0) {
          logger.warn(`No agents found for role ${role} with capabilities: ${requiredCapabilities}`);
          return null;
        }

        return filtered[0]; // Return first match (could add scoring/ranking)
      }

      return candidates[0];
    } catch (error) {
      logger.error('Error finding agent for task:', error);
      throw error;
    }
  }

  /**
   * Get all agents
   */
  listAgents(filter = {}) {
    const results = [];

    for (const [id, agent] of this.agents.entries()) {
      let match = true;

      if (filter.status && agent.status !== filter.status) {
        match = false;
      }
      if (filter.role && agent.role !== filter.role) {
        match = false;
      }

      if (match) {
        results.push({
          id: agent.id,
          name: agent.name,
          version: agent.version,
          role: agent.role,
          status: agent.status,
          description: agent.description
        });
      }
    }

    return results;
  }

  /**
   * Update agent status (active | deprecated | beta)
   */
  async updateAgentStatus(agentId, newStatus) {
    try {
      const agent = this.agents.get(agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      agent.status = newStatus;
      agent.updated_at = new Date().toISOString();

      if (this.db) {
        await this.db.updateAgentStatus(agentId, newStatus);
      }

      logger.info(`✅ Agent status updated: ${agentId} → ${newStatus}`);
      return agent;
    } catch (error) {
      logger.error('Error updating agent status:', error);
      throw error;
    }
  }

  /**
   * Update agent capabilities
   */
  async updateAgentCapabilities(agentId, capabilities) {
    try {
      const agent = this.agents.get(agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      agent.capabilities = capabilities;
      agent.updated_at = new Date().toISOString();

      if (this.db) {
        await this.db.updateAgentCapabilities(agentId, capabilities);
      }

      logger.info(`✅ Agent capabilities updated: ${agentId} (${capabilities.length} capabilities)`);
      return agent;
    } catch (error) {
      logger.error('Error updating agent capabilities:', error);
      throw error;
    }
  }

  /**
   * Get agent swarm composition (agents grouped by role)
   */
  getSwarmComposition() {
    const composition = {};

    for (const [role, agentIds] of this.agentsByRole.entries()) {
      const activeAgents = agentIds
        .map(id => this.agents.get(id))
        .filter(agent => agent && agent.status === 'active');

      if (activeAgents.length > 0) {
        composition[role] = activeAgents.map(agent => ({
          id: agent.id,
          name: agent.name,
          version: agent.version
        }));
      }
    }

    return composition;
  }

  /**
   * Get agent capabilities
   */
  async getAgentCapabilities(agentId) {
    try {
      const agent = this.agents.get(agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      if (!this.capabilityRegistry) {
        return [];
      }

      // Get detailed capability info from capability registry
      const capabilities = [];
      for (const capId of agent.capabilities) {
        // Note: this is simplified; real implementation would query registry by ID
        capabilities.push(capId);
      }

      return capabilities;
    } catch (error) {
      logger.error('Error getting agent capabilities:', error);
      throw error;
    }
  }

  /**
   * Get agent requirements (memory, timeout, cost)
   */
  getAgentRequirements(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return null;
    }

    return {
      memory_required_mb: agent.memory_required_mb,
      timeout_seconds: agent.timeout_seconds,
      cost_per_execution: agent.cost_per_execution,
      max_concurrent_instances: agent.max_concurrent_instances
    };
  }

  /**
   * Get registry statistics
   */
  getStats() {
    const stats = {
      total_agents: this.agents.size,
      by_status: {},
      by_role: {},
      total_capabilities: 0
    };

    for (const [id, agent] of this.agents.entries()) {
      stats.by_status[agent.status] = (stats.by_status[agent.status] || 0) + 1;
      stats.by_role[agent.role] = (stats.by_role[agent.role] || 0) + 1;
      stats.total_capabilities += agent.capabilities.length;
    }

    return stats;
  }

  /**
   * Validate agent identity (check for required fields)
   */
  validateAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return { valid: false, errors: ['Agent not found'] };
    }

    const errors = [];

    if (!agent.name) errors.push('Missing agent name');
    if (!agent.role) errors.push('Missing agent role');
    if (!agent.version) errors.push('Missing agent version');
    if (!['active', 'deprecated', 'beta'].includes(agent.status)) {
      errors.push(`Invalid status: ${agent.status}`);
    }
    if (agent.timeout_seconds < 1) {
      errors.push('Invalid timeout (must be >= 1 second)');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

export { AgentIdentities };
