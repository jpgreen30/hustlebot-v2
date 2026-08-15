/**
 * TRANSCRIPT PROCESSOR
 *
 * Handles Retell call transcripts and triggers workflow building
 * - Processes incoming transcripts from completed calls
 * - Routes to VoiceWorkflowBuilder for analysis
 * - Manages workflow creation pipeline
 * - Tracks transcript-to-workflow mappings
 */

import logger from '../utils/logger.js';

class TranscriptProcessor {
  constructor() {
    this.pendingTranscripts = new Map();
    this.processedTranscripts = new Map();
    this.transcriptWorkflowMap = new Map();
  }

  async processCallTranscript(callData) {
    try {
      const { callId, transcript, phoneNumber, agentName, duration, sentiment } = callData;

      logger.info(`📝 Processing transcript from call ${callId}`);

      const processedData = {
        callId,
        transcript,
        phoneNumber,
        agentName,
        duration,
        sentiment,
        receivedAt: new Date(),
        status: 'received',
        workflowId: null,
        error: null
      };

      this.pendingTranscripts.set(callId, processedData);

      const analysis = {
        callId,
        hasWorkflowIntent: this.detectWorkflowIntent(transcript),
        confidence: this.calculateIntentConfidence(transcript),
        intent: this.extractPrimaryIntent(transcript),
        actionCount: this.countActions(transcript)
      };

      logger.info(`✅ Transcript queued for processing: ${callId}`);

      return {
        callId,
        status: 'queued',
        analysis,
        nextStep: analysis.hasWorkflowIntent ? 'workflow_building' : 'archive',
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Transcript processing failed: ${error.message}`);
      return { error: error.message, callId: callData?.callId };
    }
  }

  async triggerWorkflowBuilding(callId, voiceWorkflowBuilder) {
    try {
      if (!this.pendingTranscripts.has(callId)) {
        throw new Error(`Call transcript ${callId} not found`);
      }

      const transcriptData = this.pendingTranscripts.get(callId);

      logger.info(`🔄 Triggering workflow building for call ${callId}`);

      // Step 1: Analyze transcript
      const analysisResult = await voiceWorkflowBuilder.analyzeTranscript({
        callId,
        transcript: transcriptData.transcript,
        agentName: transcriptData.agentName
      });

      if (analysisResult.error) {
        transcriptData.error = analysisResult.error;
        transcriptData.status = 'analysis_failed';
        return analysisResult;
      }

      // Step 2: Extract workflow steps
      const stepsResult = await voiceWorkflowBuilder.extractWorkflowSteps({
        analysisId: analysisResult.analysisId
      });

      if (stepsResult.error || !stepsResult.isValid) {
        transcriptData.status = 'validation_failed';
        return {
          callId,
          status: 'validation_failed',
          warnings: stepsResult.warnings,
          requiresManualReview: true
        };
      }

      // Step 3: Build workflow
      const workflowName = this.generateWorkflowName(transcriptData);
      const buildResult = await voiceWorkflowBuilder.buildWorkflow({
        workflowName,
        steps: stepsResult.steps,
        triggerType: 'voice',
        description: `Auto-generated from call ${callId}`
      });

      if (buildResult.error) {
        transcriptData.status = 'build_failed';
        return buildResult;
      }

      // Step 4: Deploy workflow
      const deployResult = await voiceWorkflowBuilder.deployWorkflow({
        workflowId: buildResult.workflowId,
        autoStart: true,
        notifyUser: true
      });

      transcriptData.workflowId = buildResult.workflowId;
      transcriptData.status = 'workflow_built';
      this.transcriptWorkflowMap.set(callId, buildResult.workflowId);

      logger.info(`✅ Workflow created from transcript: ${buildResult.workflowId}`);

      return {
        callId,
        workflowId: buildResult.workflowId,
        status: 'deployed',
        workflowName,
        stepCount: stepsResult.stepCount,
        confirmationUrl: deployResult.confirmationUrl,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Workflow building trigger failed: ${error.message}`);
      if (this.pendingTranscripts.has(callId)) {
        this.pendingTranscripts.get(callId).error = error.message;
      }
      return { error: error.message, callId };
    }
  }

