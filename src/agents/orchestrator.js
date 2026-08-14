/**
 * AGENT ORCHESTRATOR
 *
 * Phase 1.3: Orchestrator Rewiring
 * Integrates all Phase 1 registries for multi-agent swarm coordination:
 * - Capability Registry: Agent discovery by task
 * - Agent Identities: Swarm composition
 * - Job Queue: Task execution & retry logic
 * - Agent Mailbox: Inter-agent coordination
 * - Audit Logs: Operation tracking
 * - Policy Layer: Budget enforcement & approval gates
 */

import logger from '../utils/logger.js';
import { v4 as uuid } from 'uuid';

class AgentOrchestrator {
  constructor(capabilityRegistry, agentIdentities, jobQueue, mailbox, auditLogs, policies, planningDAG) {
    this.capabilityRegistry = capabilityRegistry;
    this.agentIdentities = agentIdentities;
    this.jobQueue = jobQueue;
    this.mailbox = mailbox;
    this.auditLogs = auditLogs;
    this.policies = policies;
    this.planningDAG = planningDAG;
    this.activeSwarms = new Map();
    logger.info('✅ Agent orchestrator initialized with Phase 1 registries');
  }

  /**
   * Spawn a swarm to execute a task
   * 1. Check policy/budget
   * 2. Discover agents via capability registry
   * 3. Create swarm from agent identities
   * 4. Queue work via job queue
   * 5. Coordinate via mailbox
   * 6. Log all operations
   */
  async spawnSwarm(taskName, userId, projectId, parameters = {}, options = {}) {
    const swarmId = uuid();
    const startTime = Date.now();

    try {
      logger.info(`🚀 Spawning swarm ${swarmId} for task: ${taskName}`);

      // Step 1: Policy & Budget Check
      logger.info(`📋 Checking policy for user ${userId}...`);
      const policy = await this.policies.getPolicy(userId);
      if (!policy) {
        logger.warn(`⚠️  No policy found for user ${userId}, using defaults`);
      }

      // Estimate task cost
      const estimatedCost = await this.estimateTaskCost(taskName, parameters);
      logger.info(`💰 Estimated cost: $${estimatedCost.toFixed(4)}`);

      const canProceed = await this.policies.checkPolicy(userId, 'execute_agent', estimatedCost);
      if (!canProceed) {
        await this.auditLogs.log({
          actor_type: 'orchestrator',
          actor_id: 'orchestrator-' + swarmId,
          action: 'policy_check_failed',
          resource_type: 'swarm',
          resource_id: swarmId,
          result: 'denied',
          metadata: { reason: 'budget_limit_exceeded', task: taskName, userId }
        });
        logger.warn(`❌ Policy check failed for user ${userId}`);
        return {
          success: false,
          swarmId,
          error: 'Budget limit exceeded',
          estimatedCost
        };
      }

      // Log policy check passed
      await this.auditLogs.log({
        actor_type: 'orchestrator',
        actor_id: 'orchestrator-' + swarmId,
        action: 'policy_checked',
        resource_type: 'swarm',
        resource_id: swarmId,
        result: 'approved',
        metadata: { task: taskName, userId, estimatedCost }
      });

      // Step 2: Discover Agents via Capability Registry
      logger.info(`🔍 Discovering agents for task: ${taskName}...`);
      const agents = await this.discoverAgentsForTask(taskName, parameters);

      if (agents.length === 0) {
        logger.warn(`⚠️  No agents found for task: ${taskName}`);
        await this.auditLogs.log({
          actor_type: 'orchestrator',
          actor_id: 'orchestrator-' + swarmId,
          action: 'agent_discovery_failed',
          resource_type: 'swarm',
          resource_id: swarmId,
          result: 'no_agents_found',
          metadata: { task: taskName }
        });
        return {
          success: false,
          swarmId,
          error: 'No agents available for this task',
          agents: []
        };
      }

      logger.info(`✅ Found ${agents.length} agents: ${agents.map(a => a.name).join(', ')}`);

      // Step 3: Compose Swarm from Agent Identities
      logger.info(`👥 Composing swarm...`);
      const swarm = await this.composeSwarm(swarmId, agents, options);
      logger.info(`✅ Swarm ${swarmId} composed with ${swarm.agents.length} members`);

      await this.auditLogs.log({
        actor_type: 'orchestrator',
        actor_id: 'orchestrator-' + swarmId,
        action: 'swarm_spawned',
        resource_type: 'swarm',
        resource_id: swarmId,
        result: 'success',
        metadata: { task: taskName, agents: swarm.agents.map(a => a.id), userId }
      });

      // Step 4: Queue Work via Job Queue
      logger.info(`📦 Queuing work...`);
      const job = await this.jobQueue.enqueue({
        swarm_id: swarmId,
        task_name: taskName,
        parameters,
        user_id: userId,
        project_id: projectId,
        agents: swarm.agents.map(a => a.id),
        status: 'queued',
        priority: options.priority || 'normal',
        max_attempts: options.maxAttempts || 3,
        timeout_ms: options.timeout || 30000
      });

      logger.info(`✅ Job ${job.job_id} queued for swarm ${swarmId}`);

      // Step 5: Coordinate via Mailbox (broadcast task to agents)
      logger.info(`📬 Broadcasting task to agents...`);
      const messageIds = [];
      for (const agent of swarm.agents) {
        const msgId = await this.mailbox.sendMessage({
          from_agent_id: 'orchestrator-' + swarmId,
          to_agent_id: agent.id,
          message_type: 'request',
          payload: {
            task_name: taskName,
            parameters,
            swarm_id: swarmId,
            job_id: job.job_id,
            timestamp: new Date().toISOString()
          },
          priority: options.priority || 'normal'
        });
        messageIds.push(msgId);
      }

      logger.info(`✅ Broadcast ${messageIds.length} task messages`);

      // Log broadcast
      await this.auditLogs.log({
        actor_type: 'orchestrator',
        actor_id: 'orchestrator-' + swarmId,
        action: 'agents_notified',
        resource_type: 'swarm',
        resource_id: swarmId,
        result: 'success',
        metadata: { messageCount: messageIds.length, agents: swarm.agents.map(a => a.id) }
      });

      // Store swarm state
      this.activeSwarms.set(swarmId, {
        id: swarmId,
        taskName,
        jobId: job.job_id,
        agents: swarm.agents,
        status: 'running',
        createdAt: new Date(),
        userId,
        projectId,
        estimatedCost,
        actualCost: 0,
        messages: messageIds
      });

      logger.info(`🎉 Swarm ${swarmId} spawned successfully`);

      return {
        success: true,
        swarmId,
        jobId: job.job_id,
        agents: swarm.agents.map(a => ({ id: a.id, name: a.name, role: a.role })),
        estimatedCost,
        status: 'running'
      };
    } catch (error) {
      logger.error(`❌ Swarm spawn failed: ${error.message}`);
      await this.auditLogs.log({
        actor_type: 'orchestrator',
        actor_id: 'orchestrator-' + swarmId,
        action: 'swarm_spawn_error',
        resource_type: 'swarm',
        resource_id: swarmId,
        result: 'error',
        metadata: { error: error.message, task: taskName }
      });
      throw error;
    }
  }

