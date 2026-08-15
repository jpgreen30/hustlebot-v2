/**
 * WORKFLOW REGISTRY
 *
 * Workflow definition storage and management:
 * - Store workflow definitions
 * - Execute workflows
 * - Track workflow history
 * - Version control workflows
 * - Enable workflow templates
 */

import logger from '../utils/logger.js';

class WorkflowRegistry {
  constructor(config = {}) {
    this.db = config.db || null;
    this.cache = config.cache || null;
    this.workflows = new Map();
    this.workflowInstances = new Map();
    this.workflowHistory = new Map();
  }

  async initialize() {
    logger.info('🔄 Workflow Registry initialized');
    return true;
  }

  /**
   * Register workflow definition
   */
  async registerWorkflow(workflowDef) {
    try {
      const {
        name = 'Unnamed Workflow',
        description = '',
        trigger = 'manual',
        steps = [],
        outputs = [],
        version = '1.0.0',
        tags = []
      } = workflowDef;

      const id = `workflow-${Date.now()}`;

      logger.info(`📋 Registering workflow: ${name}`);

      const workflow = {
        id,
        name,
        description,
        trigger,
        steps,
        outputs,
        version,
        tags,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        executions: 0,
        lastRun: null
      };

      this.workflows.set(id, workflow);

      return {
        workflowId: id,
        name,
        version,
        status: 'registered',
        stepCount: steps.length,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Workflow registration failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Get workflow by ID
   */
  async getWorkflow(workflowId) {
    try {
      if (!this.workflows.has(workflowId)) {
        throw new Error(`Workflow ${workflowId} not found`);
      }

      return this.workflows.get(workflowId);
    } catch (error) {
      logger.error(`Workflow retrieval failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Execute workflow
   */
  async executeWorkflow(workflowId, inputs = {}, options = {}) {
    try {
      if (!this.workflows.has(workflowId)) {
        throw new Error(`Workflow ${workflowId} not found`);
      }

      logger.info(`▶️  Executing workflow: ${workflowId}`);

      const workflow = this.workflows.get(workflowId);
      const executionId = `exec-${Date.now()}`;

      const execution = {
        id: executionId,
        workflowId,
        workflowName: workflow.name,
        inputs,
        status: 'running',
        steps: [],
        outputs: {},
        startedAt: new Date(),
        completedAt: null,
        error: null
      };

      this.workflowInstances.set(executionId, execution);

      // Execute steps sequentially
      for (const step of workflow.steps) {
        try {
          const stepResult = await this.executeStep(step, inputs, execution.outputs);
          execution.steps.push({
            name: step.name,
            status: 'completed',
            output: stepResult,
            duration: 0
          });
          execution.outputs = { ...execution.outputs, ...stepResult };
        } catch (stepError) {
          execution.steps.push({
            name: step.name,
            status: 'failed',
            error: stepError.message
          });

          if (step.onError === 'stop') {
            throw stepError;
          }
        }
      }

      // Complete execution
      execution.status = 'completed';
      execution.completedAt = new Date();
      workflow.executions++;
      workflow.lastRun = execution.completedAt;

      // Track history
      if (!this.workflowHistory.has(workflowId)) {
        this.workflowHistory.set(workflowId, []);
      }
      this.workflowHistory.get(workflowId).push(execution);

      logger.info(`✅ Workflow ${workflowId} completed`);

      return {
        executionId,
        status: 'completed',
        steps: execution.steps.length,
        outputs: execution.outputs,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Workflow execution failed: ${error.message}`);
      return { workflowId, status: 'failed', error: error.message };
    }
  }

  /**
   * Execute individual step
   */
  async executeStep(step, inputs, previousOutputs) {
    try {
      const { type = 'action', action, params = {} } = step;

      logger.info(`  Step: ${step.name || 'unnamed'}`);

      // Resolve parameters with previous outputs
      const resolvedParams = this.resolveParams(params, previousOutputs, inputs);

      // Simple action simulation
      const actions = {
        'send-email': async (params) => ({
          sent: true,
          messageId: `msg-${Date.now()}`
        }),
        'create-content': async (params) => ({
          contentId: `content-${Date.now()}`,
          topic: params.topic
        }),
        'update-database': async (params) => ({
          updated: true,
          records: params.records || 0
        }),
        'send-notification': async (params) => ({
          notified: true,
          recipients: params.recipients || 0
        }),
        'webhook': async (params) => ({
          status: 200,
          response: { success: true }
        })
      };

      const actionFn = actions[action] || (async (p) => ({ result: 'action executed', params: p }));
      return await actionFn(resolvedParams);
    } catch (error) {
      logger.error(`Step execution failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Resolve parameters with interpolation
   */
  resolveParams(params, outputs, inputs) {
    const resolved = {};

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
        // Interpolate from previous outputs or inputs
        const refKey = value.slice(2, -1);
        resolved[key] = outputs[refKey] || inputs[refKey] || value;
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  /**
   * Get execution status
   */
  async getExecutionStatus(executionId) {
    try {
      if (!this.workflowInstances.has(executionId)) {
        throw new Error(`Execution ${executionId} not found`);
      }

      const execution = this.workflowInstances.get(executionId);
      return {
        executionId,
        status: execution.status,
        workflowName: execution.workflowName,
        steps: execution.steps.length,
        startedAt: execution.startedAt,
        completedAt: execution.completedAt,
        outputs: execution.outputs,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Execution status retrieval failed: ${error.message}`);
      return { executionId, error: error.message };
    }
  }

  /**
   * Get workflow history
   */
  async getWorkflowHistory(workflowId, limit = 10) {
    try {
      if (!this.workflows.has(workflowId)) {
        throw new Error(`Workflow ${workflowId} not found`);
      }

      const history = this.workflowHistory.get(workflowId) || [];
      const recent = history.slice(-limit).reverse();

      return {
        workflowId,
        executionCount: history.length,
        recent: recent.map(exec => ({
          executionId: exec.id,
          status: exec.status,
          startedAt: exec.startedAt,
          completedAt: exec.completedAt,
          stepCount: exec.steps.length
        })),
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`History retrieval failed: ${error.message}`);
      return { workflowId, error: error.message };
    }
  }

  /**
   * List all workflows
   */
  async listWorkflows(filter = {}) {
    try {
      const { status = 'active', tag = null } = filter;

      let workflows = Array.from(this.workflows.values());

      if (status) {
        workflows = workflows.filter(w => w.status === status);
      }

      if (tag) {
        workflows = workflows.filter(w => w.tags.includes(tag));
      }

      return {
        total: workflows.length,
        workflows: workflows.map(w => ({
          id: w.id,
          name: w.name,
          version: w.version,
          stepCount: w.steps.length,
          executions: w.executions,
          lastRun: w.lastRun
        })),
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Workflow list retrieval failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Update workflow
   */
  async updateWorkflow(workflowId, updates) {
    try {
      if (!this.workflows.has(workflowId)) {
        throw new Error(`Workflow ${workflowId} not found`);
      }

      const workflow = this.workflows.get(workflowId);
      Object.assign(workflow, updates);
      workflow.updatedAt = new Date();
      workflow.version = this.incrementVersion(workflow.version);

      logger.info(`🔄 Workflow updated: ${workflowId} (v${workflow.version})`);

      return {
        workflowId,
        version: workflow.version,
        status: 'updated',
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Workflow update failed: ${error.message}`);
      return { workflowId, error: error.message };
    }
  }

  /**
   * Increment version
   */
  incrementVersion(version) {
    const parts = version.split('.');
    parts[2] = String(parseInt(parts[2]) + 1);
    return parts.join('.');
  }

  /**
   * Delete workflow
   */
  async deleteWorkflow(workflowId) {
    try {
      if (!this.workflows.has(workflowId)) {
        throw new Error(`Workflow ${workflowId} not found`);
      }

      this.workflows.delete(workflowId);
      logger.info(`🗑️  Workflow deleted: ${workflowId}`);

      return {
        workflowId,
        status: 'deleted',
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Workflow deletion failed: ${error.message}`);
      return { workflowId, error: error.message };
    }
  }

  /**
   * Get registry stats
   */
  getStats() {
    try {
      return {
        totalWorkflows: this.workflows.size,
        totalExecutions: Array.from(this.workflowHistory.values()).reduce((sum, hist) => sum + hist.length, 0),
        activeWorkflows: Array.from(this.workflows.values()).filter(w => w.status === 'active').length,
        totalPendingExecutions: Array.from(this.workflowInstances.values()).filter(e => e.status === 'running').length,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Stats retrieval failed: ${error.message}`);
      return { error: error.message };
    }
  }
}

export { WorkflowRegistry };
