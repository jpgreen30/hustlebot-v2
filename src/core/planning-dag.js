/**
 * PLANNING DAG (Directed Acyclic Graph)
 *
 * Responsibilities:
 * 1. Define and validate multi-step workflows as DAGs
 * 2. Detect cycles and invalid dependencies
 * 3. Execute workflows with parallel and sequential support
 * 4. Track execution state and results per step
 * 5. Support conditional branching and error handling
 * 6. Generate execution plans and dependency order
 */

import logger from '../utils/logger.js';

class PlanningDAG {
  constructor(db) {
    this.db = db;
    this.workflows = new Map(); // key = workflowId, value = DAG
    this.executions = new Map(); // key = executionId, value = execution state
  }

  /**
   * Create a new workflow DAG
   */
  createWorkflow(workflowId, metadata = {}) {
    try {
      const workflow = {
        id: workflowId,
        name: metadata.name || workflowId,
        description: metadata.description || '',
        steps: new Map(), // key = stepId, value = step definition
        edges: [], // Array of [from_step, to_step] dependencies
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      this.workflows.set(workflowId, workflow);
      logger.info(`✅ Workflow created: ${workflowId}`);
      return workflow;
    } catch (error) {
      logger.error('Error creating workflow:', error);
      throw error;
    }
  }

  /**
   * Add a step to the workflow
   */
  addStep(workflowId, stepId, stepDefinition) {
    try {
      const workflow = this.workflows.get(workflowId);
      if (!workflow) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      const step = {
        id: stepId,
        agent: stepDefinition.agent,
        tool: stepDefinition.tool,
        input: stepDefinition.input || {},
        condition: stepDefinition.condition || null, // Conditional execution
        retry: stepDefinition.retry || { max_attempts: 1 },
        timeout: stepDefinition.timeout || 30000, // ms
        on_error: stepDefinition.on_error || 'fail', // fail | skip | retry | fallback
        status: 'pending',
        result: null,
        error: null,
        created_at: new Date().toISOString()
      };

      workflow.steps.set(stepId, step);
      logger.info(`  ✓ Step added: ${stepId} (agent=${step.agent}, tool=${step.tool})`);
      return step;
    } catch (error) {
      logger.error('Error adding step:', error);
      throw error;
    }
  }

  /**
   * Add dependency between steps
   */
  addDependency(workflowId, fromStep, toStep) {
    try {
      const workflow = this.workflows.get(workflowId);
      if (!workflow) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      // Check if both steps exist
      if (!workflow.steps.has(fromStep) || !workflow.steps.has(toStep)) {
        throw new Error(`Step not found: ${!workflow.steps.has(fromStep) ? fromStep : toStep}`);
      }

      // Check for cycles
      if (this.wouldCreateCycle(workflow, fromStep, toStep)) {
        throw new Error(`Cycle detected: ${fromStep} → ${toStep}`);
      }

      workflow.edges.push([fromStep, toStep]);
      logger.info(`  ✓ Dependency added: ${fromStep} → ${toStep}`);
    } catch (error) {
      logger.error('Error adding dependency:', error);
      throw error;
    }
  }

  /**
   * Check if adding an edge would create a cycle
   */
  wouldCreateCycle(workflow, fromStep, toStep) {
    // Simple cycle detection: if toStep can reach fromStep, adding edge would create cycle
    const visited = new Set();
    const stack = [toStep];

    while (stack.length > 0) {
      const current = stack.pop();
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);

      if (current === fromStep) {
        return true; // Cycle found
      }

      // Find all steps that toStep depends on
      for (const [from, to] of workflow.edges) {
        if (to === current) {
          stack.push(from);
        }
      }
    }

    return false;
  }

  /**
   * Generate execution order (topological sort)
   */
  getExecutionOrder(workflowId) {
    try {
      const workflow = this.workflows.get(workflowId);
      if (!workflow) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      const inDegree = new Map();
      const adjacencyList = new Map();

      // Initialize
      for (const [stepId] of workflow.steps.entries()) {
        inDegree.set(stepId, 0);
        adjacencyList.set(stepId, []);
      }

      // Build graph
      for (const [from, to] of workflow.edges) {
        inDegree.set(to, (inDegree.get(to) || 0) + 1);
        adjacencyList.get(from).push(to);
      }

      // Topological sort (Kahn's algorithm)
      const queue = [];
      for (const [stepId, degree] of inDegree.entries()) {
        if (degree === 0) {
          queue.push(stepId);
        }
      }

      const sortedOrder = [];
      while (queue.length > 0) {
        const current = queue.shift();
        sortedOrder.push(current);

        for (const neighbor of adjacencyList.get(current)) {
          inDegree.set(neighbor, inDegree.get(neighbor) - 1);
          if (inDegree.get(neighbor) === 0) {
            queue.push(neighbor);
          }
        }
      }

      if (sortedOrder.length !== workflow.steps.size) {
        throw new Error('Workflow contains a cycle');
      }

      return sortedOrder;
    } catch (error) {
      logger.error('Error generating execution order:', error);
      throw error;
    }
  }

  /**
   * Get dependent steps (steps that depend on this step)
   */
  getDependentSteps(workflowId, stepId) {
    try {
      const workflow = this.workflows.get(workflowId);
      if (!workflow) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      const dependents = [];
      for (const [from, to] of workflow.edges) {
        if (from === stepId) {
          dependents.push(to);
        }
      }
      return dependents;
    } catch (error) {
      logger.error('Error getting dependent steps:', error);
      throw error;
    }
  }