  /**
   * Discover agents capable of performing a task using capability registry
   */
  async discoverAgentsForTask(taskName, parameters = {}) {
    try {
      // Parse task into required capabilities
      const requiredCapabilities = this.parseTaskCapabilities(taskName);

      // Query capability registry for matching agents
      const matches = [];
      for (const capability of requiredCapabilities) {
        const agents = await this.capabilityRegistry.query({
          tool_name: capability,
          status: 'active'
        });
        matches.push(...agents);
      }

      // Deduplicate and enrich with full agent data
      const uniqueAgentNames = [...new Set(matches.map(m => m.agent_name))];
      const agents = [];

      for (const agentName of uniqueAgentNames) {
        const agent = await this.agentIdentities.findAgentForTask(taskName);
        if (agent) {
          agents.push(agent);
        }
      }

      return agents;
    } catch (error) {
      logger.error(`Error discovering agents: ${error.message}`);
      return [];
    }
  }

  /**
   * Parse task name into required capabilities
   */
  parseTaskCapabilities(taskName) {
    const taskLower = taskName.toLowerCase();
    const capabilities = [];

    // Map task keywords to tool capabilities
    if (taskLower.includes('landing') || taskLower.includes('page')) {
      capabilities.push('landing_page_builder');
    }
    if (taskLower.includes('lead') || taskLower.includes('prospect')) {
      capabilities.push('lead_generator');
    }
    if (taskLower.includes('email') || taskLower.includes('campaign')) {
      capabilities.push('email_campaign');
    }
    if (taskLower.includes('content') || taskLower.includes('write')) {
      capabilities.push('content_generator');
    }
    if (taskLower.includes('image') || taskLower.includes('visual')) {
      capabilities.push('image_generator');
    }
    if (taskLower.includes('video') || taskLower.includes('media')) {
      capabilities.push('video_generator');
    }
    if (taskLower.includes('code') || taskLower.includes('development')) {
      capabilities.push('code_generator');
    }
    if (taskLower.includes('analyze') || taskLower.includes('data')) {
      capabilities.push('data_analyzer');
    }

    return capabilities.length > 0 ? capabilities : ['content_generator']; // default fallback
  }

  /**
   * Compose swarm from discovered agents
   */
  async composeSwarm(swarmId, agents, options = {}) {
    const composition = await this.agentIdentities.getSwarmComposition(
      agents.map(a => a.id || a.name),
      {
        role_distribution: options.roleDistribution || 'mixed',
        max_members: options.maxMembers || 5,
        specialization: options.specialization || 'general'
      }
    );

    return {
      id: swarmId,
      agents: composition.agents || agents,
      roles: composition.roles || {},
      capabilities: composition.capabilities || [],
      totalCapacity: composition.totalCapacity || 0
    };
  }

