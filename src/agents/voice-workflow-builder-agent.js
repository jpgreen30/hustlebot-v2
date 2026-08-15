/**
 * VOICE WORKFLOW BUILDER AGENT
 *
 * Interprets voice call transcripts and builds executable workflows
 * - Parses natural language workflow requirements
 * - Maps voice instructions to system integrations
 * - Constructs and deploys workflows from voice commands
 * - Confirms workflow execution via voice callback
 */

import { BaseAgent } from './base-agent.js';
import logger from '../utils/logger.js';

class VoiceWorkflowBuilderAgent extends BaseAgent {
  constructor(integrations = {}, workflowRegistry = null) {
    super('VoiceWorkflowBuilder', 'voice');
    this.integrations = integrations;
    this.workflowRegistry = workflowRegistry;
    this.builtWorkflows = new Map();
    this.transcriptAnalysis = new Map();
  }

  async initialize(llm, storage) {
    await super.initialize(llm, storage);

    this.registerTool('analyze_transcript', 'Analyze call transcript for workflow intent', {
      type: 'object',
      properties: {
        callId: { type: 'string', description: 'Call ID from Retell' },
        transcript: { type: 'string', description: 'Full call transcript' },
        agentName: { type: 'string', description: 'User name or identifier' }
      },
      required: ['transcript']
    }, this.analyzeTranscript.bind(this));

    this.registerTool('extract_workflow_steps', 'Extract workflow steps from transcript analysis', {
      type: 'object',
      properties: {
        analysisId: { type: 'string', description: 'Analysis ID from transcript analysis' },
        confirmationRequired: { type: 'boolean', default: true }
      },
      required: ['analysisId']
    }, this.extractWorkflowSteps.bind(this));

    this.registerTool('build_workflow', 'Construct workflow from extracted steps', {
      type: 'object',
      properties: {
        workflowName: { type: 'string', description: 'Name for the workflow' },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string' },
              integration: { type: 'string' },
              parameters: { type: 'object' }
            }
          },
          description: 'Workflow steps to execute'
        },
        triggerType: {
          type: 'string',
          enum: ['voice', 'schedule', 'webhook', 'manual'],
          default: 'voice'
        },
        description: { type: 'string', description: 'Workflow description' }
      },
      required: ['workflowName', 'steps']
    }, this.buildWorkflow.bind(this));

    this.registerTool('deploy_workflow', 'Deploy workflow to registry', {
      type: 'object',
      properties: {
        workflowId: { type: 'string', description: 'Workflow ID to deploy' },
        autoStart: { type: 'boolean', default: true },
        notifyUser: { type: 'boolean', default: true }
      },
      required: ['workflowId']
    }, this.deployWorkflow.bind(this));

    this.registerTool('confirm_workflow_via_voice', 'Call user back to confirm workflow', {
      type: 'object',
      properties: {
        workflowId: { type: 'string', description: 'Workflow to confirm' },
        phoneNumber: { type: 'string', description: 'User phone number' },
        message: { type: 'string', description: 'Confirmation message' }
      },
      required: ['workflowId', 'phoneNumber']
    }, this.confirmViaVoice.bind(this));

    this.registerTool('get_workflow_status', 'Get status of voice-built workflow', {
      type: 'object',
      properties: {
        workflowId: { type: 'string', description: 'Workflow ID' }
      },
      required: ['workflowId']
    }, this.getWorkflowStatus.bind(this));

    logger.info('✅ VoiceWorkflowBuilder Agent initialized');
  }

  async analyzeTranscript(args) {
    try {
      const { callId, transcript, agentName } = args;

      logger.info(`🎙️  Analyzing transcript from call ${callId}`);

      const analysis = {
        id: `analysis_${Date.now()}`,
        callId,
        transcript,
        agentName,
        intent: this.detectIntent(transcript),
        entities: this.extractEntities(transcript),
        integrations: this.identifyIntegrations(transcript),
        actions: this.extractActions(transcript),
        parameters: this.extractParameters(transcript),
        confidence: this.calculateConfidence(transcript),
        createdAt: new Date()
      };

      this.transcriptAnalysis.set(analysis.id, analysis);

      logger.info(`📊 Transcript analysis complete: ${analysis.intent}`);

      return {
        analysisId: analysis.id,
        intent: analysis.intent,
        integrations: analysis.integrations,
        actionCount: analysis.actions.length,
        confidence: analysis.confidence,
        summary: this.generateSummary(analysis)
      };
    } catch (error) {
      logger.error(`Transcript analysis failed: ${error.message}`);
      return { error: error.message };
    }
  }

  async extractWorkflowSteps(args) {
    try {
      const { analysisId, confirmationRequired } = args;

      if (!this.transcriptAnalysis.has(analysisId)) {
        throw new Error(`Analysis ${analysisId} not found`);
      }

      const analysis = this.transcriptAnalysis.get(analysisId);
      logger.info(`🔄 Extracting workflow steps from analysis ${analysisId}`);

      const steps = this.mapActionsToSteps(analysis);
      const validation = this.validateSteps(steps);

      return {
        analysisId,
        stepCount: steps.length,
        steps,
        isValid: validation.valid,
        warnings: validation.warnings,
        estimatedDuration: this.estimateExecutionTime(steps),
        requiresConfirmation: confirmationRequired && !validation.valid,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Step extraction failed: ${error.message}`);
      return { error: error.message };
    }
  }

  async buildWorkflow(args) {
    try {
      const { workflowName, steps, triggerType, description } = args;

      logger.info(`🏗️  Building workflow: ${workflowName}`);

      const workflow = {
        id: `workflow_${Date.now()}`,
        name: workflowName,
        description: description || `Workflow created from voice command`,
        steps: steps.map((step, idx) => ({
          id: `step_${idx}`,
          ...step,
          retryCount: 0,
          timeout: 30000,
          status: 'pending'
        })),
        triggerType,
        createdFrom: 'voice',
        status: 'built',
        executionStats: {
          runs: 0,
          successes: 0,
          failures: 0,
          totalDuration: 0
        },
        builtAt: new Date()
      };

      this.builtWorkflows.set(workflow.id, workflow);

      logger.info(`✅ Workflow built: ${workflow.id}`);

      return {
        workflowId: workflow.id,
        name: workflow.name,
        stepCount: workflow.steps.length,
        status: workflow.status,
        ready: true,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Workflow building failed: ${error.message}`);
      return { error: error.message };
    }
  }

  async deployWorkflow(args) {
    try {
      const { workflowId, autoStart, notifyUser } = args;

      if (!this.builtWorkflows.has(workflowId)) {
        throw new Error(`Workflow ${workflowId} not found`);
      }

      const workflow = this.builtWorkflows.get(workflowId);

      logger.info(`🚀 Deploying workflow ${workflowId}`);

      workflow.status = 'deployed';
      workflow.deployedAt = new Date();

      if (this.workflowRegistry) {
        await this.workflowRegistry.registerWorkflow(workflow);
        logger.info(`📋 Workflow registered in registry: ${workflowId}`);
      }

      if (autoStart) {
        workflow.status = 'running';
        workflow.startedAt = new Date();
        logger.info(`▶️  Workflow started automatically: ${workflowId}`);
      }

      return {
        workflowId,
        status: workflow.status,
        deployed: true,
        autoStarted: autoStart,
        notifyUser,
        confirmationUrl: `/api/voice/workflow/${workflowId}/confirm`,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Workflow deployment failed: ${error.message}`);
      return { error: error.message };
    }
  }

  async confirmViaVoice(args) {
    try {
      const { workflowId, phoneNumber, message } = args;

      if (!this.builtWorkflows.has(workflowId)) {
        throw new Error(`Workflow ${workflowId} not found`);
      }

      const workflow = this.builtWorkflows.get(workflowId);

      logger.info(`📞 Sending voice confirmation for workflow ${workflowId}`);

      const confirmationMessage = message ||
        `Your workflow "${workflow.name}" has been created and deployed. Say confirm to activate it, or cancel to stop.`;

      if (this.integrations.retell) {
        const result = await this.integrations.retell.initiateOutboundCall(
          'confirmation_agent',
          phoneNumber,
          {
            type: 'confirmation',
            workflowId,
            message: confirmationMessage
          }
        );

        return {
          workflowId,
          callInitiated: true,
          callId: result.callId,
          phoneNumber,
          status: 'awaiting_confirmation',
          timestamp: new Date()
        };
      }

      logger.warn('Retell integration not available - mock confirmation');
      return {
        workflowId,
        callInitiated: true,
        status: 'mock_confirmation',
        confirmationUrl: `/api/voice/workflow/${workflowId}/confirm`,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Voice confirmation failed: ${error.message}`);
      return { error: error.message };
    }
  }

  async getWorkflowStatus(args) {
    try {
      const { workflowId } = args;

      if (!this.builtWorkflows.has(workflowId)) {
        throw new Error(`Workflow ${workflowId} not found`);
      }

      const workflow = this.builtWorkflows.get(workflowId);

      return {
        workflowId,
        name: workflow.name,
        status: workflow.status,
        stepCount: workflow.steps.length,
        runs: workflow.executionStats.runs,
        successes: workflow.executionStats.successes,
        failures: workflow.executionStats.failures,
        createdAt: workflow.builtAt,
        deployedAt: workflow.deployedAt || null,
        startedAt: workflow.startedAt || null,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Status retrieval failed: ${error.message}`);
      return { error: error.message };
    }
  }

  // Helper methods

  detectIntent(transcript) {
    const lowerTranscript = transcript.toLowerCase();

    const intents = {
      'lead_generation': ['leads', 'prospects', 'pull', 'search', 'find'],
      'enrichment': ['enrich', 'enhance', 'details', 'data', 'information'],
      'scoring': ['score', 'rate', 'rank', 'evaluate', 'qualify'],
      'email_campaign': ['email', 'send', 'campaign', 'message'],
      'data_sync': ['sync', 'integrate', 'connect', 'push', 'pull'],
      'reporting': ['report', 'analyze', 'summary', 'stats', 'metrics'],
      'automation': ['automate', 'auto', 'schedule', 'repeat', 'trigger']
    };

    for (const [intent, keywords] of Object.entries(intents)) {
      if (keywords.some(kw => lowerTranscript.includes(kw))) {
        return intent;
      }
    }

    return 'general_automation';
  }

  extractEntities(transcript) {
    const entities = {
      integrations: [],
      targets: [],
      criteria: []
    };

    const integrationKeywords = {
      'apollo': 'Apollo',
      'clearbit': 'Clearbit',
      'stripe': 'Stripe',
      'shopify': 'Shopify',
      'hubspot': 'HubSpot',
      'gmail': 'Gmail',
      'slack': 'Slack',
      'linkedin': 'LinkedIn',
      'twitter': 'Twitter'
    };

    const lowerTranscript = transcript.toLowerCase();
    for (const [key, name] of Object.entries(integrationKeywords)) {
      if (lowerTranscript.includes(key)) {
        entities.integrations.push(name);
      }
    }

    return entities;
  }

  identifyIntegrations(transcript) {
    const entities = this.extractEntities(transcript);
    return entities.integrations;
  }

  extractActions(transcript) {
    const actions = [];
    const actionKeywords = {
      'search': 'search',
      'enrich': 'enrich',
      'score': 'score',
      'send': 'send',
      'create': 'create',
      'update': 'update',
      'delete': 'delete',
      'export': 'export',
      'import': 'import'
    };

    const lowerTranscript = transcript.toLowerCase();
    for (const [key, action] of Object.entries(actionKeywords)) {
      if (lowerTranscript.includes(key)) {
        actions.push(action);
      }
    }

    return actions;
  }

  extractParameters(transcript) {
    const params = {
      limit: this.extractNumber(transcript, 'limit|top|first') || 10,
      filters: this.extractFilters(transcript),
      schedule: this.extractSchedule(transcript),
      format: this.extractFormat(transcript)
    };

    return params;
  }

  calculateConfidence(transcript) {
    const length = transcript.length;
    const specificity = (transcript.match(/\b\d+\b/g) || []).length * 0.1;
    const integrationsCount = (this.extractEntities(transcript).integrations || []).length;

    let confidence = 0.6;
    if (length > 500) confidence += 0.1;
    if (integrationsCount > 2) confidence += 0.15;
    confidence += specificity;

    return Math.min(confidence, 0.99);
  }

  generateSummary(analysis) {
    return `Detected ${analysis.intent}: ${analysis.integrations.join(', ')} ` +
           `with ${analysis.actions.length} actions. Confidence: ${(analysis.confidence * 100).toFixed(0)}%`;
  }

  mapActionsToSteps(analysis) {
    const steps = [];

    if (analysis.integrations.includes('Apollo')) {
      steps.push({
        action: 'search_leads',
        integration: 'apollo',
        parameters: { limit: analysis.parameters.limit }
      });
    }

    if (analysis.integrations.includes('Clearbit')) {
      steps.push({
        action: 'enrich_data',
        integration: 'enrichment',
        parameters: { source: 'clearbit' }
      });
    }

    if (analysis.actions.includes('score')) {
      steps.push({
        action: 'score_leads',
        integration: 'analytics',
        parameters: { model: 'ai_scoring' }
      });
    }

    if (analysis.actions.includes('send')) {
      steps.push({
        action: 'send_email',
        integration: 'email',
        parameters: { template: 'default' }
      });
    }

    return steps.length > 0 ? steps : [
      {
        action: 'process',
        integration: 'general',
        parameters: {}
      }
    ];
  }

  validateSteps(steps) {
    const valid = steps.length > 0 && steps.every(s => s.action && s.integration);
    const warnings = [];

    if (steps.length > 10) {
      warnings.push('Workflow has many steps - may take longer to execute');
    }

    if (!valid) {
      warnings.push('Some steps are incomplete - manual review recommended');
    }

    return { valid, warnings };
  }

  estimateExecutionTime(steps) {
    const baseTime = 5000;
    const timePerStep = 3000;
    return baseTime + (steps.length * timePerStep);
  }

  extractNumber(text, pattern) {
    const regex = new RegExp(`${pattern}\\s+(\\d+)`, 'i');
    const match = text.match(regex);
    return match ? parseInt(match[1]) : null;
  }

  extractFilters(transcript) {
    return {
      industry: this.extractValue(transcript, 'industry'),
      location: this.extractValue(transcript, 'location|region|country'),
      size: this.extractValue(transcript, 'size')
    };
  }

  extractSchedule(transcript) {
    const lowerTranscript = transcript.toLowerCase();
    if (lowerTranscript.includes('daily')) return 'daily';
    if (lowerTranscript.includes('weekly')) return 'weekly';
    if (lowerTranscript.includes('monthly')) return 'monthly';
    if (lowerTranscript.includes('hourly')) return 'hourly';
    return null;
  }

  extractFormat(transcript) {
    const lowerTranscript = transcript.toLowerCase();
    if (lowerTranscript.includes('csv')) return 'csv';
    if (lowerTranscript.includes('json')) return 'json';
    if (lowerTranscript.includes('excel')) return 'excel';
    return 'json';
  }

  extractValue(text, pattern) {
    const regex = new RegExp(`${pattern}[\\s:]+([\\w\\s]+?)(?=[,.]|$)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : null;
  }
}

export { VoiceWorkflowBuilderAgent };