  getTranscriptStatus(callId) {
    if (this.pendingTranscripts.has(callId)) {
      const data = this.pendingTranscripts.get(callId);
      return {
        callId,
        status: data.status,
        workflowId: data.workflowId,
        error: data.error,
        timestamp: data.receivedAt
      };
    }

    if (this.processedTranscripts.has(callId)) {
      return this.processedTranscripts.get(callId);
    }

    return { error: `Transcript ${callId} not found` };
  }

  getWorkflowFromTranscript(callId) {
    return this.transcriptWorkflowMap.get(callId) || null;
  }

  archiveTranscript(callId) {
    if (this.pendingTranscripts.has(callId)) {
      const data = this.pendingTranscripts.get(callId);
      this.processedTranscripts.set(callId, data);
      this.pendingTranscripts.delete(callId);
      logger.info(`📦 Archived transcript: ${callId}`);
      return true;
    }
    return false;
  }

  // Helper methods

  detectWorkflowIntent(transcript) {
    const workflowKeywords = [
      'workflow', 'automate', 'automation', 'build', 'create', 'setup',
      'integrate', 'connect', 'sync', 'pull', 'push', 'send', 'email',
      'schedule', 'repeat', 'every', 'daily', 'weekly', 'monthly',
      'lead', 'prospect', 'enrich', 'score', 'qualify'
    ];

    const lowerTranscript = transcript.toLowerCase();
    return workflowKeywords.some(keyword => lowerTranscript.includes(keyword));
  }

  calculateIntentConfidence(transcript) {
    const length = transcript.length;
    const actionCount = this.countActions(transcript);
    const specificity = this.measureSpecificity(transcript);

    let confidence = 0.5;
    if (length > 500) confidence += 0.15;
    if (actionCount > 2) confidence += 0.2;
    confidence += specificity;

    return Math.min(confidence, 0.99);
  }

  extractPrimaryIntent(transcript) {
    const intents = {
      'lead_generation': ['lead', 'prospect', 'apollo', 'search'],
      'enrichment': ['enrich', 'clearbit', 'data', 'details'],
      'email': ['email', 'send', 'campaign', 'message'],
      'scoring': ['score', 'rate', 'rank', 'qualify'],
      'sync': ['sync', 'integrate', 'connect', 'push'],
      'automation': ['automate', 'workflow', 'schedule', 'repeat']
    };

    const lowerTranscript = transcript.toLowerCase();

    for (const [intent, keywords] of Object.entries(intents)) {
      if (keywords.some(kw => lowerTranscript.includes(kw))) {
        return intent;
      }
    }

    return 'general';
  }

  countActions(transcript) {
    const actions = [
      'search', 'find', 'pull', 'get', 'enrich', 'score', 'rate',
      'send', 'email', 'create', 'update', 'delete', 'export'
    ];

    const lowerTranscript = transcript.toLowerCase();
    let count = 0;

    for (const action of actions) {
      if (lowerTranscript.includes(action)) {
        count++;
      }
    }

    return count;
  }

  measureSpecificity(transcript) {
    const integrations = [
      'apollo', 'clearbit', 'stripe', 'shopify', 'hubspot',
      'gmail', 'slack', 'linkedin', 'twitter'
    ];

    const lowerTranscript = transcript.toLowerCase();
    const mentionedCount = integrations.filter(i => lowerTranscript.includes(i)).length;

    return (mentionedCount / integrations.length) * 0.3;
  }

  generateWorkflowName(transcriptData) {
    const timestamp = new Date().toISOString().split('T')[0];
    const phoneHash = transcriptData.phoneNumber
      ? transcriptData.phoneNumber.slice(-4)
      : 'auto';

    return `voice_workflow_${phoneHash}_${timestamp}`;
  }

  getAllPendingTranscripts() {
    return Array.from(this.pendingTranscripts.values());
  }

  getAllProcessedTranscripts() {
    return Array.from(this.processedTranscripts.values());
  }

  getStats() {
    return {
      pending: this.pendingTranscripts.size,
      processed: this.processedTranscripts.size,
      mappedToWorkflows: this.transcriptWorkflowMap.size,
      timestamp: new Date()
    };
  }
}

export { TranscriptProcessor };
