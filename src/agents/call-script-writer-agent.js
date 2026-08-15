/**
 * CALL SCRIPT WRITER AGENT
 *
 * Generates AI-powered voice call scripts and agent prompts
 * - Creates conversation flows for different call types
 * - Generates system prompts for Retell agents
 * - Handles branching logic and fallbacks
 * - Validates scripts for quality and compliance
 */

import { BaseAgent } from './base-agent.js';
import logger from '../utils/logger.js';

class CallScriptWriterAgent extends BaseAgent {
  constructor(integrations = {}) {
    super('CallScriptWriter', 'phone');
    this.integrations = integrations;
    this.generatedScripts = new Map();
    this.scripts = new Map();
  }

  async initialize(llm, storage) {
    await super.initialize(llm, storage);

    this.registerTool('generate_call_script', 'Generate voice call script', {
      type: 'object',
      properties: {
        callType: {
          type: 'string',
          enum: ['sales', 'support', 'lead_generation', 'followup', 'survey', 'scheduling'],
          description: 'Type of call'
        },
        industry: { type: 'string', description: 'Industry/business type' },
        objective: { type: 'string', description: 'Call objective' },
        targetAudience: { type: 'string', description: 'Who are you calling' },
        tone: {
          type: 'string',
          enum: ['professional', 'friendly', 'urgent', 'consultative'],
          default: 'professional'
        },
        duration: { type: 'number', description: 'Target duration in minutes', default: 5 },
        includeHoldingPoints: { type: 'boolean', default: true }
      },
      required: ['callType', 'objective']
    }, this.generateCallScript.bind(this));

    this.registerTool('generate_system_prompt', 'Generate system prompt for Retell agent', {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'Agent role (e.g., Sales Rep, Support Agent)' },
        personality: { type: 'string', description: 'Personality traits' },
        constraints: { type: 'array', items: { type: 'string' }, description: 'Behavioral constraints' },
        knowledgeBase: { type: 'string', description: 'Key facts and policies' }
      },
      required: ['role', 'personality']
    }, this.generateSystemPrompt.bind(this));

    this.registerTool('create_branching_flow', 'Create branching call flow', {
      type: 'object',
      properties: {
        scriptId: { type: 'string', description: 'Base script ID' },
        branches: { type: 'array', items: { type: 'string' }, description: 'Branch conditions' },
        fallbacks: { type: 'array', items: { type: 'string' }, description: 'Fallback responses' }
      },
      required: ['scriptId', 'branches']
    }, this.createBranchingFlow.bind(this));

    this.registerTool('validate_script', 'Validate script quality', {
      type: 'object',
      properties: {
        scriptId: { type: 'string', description: 'Script to validate' },
        checkCompliance: { type: 'boolean', default: true },
        checkNatural: { type: 'boolean', default: true }
      },
      required: ['scriptId']
    }, this.validateScript.bind(this));

    this.registerTool('deploy_to_retell', 'Deploy script to Retell agent', {
      type: 'object',
      properties: {
        scriptId: { type: 'string', description: 'Script ID to deploy' },
        agentName: { type: 'string', description: 'Retell agent name' }
      },
      required: ['scriptId', 'agentName']
    }, this.deployToRetell.bind(this));

    this.registerTool('get_script', 'Retrieve generated script', {
      type: 'object',
      properties: {
        scriptId: { type: 'string', description: 'Script ID' }
      },
      required: ['scriptId']
    }, this.getScript.bind(this));

    logger.info('✅ CallScriptWriter Agent initialized');
  }

  async generateCallScript(args) {
    try {
      const {
        callType,
        industry,
        objective,
        targetAudience,
        tone,
        duration,
        includeHoldingPoints
      } = args;

      logger.info(`📞 Generating ${callType} call script for ${objective}`);

      const script = {
        id: `script_${Date.now()}`,
        callType,
        industry,
        objective,
        targetAudience,
        tone,
        duration,
        content: this.generateScriptContent(callType, objective, tone),
        holdingPoints: includeHoldingPoints ? this.generateHoldingPoints(callType) : [],
        objectionHandling: this.generateObjectionHandlers(callType),
        closingStatement: this.generateClosing(callType),
        createdAt: new Date(),
        validated: false,
        deployed: false
      };

      this.scripts.set(script.id, script);
      this.generatedScripts.set(script.id, script);

      return {
        scriptId: script.id,
        callType,
        objective,
        length: script.content.length,
        validated: false,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Script generation failed: ${error.message}`);
      return { error: error.message };
    }
  }

  async generateSystemPrompt(args) {
    try {
      const { role, personality, constraints, knowledgeBase } = args;

      logger.info(`🤖 Generating system prompt for: ${role}`);

      const prompt = `You are a ${role} with the following characteristics:

Personality: ${personality}

Your key responsibilities:
- Be professional and courteous
- Listen actively to the customer
- Provide accurate information
${knowledgeBase ? `- Key information: ${knowledgeBase}` : ''}

Constraints:
${constraints ? constraints.map((c, i) => `${i + 1}. ${c}`).join('\n') : '1. Follow all company policies'}

Communication style:
- Use natural, conversational language
- Avoid technical jargon unless appropriate
- Be empathetic and patient
- Confirm understanding before proceeding

Never:
- Make promises you can't keep
- Disclose confidential information
- Be dismissive or rude`;

      return {
        promptId: `prompt_${Date.now()}`,
        role,
        prompt,
        length: prompt.length,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`System prompt generation failed: ${error.message}`);
      return { error: error.message };
    }
  }

  async createBranchingFlow(args) {
    try {
      const { scriptId, branches, fallbacks } = args;

      if (!this.scripts.has(scriptId)) {
        throw new Error(`Script ${scriptId} not found`);
      }

      logger.info(`🌳 Creating branching flow for ${scriptId}`);

      const script = this.scripts.get(scriptId);
      const flow = {
        id: `flow_${Date.now()}`,
        baseScriptId: scriptId,
        branches: branches.map((condition, idx) => ({
          id: `branch_${idx}`,
          condition,
          response: this.generateBranchResponse(condition),
          followUp: this.generateFollowUp(condition)
        })),
        fallbacks: fallbacks.map((fallback, idx) => ({
          id: `fallback_${idx}`,
          trigger: fallback,
          response: this.generateFallbackResponse(fallback)
        })),
        createdAt: new Date()
      };

      script.flow = flow;

      return {
        flowId: flow.id,
        scriptId,
        branchCount: branches.length,
        fallbackCount: fallbacks.length,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Branching flow creation failed: ${error.message}`);
      return { error: error.message };
    }
  }

  async validateScript(args) {
    try {
      const { scriptId, checkCompliance, checkNatural } = args;

      if (!this.scripts.has(scriptId)) {
        throw new Error(`Script ${scriptId} not found`);
      }

      logger.info(`✔️  Validating script ${scriptId}`);

      const script = this.scripts.get(scriptId);
      const issues = [];
      const warnings = [];

      // Check naturalness
      if (checkNatural) {
        if (script.content.length < 200) {
          warnings.push('Script is quite short - may need more detail');
        }
        if (script.content.includes('PLACEHOLDER')) {
          issues.push('Script contains placeholder text');
        }
      }

      // Check compliance
      if (checkCompliance) {
        if (!script.objectionHandling || script.objectionHandling.length === 0) {
          warnings.push('No objection handling included');
        }
        if (!script.closingStatement) {
          warnings.push('No closing statement defined');
        }
      }

      script.validated = issues.length === 0;
      script.validationResults = {
        issues,
        warnings,
        score: (100 - (issues.length * 25 + warnings.length * 10)).toFixed(1)
      };

      return {
        scriptId,
        validated: script.validated,
        issues,
        warnings,
        score: script.validationResults.score,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Script validation failed: ${error.message}`);
      return { error: error.message };
    }
  }

  async deployToRetell(args) {
    try {
      const { scriptId, agentName } = args;

      if (!this.scripts.has(scriptId)) {
        throw new Error(`Script ${scriptId} not found`);
      }

      const script = this.scripts.get(scriptId);

      if (!script.validated) {
        throw new Error('Cannot deploy unvalidated script');
      }

      logger.info(`🚀 Deploying script ${scriptId} to Retell as ${agentName}`);

      if (!this.integrations.retell) {
        logger.warn('Retell integration not available - mock deployment');
        return {
          deployed: true,
          agentId: `agent_${Date.now()}`,
          agentName,
          scriptId,
          status: 'mock_deployed',
          timestamp: new Date()
        };
      }

      // Create Retell agent with script content
      const systemPrompt = this.generateSystemPromptFromScript(script);
      const result = await this.integrations.retell.createAgent(agentName, systemPrompt, {
        voice: 'default',
        temperature: 0.7
      });

      script.deployed = true;
      script.deployedAgentId = result.agentId;
      script.deployedAgentName = agentName;
      script.deployedAt = new Date();

      return {
        deployed: true,
        scriptId,
        agentId: result.agentId,
        agentName,
        status: 'active',
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Script deployment failed: ${error.message}`);
      return { error: error.message };
    }
  }

  async getScript(args) {
    try {
      const { scriptId } = args;

      if (!this.scripts.has(scriptId)) {
        throw new Error(`Script ${scriptId} not found`);
      }

      const script = this.scripts.get(scriptId);

      return {
        scriptId: script.id,
        callType: script.callType,
        objective: script.objective,
        content: script.content.substring(0, 500),
        validated: script.validated,
        deployed: script.deployed,
        deployedAgentId: script.deployedAgentId || null,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Script retrieval failed: ${error.message}`);
      return { error: error.message };
    }
  }

  // Helper methods

  generateScriptContent(callType, objective, tone) {
    const openings = {
      sales: 'Hi [Name]! I hope I\'m not catching you at a bad time. I\'m calling because I think I might have something interesting for you.',
      support: 'Hello, thank you for contacting us. I\'m here to help. Can you tell me what\'s going on?',
      lead_generation: 'Hi [Name]! Quick question - are you open to hearing about a solution that could help you [benefit]?',
      followup: 'Hi [Name], just following up on our previous conversation.',
      survey: 'Hi [Name], would you have 2 minutes to answer a quick question?',
      scheduling: 'Hi [Name], I\'m calling to see if we can find a time that works for you to meet.'
    };

    const middles = {
      sales: 'We help businesses like yours [benefit]. Would it make sense to spend 15 minutes learning more?',
      support: 'Let me help you resolve that. [Service details]. Does that help?',
      lead_generation: 'Many of our customers have seen [result]. Could I show you how it works?',
      followup: 'I wanted to circle back on [previous topic] and see if things have progressed.',
      survey: 'What\'s been your biggest challenge with [topic]?',
      scheduling: 'I have a few slots available this week - what works best for you?'
    };

    const closings = {
      sales: 'Great! Let me get you scheduled for a quick demo.',
      support: 'Perfect, that should do it. Is there anything else I can help with?',
      lead_generation: 'Awesome! Can I send you some information about our [solution]?',
      followup: 'Thanks for the update. Let\'s stay in touch!',
      survey: 'Thanks so much for your feedback!',
      scheduling: 'Excellent! I\'ll send you a calendar invite.'
    };

    return `${openings[callType] || openings.sales}\n\n${middles[callType] || middles.sales}\n\n${closings[callType] || closings.sales}`;
  }

  generateHoldingPoints(callType) {
    return [
      'That\'s a great question.',
      'I appreciate you mentioning that.',
      'Let me explain a bit more about how this works.',
      'Before we move forward, let me make sure I understand your needs.',
      'One more thing that might be relevant...'
    ];
  }

  generateObjectionHandlers(callType) {
    return {
      'too_expensive': 'I understand cost is a factor. Many of our customers found the ROI outweighs the initial investment.',
      'not_interested': 'That\'s fair - but would you be open to hearing how [competitor] is solving this?',
      'no_time': 'I completely get it. Could I follow up at a better time?',
      'need_approval': 'Totally understand. Who else should I involve in this conversation?',
      'want_to_think': 'Of course! What questions can I answer for you while you\'re thinking it over?'
    };
  }

  generateClosing(callType) {
    const closings = {
      sales: 'Great! I\'ll get that scheduled for you. Thanks for your time!',
      support: 'You\'re all set. Have a great rest of your day!',
      lead_generation: 'Thanks again for your time. I\'ll reach out soon!',
      followup: 'Talk soon!',
      survey: 'This will really help us improve!',
      scheduling: 'Looking forward to connecting with you!'
    };
    return closings[callType] || 'Thanks for your time!';
  }

  generateBranchResponse(condition) {
    const responses = {
      'customer_interested': 'That\'s fantastic! Tell me more about what caught your attention.',
      'customer_hesitant': 'I understand - let me address your concerns.',
      'customer_objection': 'Great question. Here\'s how we handle that...',
      'customer_ready': 'Excellent! Let\'s move forward. Here\'s the next step...'
    };
    return responses[condition] || 'Thank you for sharing that.';
  }

  generateFollowUp(condition) {
    return `Based on customer response of "${condition}", propose next action or question.`;
  }

  generateFallbackResponse(trigger) {
    return `I want to make sure I understood correctly. Are you saying that [repeat customer objection]?`;
  }

  generateSystemPromptFromScript(script) {
    return `You are a ${script.callType} agent calling about: ${script.objective}

Target audience: ${script.targetAudience || 'Business professionals'}
Tone: ${script.tone || 'professional'}
Duration target: ${script.duration} minutes

Key script points:
${script.content}

Objection handling:
${Object.entries(script.objectionHandling).map(([key, val]) => `- ${key}: ${val}`).join('\n')}

Closing: ${script.closingStatement}

Important: Be natural and conversational. Listen more than you talk.`;
  }
}

export { CallScriptWriterAgent };
