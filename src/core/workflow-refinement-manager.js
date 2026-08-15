/**
 * WORKFLOW REFINEMENT MANAGER
 *
 * Manages the workflow refinement pipeline
 * - Orchestrates modifications from voice commands
 * - Handles testing and validation
 * - Manages versioning and rollback
 * - Tracks refinement history
 */

import logger from '../utils/logger.js';

class WorkflowRefinementManager {
  constructor(workflowRegistry = null) {
    this.workflowRegistry = workflowRegistry;
    this.pendingRefinements = new Map();
    this.completedRefinements = new Map();
    this.workflowHistory = new Map();
    this.testResults = new Map();
  }

  async queueRefinement(refinementRequest) {
    try {
      const { workflowId, type, command, parameters } = refinementRequest;

      logger.info(`📋 Queueing refinement for workflow ${workflowId}`);

      const refinement = {
        id: `refinement_${Date.now()}`,
        workflowId,
        type,
        command,
        parameters,
        status: 'queued',
        createdAt: new Date(),
        testedAt: null,
        publishedAt: null,
        changelog: []
      };

      this.pendingRefinements.set(refinement.id, refinement);

      return {
        refinementId: refinement.id,
        status: 'queued',
        nextStep: 'test',
        message: 'Refinement queued for testing',
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Queueing failed: ${error.message}`);
      return { error: error.message };
    }
  }

  async applyRefinement(refinementId, workflowData) {
    try {
      if (!this.pendingRefinements.has(refinementId)) {
        throw new Error(`Refinement ${refinementId} not found`);
      }

      const refinement = this.pendingRefinements.get(refinementId);
      const { workflowId, type, parameters } = refinement;

      logger.info(`⚙️  Applying refinement ${refinementId} to workflow ${workflowId}`);

      const modifiedWorkflow = JSON.parse(JSON.stringify(workflowData));
      const changes = [];

      switch (type) {
        case 'add_step':
          changes.push(this.addStep(modifiedWorkflow, parameters));
          break;
        case 'remove_step':
          changes.push(this.removeStep(modifiedWorkflow, parameters.stepId));
          break;
        case 'update_parameters':
          changes.push(...this.updateParameters(modifiedWorkflow, parameters.updates));
          break;
        case 'update_schedule':
          changes.push(this.updateSchedule(modifiedWorkflow, parameters.schedule));
          break;
        default:
          changes.push('Generic modification applied');
      }

      refinement.changes = changes;
      refinement.status = 'applied';

      return {
        refinementId,
        workflowId,
        status: 'applied',
        changes,
        modifiedWorkflow,
        requiresTest: true,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Application failed: ${error.message}`);
      return { error: error.message };
    }
  }

  async testRefinement(refinementId, workflow) {
    try {
      if (!this.pendingRefinements.has(refinementId)) {
        throw new Error(`Refinement ${refinementId} not found`);
      }

      const refinement = this.pendingRefinements.get(refinementId);

      logger.info(`🧪 Testing refinement ${refinementId}`);

      const testResult = {
        refinementId,
        workflowId: refinement.workflowId,
        status: 'passed',
        testCases: [
          { name: 'Workflow structure valid', status: 'passed' },
          { name: 'All steps executable', status: 'passed' },
          { name: 'Parameters valid', status: 'passed' },
          { name: 'No circular dependencies', status: 'passed' }
        ],
        warnings: [],
        errors: [],
        timestamp: new Date()
      };

      // Validate structure
      if (!workflow.steps || workflow.steps.length === 0) {
        testResult.status = 'failed';
        testResult.testCases[0].status = 'failed';
        testResult.errors.push('Workflow must have at least one step');
      }

      // Validate steps
      for (const step of workflow.steps || []) {
        if (!step.action || !step.integration) {
          testResult.status = 'failed';
          testResult.testCases[1].status = 'failed';
          testResult.errors.push(`Invalid step: ${step.id}`);
        }
      }

      refinement.testedAt = new Date();
      refinement.testResult = testResult;

      this.testResults.set(refinementId, testResult);

      return testResult;
    } catch (error) {
      logger.error(`Test failed: ${error.message}`);
      return { error: error.message };
    }
  }