  /**
   * Get prerequisite steps (steps this step depends on)
   */
  getPrerequisiteSteps(workflowId, stepId) {
    try {
      const workflow = this.workflows.get(workflowId);
      if (!workflow) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      const prerequisites = [];
      for (const [from, to] of workflow.edges) {
        if (to === stepId) {
          prerequisites.push(from);
        }
      }
      return prerequisites;
    } catch (error) {
      logger.error('Error getting prerequisite steps:', error);
      throw error;
    }
  }

  /**
   * Start workflow execution
   */
  async executeWorkflow(workflowId, input = {}) {
    try {
      const workflow = this.workflows.get(workflowId);
      if (!workflow) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      const executionId = `exec-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const execution = {
        id: executionId,
        workflow_id: workflowId,
        status: 'running',
        input,
        step_results: new Map(), // key = stepId, value = result
        step_errors: new Map(), // key = stepId, value = error
        start_time: new Date().toISOString(),
        end_time: null,
        created_at: new Date().toISOString()
      };

      this.executions.set(executionId, execution);

      logger.info(`🚀 Workflow execution started: ${executionId} (workflow=${workflowId})`);

      // Note: Actual step execution would happen asynchronously
      // This returns the execution ID for tracking

      return execution;
    } catch (error) {
      logger.error('Error executing workflow:', error);
      throw error;
    }
  }

  /**
   * Record step execution result
   */
  async recordStepResult(executionId, stepId, result) {
    try {
      const execution = this.executions.get(executionId);
      if (!execution) {
        throw new Error(`Execution not found: ${executionId}`);
      }

      execution.step_results.set(stepId, result);

      logger.info(`✅ Step completed: ${stepId} (execution=${executionId})`);

      // Check if all steps completed
      const workflow = this.workflows.get(execution.workflow_id);
      if (execution.step_results.size === workflow.steps.size) {
        execution.status = 'completed';
        execution.end_time = new Date().toISOString();
        logger.info(`🎉 Workflow completed: ${executionId}`);
      }

      return execution;
    } catch (error) {
      logger.error('Error recording step result:', error);
      throw error;
    }
  }

  /**
   * Record step execution error
   */
  async recordStepError(executionId, stepId, error) {
    try {
      const execution = this.executions.get(executionId);
      if (!execution) {
        throw new Error(`Execution not found: ${executionId}`);
      }

      execution.step_errors.set(stepId, error);

      logger.error(`❌ Step failed: ${stepId} (execution=${executionId}): ${error.message}`);

      // Could implement error handling strategy here (retry, skip, fallback)

      return execution;
    } catch (error) {
      logger.error('Error recording step error:', error);
      throw error;
    }
  }

  /**
   * Get execution status
   */
  async getExecutionStatus(executionId) {
    try {
      const execution = this.executions.get(executionId);
      if (!execution) {
        return null;
      }

      return {
        id: execution.id,
        workflow_id: execution.workflow_id,
        status: execution.status,
        progress: {
          total_steps: this.workflows.get(execution.workflow_id).steps.size,
          completed_steps: execution.step_results.size,
          failed_steps: execution.step_errors.size
        },
        start_time: execution.start_time,
        end_time: execution.end_time,
        duration_ms: execution.end_time ?
          new Date(execution.end_time) - new Date(execution.start_time) : null
      };
    } catch (error) {
      logger.error('Error getting execution status:', error);
      throw error;
    }
  }

  /**
   * Cancel workflow execution
   */
  async cancelExecution(executionId) {
    try {
      const execution = this.executions.get(executionId);
      if (!execution) {
        throw new Error(`Execution not found: ${executionId}`);
      }

      execution.status = 'cancelled';
      execution.end_time = new Date().toISOString();

      logger.info(`⛔ Workflow execution cancelled: ${executionId}`);
      return execution;
    } catch (error) {
      logger.error('Error cancelling execution:', error);
      throw error;
    }
  }

  /**
   * Get workflow definition
   */
  getWorkflow(workflowId) {
    return this.workflows.get(workflowId) || null;
  }

  /**
   * Validate workflow (check for completeness)
   */
  validateWorkflow(workflowId) {
    try {
      const workflow = this.workflows.get(workflowId);
      if (!workflow) {
        return { valid: false, errors: ['Workflow not found'] };
      }

      const errors = [];

      // Check for cycles
      if (workflow.edges.length > 0) {
        const order = this.getExecutionOrder(workflowId);
        if (!order) {
          errors.push('Workflow contains cycles');
        }
      }

      // Check for unreachable steps
      if (workflow.steps.size > 0) {
        const reachable = new Set();
        const stack = [];

        // Find root steps (no prerequisites)
        for (const [stepId] of workflow.steps.entries()) {
          let hasPrereq = false;
          for (const [from, to] of workflow.edges) {
            if (to === stepId) {
              hasPrereq = true;
              break;
            }
          }
          if (!hasPrereq) {
            stack.push(stepId);
          }
        }

        // DFS to find reachable steps
        while (stack.length > 0) {
          const current = stack.pop();
          if (!reachable.has(current)) {
            reachable.add(current);
            for (const [from, to] of workflow.edges) {
              if (from === current) {
                stack.push(to);
              }
            }
          }
        }

        if (reachable.size < workflow.steps.size) {
          errors.push(`${workflow.steps.size - reachable.size} unreachable steps`);
        }
      }

      return {
        valid: errors.length === 0,
        errors
      };
    } catch (error) {
      logger.error('Error validating workflow:', error);
      return { valid: false, errors: [error.message] };
    }
  }
}

export { PlanningDAG };