  /**
   * Estimate cost of executing a task
   */
  async estimateTaskCost(taskName, parameters = {}) {
    try {
      const agents = await this.discoverAgentsForTask(taskName, parameters);
      let totalCost = 0;

      for (const agent of agents) {
        totalCost += agent.cost_per_execution || 0;
      }

      // Add tool invocation costs
      const capabilities = this.parseTaskCapabilities(taskName);
      for (const toolName of capabilities) {
        const matches = await this.capabilityRegistry.query({ tool_name: toolName });
        for (const match of matches) {
          totalCost += match.cost_per_call || 0;
        }
      }

      return Math.max(totalCost, 0.01); // minimum $0.01
    } catch (error) {
      logger.error(`Error estimating cost: ${error.message}`);
      return 0.10; // conservative default
    }
  }

  /**
   * Get status of a running swarm
   */
  async getSwarmStatus(swarmId) {
    const swarm = this.activeSwarms.get(swarmId);
    if (!swarm) {
      return null;
    }

    // Get job status
    const job = await this.jobQueue.getJob(swarm.jobId);
    const messages = await this.mailbox.queryMessages({
      conversation_id: swarmId
    });

    return {
      swarmId,
      taskName: swarm.taskName,
      status: job?.status || 'unknown',
      agents: swarm.agents,
      createdAt: swarm.createdAt,
      messageCount: messages.length,
      estimatedCost: swarm.estimatedCost,
      actualCost: swarm.actualCost
    };
  }

  /**
   * Aggregate results from swarm execution
   */
  async aggregateResults(swarmId) {
    try {
      const swarm = this.activeSwarms.get(swarmId);
      if (!swarm) {
        return {
          success: false,
          error: 'Swarm not found'
        };
      }

      // Get all messages in conversation thread
      const messages = await this.mailbox.queryMessages({
        conversation_id: swarmId
      });

      // Extract results from agent responses
      const results = [];
      const responses = messages.filter(m => m.message_type === 'response');

      for (const response of responses) {
        if (response.payload?.result) {
          results.push({
            agent: response.from_agent_id,
            result: response.payload.result,
            timestamp: response.created_at
          });
        }
      }

      // Get execution logs
      const logs = await this.auditLogs.queryLogs({
        resource_id: swarmId
      });

      const duration = Date.now() - swarm.createdAt.getTime();

      logger.info(`✅ Swarm ${swarmId} completed: ${results.length} results, $${swarm.actualCost.toFixed(4)} cost`);

      await this.auditLogs.log({
        actor_type: 'orchestrator',
        actor_id: 'orchestrator-' + swarmId,
        action: 'swarm_completed',
        resource_type: 'swarm',
        resource_id: swarmId,
        result: 'success',
        metadata: { resultCount: results.length, duration, cost: swarm.actualCost }
      });

      this.activeSwarms.delete(swarmId);

      return {
        success: true,
        swarmId,
        results,
        summary: this.summarizeResults(results),
        total_cost: swarm.actualCost,
        duration_seconds: Math.round(duration / 1000),
        audit_trail: logs
      };
    } catch (error) {
      logger.error(`Error aggregating results: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Summarize swarm execution results
   */
  summarizeResults(results) {
    if (results.length === 0) {
      return 'No results produced';
    }

    return `Executed by ${new Set(results.map(r => r.agent)).size} agents, produced ${results.length} outputs`;
  }

  /**
   * Cancel a running swarm
   */
  async cancelSwarm(swarmId, reason = 'user_requested') {
    try {
      const swarm = this.activeSwarms.get(swarmId);
      if (!swarm) {
        return { success: false, error: 'Swarm not found' };
      }

      // Cancel job
      await this.jobQueue.updateJobStatus(swarm.jobId, 'cancelled', {
        cancellation_reason: reason
      });

      // Notify agents
      for (const agent of swarm.agents) {
        await this.mailbox.sendMessage({
          from_agent_id: 'orchestrator-' + swarmId,
          to_agent_id: agent.id,
          message_type: 'notification',
          payload: {
            event: 'swarm_cancelled',
            swarm_id: swarmId,
            reason,
            timestamp: new Date().toISOString()
          }
        });
      }

      // Log cancellation
      await this.auditLogs.log({
        actor_type: 'orchestrator',
        actor_id: 'orchestrator-' + swarmId,
        action: 'swarm_cancelled',
        resource_type: 'swarm',
        resource_id: swarmId,
        result: 'cancelled',
        metadata: { reason }
      });

      this.activeSwarms.delete(swarmId);

      logger.info(`✅ Swarm ${swarmId} cancelled`);
      return { success: true, swarmId };
    } catch (error) {
      logger.error(`Error cancelling swarm: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get orchestrator statistics
   */
  getStats() {
    return {
      active_swarms: this.activeSwarms.size,
      swarms: Array.from(this.activeSwarms.values()).map(s => ({
        id: s.id,
        task: s.taskName,
        agents: s.agents.length,
        status: s.status,
        age_seconds: Math.round((Date.now() - s.createdAt.getTime()) / 1000)
      }))
    };
  }
}

export { AgentOrchestrator };