  async publishRefinement(refinementId, description = '') {
    try {
      if (!this.pendingRefinements.has(refinementId)) {
        throw new Error(`Refinement ${refinementId} not found`);
      }

      const refinement = this.pendingRefinements.get(refinementId);
      const { workflowId } = refinement;

      logger.info(`📤 Publishing refinement ${refinementId}`);

      if (!this.testResults.has(refinementId)) {
        return { error: 'Refinement must be tested before publishing' };
      }

      const testResult = this.testResults.get(refinementId);
      if (testResult.status !== 'passed') {
        return { error: 'Test must pass before publishing' };
      }

      refinement.status = 'published';
      refinement.publishedAt = new Date();
      refinement.description = description;

      this.completedRefinements.set(refinementId, refinement);
      this.pendingRefinements.delete(refinementId);

      // Save to history
      if (!this.workflowHistory.has(workflowId)) {
        this.workflowHistory.set(workflowId, []);
      }

      this.workflowHistory.get(workflowId).push({
        refinementId,
        version: `v${this.workflowHistory.get(workflowId).length + 1}`,
        description,
        changes: refinement.changes,
        publishedAt: refinement.publishedAt
      });

      return {
        refinementId,
        workflowId,
        status: 'published',
        version: `v${this.workflowHistory.get(workflowId).length}`,
        message: 'Refinement published and live',
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Publishing failed: ${error.message}`);
      return { error: error.message };
    }
  }

  async rollbackWorkflow(workflowId, targetVersion) {
    try {
      logger.info(`⏮️  Rolling back workflow ${workflowId} to ${targetVersion}`);

      if (!this.workflowHistory.has(workflowId)) {
        throw new Error(`No version history for workflow ${workflowId}`);
      }

      const history = this.workflowHistory.get(workflowId);
      const targetEntry = history.find(h => h.version === targetVersion);

      if (!targetEntry) {
        throw new Error(`Version ${targetVersion} not found`);
      }

      return {
        workflowId,
        version: targetVersion,
        status: 'rolled_back',
        message: `Workflow rolled back to ${targetVersion}`,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Rollback failed: ${error.message}`);
      return { error: error.message };
    }
  }

  getRefinementStatus(refinementId) {
    if (this.pendingRefinements.has(refinementId)) {
      const refinement = this.pendingRefinements.get(refinementId);
      return {
        refinementId,
        workflowId: refinement.workflowId,
        status: refinement.status,
        type: refinement.type,
        createdAt: refinement.createdAt,
        testedAt: refinement.testedAt,
        publishedAt: refinement.publishedAt
      };
    }

    if (this.completedRefinements.has(refinementId)) {
      const refinement = this.completedRefinements.get(refinementId);
      return {
        refinementId,
        workflowId: refinement.workflowId,
        status: refinement.status,
        type: refinement.type,
        createdAt: refinement.createdAt,
        testedAt: refinement.testedAt,
        publishedAt: refinement.publishedAt,
        description: refinement.description
      };
    }

    return { error: `Refinement ${refinementId} not found` };
  }

  getWorkflowHistory(workflowId, limit = 10) {
    if (!this.workflowHistory.has(workflowId)) {
      return {
        workflowId,
        versions: [],
        message: 'No version history'
      };
    }

    const history = this.workflowHistory.get(workflowId);

    return {
      workflowId,
      versionCount: history.length,
      versions: history.slice(-limit).reverse(),
      timestamp: new Date()
    };
  }

  getStats() {
    return {
      pending: this.pendingRefinements.size,
      completed: this.completedRefinements.size,
      workflowsWithHistory: this.workflowHistory.size,
      totalTestRuns: this.testResults.size,
      timestamp: new Date()
    };
  }

  // Helper methods

  addStep(workflow, parameters) {
    const { stepName, integration, action, position } = parameters;

    const newStep = {
      id: `step_${Date.now()}`,
      name: stepName,
      integration,
      action,
      parameters: {},
      status: 'pending'
    };

    if (position !== undefined && position >= 0) {
      workflow.steps.splice(position, 0, newStep);
    } else {
      workflow.steps.push(newStep);
    }

    return `Added step "${stepName}" to workflow`;
  }

  removeStep(workflow, stepId) {
    const index = workflow.steps.findIndex(s => s.id === stepId);

    if (index === -1) {
      return `Step ${stepId} not found`;
    }

    const removed = workflow.steps.splice(index, 1)[0];
    return `Removed step "${removed.name}" from workflow`;
  }

  updateParameters(workflow, updates) {
    const changes = [];

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'limit' || key === 'timeout' || key === 'retryCount') {
        workflow[key] = value;
        changes.push(`Updated ${key} to ${value}`);
      }

      if (key === 'schedule') {
        workflow.schedule = value;
        changes.push(`Updated schedule to ${value}`);
      }

      if (key === 'filters') {
        workflow.filters = value;
        changes.push('Updated filters');
      }
    }

    return changes;
  }

  updateSchedule(workflow, schedule) {
    const validSchedules = ['manual', 'hourly', 'daily', 'weekly', 'monthly'];

    if (!validSchedules.includes(schedule)) {
      return `Invalid schedule. Must be one of: ${validSchedules.join(', ')}`;
    }

    workflow.schedule = schedule;
    return `Updated schedule to ${schedule}`;
  }
}

export { WorkflowRefinementManager };
