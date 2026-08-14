/**
 * CAPABILITY REGISTRY
 *
 * Responsibilities:
 * 1. Maintain registry of all agent and tool capabilities
 * 2. Support dynamic discovery and versioning
 * 3. Track capability metadata (cost, rate limits, schemas)
 * 4. Enable swarm orchestration via capability queries
 * 5. Provide cost and rate-limit metadata to budget controller
 */

import logger from '../utils/logger.js';

class CapabilityRegistry {
  constructor(db) {
    this.db = db;
    this.capabilities = new Map(); // In-memory cache: key = "agent:version:tool"
    this.initialized = false;
  }

  /**
   * Initialize registry from database
   */
  async initialize() {
    try {
      const rows = await this.db.getAllCapabilities();
      this.capabilities.clear();

      for (const row of rows) {
        const key = `${row.agent_name}:${row.agent_version}:${row.tool_name}`;
        this.capabilities.set(key, {
          id: row.id,
          agent_name: row.agent_name,
          agent_version: row.agent_version,
          tool_name: row.tool_name,
          description: row.description,
          input_schema: row.input_schema,
          output_schema: row.output_schema,
          cost_per_call: row.cost_per_call,
          rate_limit: row.rate_limit,
          status: row.status,
          created_at: row.created_at,
          updated_at: row.updated_at
        });
      }

      this.initialized = true;
      logger.info(`✅ Capability Registry initialized with ${this.capabilities.size} capabilities`);
    } catch (error) {
      logger.error('Error initializing capability registry:', error);
      throw error;
    }
  }

  /**
   * Register a new capability
   */
  async registerCapability(agentName, agentVersion, toolName, metadata) {
    try {
      const {
        description = '',
        input_schema = {},
        output_schema = {},
        cost_per_call = 0,
        rate_limit = '',
        status = 'active'
      } = metadata;

      const result = await this.db.registerCapability({
        agent_name: agentName,
        agent_version: agentVersion,
        tool_name: toolName,
        description,
        input_schema,
        output_schema,
        cost_per_call,
        rate_limit,
        status
      });

      const key = `${agentName}:${agentVersion}:${toolName}`;
      this.capabilities.set(key, {
        id: result.id,
        agent_name: agentName,
        agent_version: agentVersion,
        tool_name: toolName,
        description,
        input_schema,
        output_schema,
        cost_per_call,
        rate_limit,
        status,
        created_at: result.created_at,
        updated_at: result.updated_at
      });

      logger.info(`✅ Capability registered: ${agentName}@${agentVersion} + ${toolName}`);
      return result;
    } catch (error) {
      logger.error('Error registering capability:', error);
      throw error;
    }
  }

  /**
   * Get capability by agent, version, and tool
   */
  getCapability(agentName, agentVersion, toolName) {
    const key = `${agentName}:${agentVersion}:${toolName}`;
    return this.capabilities.get(key) || null;
  }

  /**
   * Get all capabilities for an agent
   */
  getAgentCapabilities(agentName, agentVersion) {
    const results = [];
    for (const [key, cap] of this.capabilities.entries()) {
      if (cap.agent_name === agentName && cap.agent_version === agentVersion) {
        results.push(cap);
      }
    }
    return results;
  }

  /**
   * Find agents that can execute a tool
   */
  findAgentsForTool(toolName) {
    const results = [];
    for (const [key, cap] of this.capabilities.entries()) {
      if (cap.tool_name === toolName && cap.status === 'active') {
        results.push({
          agent_name: cap.agent_name,
          agent_version: cap.agent_version,
          cost_per_call: cap.cost_per_call,
          rate_limit: cap.rate_limit
        });
      }
    }
    return results;
  }

  /**
   * Get capabilities matching a filter
   */
  query(filter) {
    const results = [];

    for (const [key, cap] of this.capabilities.entries()) {
      let match = true;

      if (filter.agent_name && cap.agent_name !== filter.agent_name) {
        match = false;
      }
      if (filter.agent_version && cap.agent_version !== filter.agent_version) {
        match = false;
      }
      if (filter.tool_name && cap.tool_name !== filter.tool_name) {
        match = false;
      }
      if (filter.status && cap.status !== filter.status) {
        match = false;
      }

      if (match) {
        results.push(cap);
      }
    }

    return results;
  }

  /**
   * Update capability status (active | deprecated | beta)
   */
  async updateCapabilityStatus(agentName, agentVersion, toolName, newStatus) {
    try {
      await this.db.updateCapabilityStatus(agentName, agentVersion, toolName, newStatus);

      const key = `${agentName}:${agentVersion}:${toolName}`;
      const cap = this.capabilities.get(key);
      if (cap) {
        cap.status = newStatus;
        cap.updated_at = new Date().toISOString();
      }

      logger.info(`✅ Capability status updated: ${agentName}@${agentVersion}/${toolName} → ${newStatus}`);
    } catch (error) {
      logger.error('Error updating capability status:', error);
      throw error;
    }
  }

  /**
   * Get cost estimate for a capability
   */
  estimateCost(agentName, agentVersion, toolName, params = {}) {
    const cap = this.getCapability(agentName, agentVersion, toolName);
    if (!cap) {
      logger.warn(`Capability not found for cost estimation: ${agentName}@${agentVersion}/${toolName}`);
      return 0;
    }

    // Base cost per call
    let cost = cap.cost_per_call;

    // Could extend with parameterized costs if needed
    // E.g., cost based on input size, output size, etc.

    return cost;
  }

  /**
   * Check if capability is available and not rate-limited
   */
  async canInvoke(agentName, agentVersion, toolName) {
    const cap = this.getCapability(agentName, agentVersion, toolName);
    if (!cap) {
      return { allowed: false, reason: 'Capability not found' };
    }

    if (cap.status !== 'active') {
      return { allowed: false, reason: `Capability status is ${cap.status}` };
    }

    // Rate limit check would go here (requires tracking recent invocations)
    // For now, assume available if active

    return { allowed: true, cost_per_call: cap.cost_per_call };
  }

  /**
   * List all capabilities (with optional filter)
   */
  listCapabilities(filter = {}) {
    const results = [];

    for (const [key, cap] of this.capabilities.entries()) {
      let match = true;

      if (filter.status && cap.status !== filter.status) {
        match = false;
      }

      if (match) {
        results.push({
          agent_name: cap.agent_name,
          agent_version: cap.agent_version,
          tool_name: cap.tool_name,
          description: cap.description,
          status: cap.status,
          cost_per_call: cap.cost_per_call,
          rate_limit: cap.rate_limit
        });
      }
    }

    return results;
  }

  /**
   * Get registry stats
   */
  getStats() {
    const stats = {
      total: this.capabilities.size,
      by_status: {},
      by_agent: {},
      total_cost_estimate: 0
    };

    for (const [key, cap] of this.capabilities.entries()) {
      // By status
      stats.by_status[cap.status] = (stats.by_status[cap.status] || 0) + 1;

      // By agent
      const agentKey = `${cap.agent_name}@${cap.agent_version}`;
      stats.by_agent[agentKey] = (stats.by_agent[agentKey] || 0) + 1;

      // Cost estimate (sum of all capabilities)
      stats.total_cost_estimate += cap.cost_per_call;
    }

    return stats;
  }
}

export { CapabilityRegistry };
