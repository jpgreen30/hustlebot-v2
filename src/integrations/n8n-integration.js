/**
 * N8N WEBHOOK INTEGRATION
 *
 * Wire Hustlebot factories to n8n for deterministic automation:
 * - Content generation triggers workflow
 * - Lead scoring triggers actions
 * - Email sends trigger campaigns
 * - Commerce orders trigger fulfillment
 *
 * Connects: HustleBot → Webhooks → n8n
 */

import logger from '../utils/logger.js';

// Dedicated Day-1 test workflow already live on the shared Ping OS n8n.
// Overridden by N8N_TEST_WEBHOOK_URL / N8N_WEBHOOK_URL when set.
const DEFAULT_N8N_TEST_WEBHOOK = 'https://pingos-n8n.onrender.com/webhook/hustlebot-test';

function extractProviderExecutionId(body) {
  const items = Array.isArray(body) ? body : [body];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const id =
      item.n8nExecutionId ||
      item.executionId ||
      item.workflowRunId ||
      item.id;
    if (id != null && String(id).trim() !== '') return String(id);
  }
  return null;
}

class N8NIntegration {
  constructor(config = {}) {
    this.webhookUrl =
      process.env.N8N_WEBHOOK_URL ||
      process.env.N8N_TEST_WEBHOOK_URL ||
      DEFAULT_N8N_TEST_WEBHOOK;
    this.n8nEnabled = !!this.webhookUrl;
    this.retryAttempts = 3;
    this.retryDelay = 1000;
    this.webhookHistory = [];

    // Workflow registry: alias → webhook URL/configuration
    this.workflows = new Map();
    this.registerDefaultWorkflows(config.workflows || {});
  }

  /**
   * Register default workflows from environment or config
   */
  registerDefaultWorkflows(customWorkflows = {}) {
    let envWorkflow = {};
    if (process.env.N8N_WORKFLOWS) {
      try {
        envWorkflow = JSON.parse(process.env.N8N_WORKFLOWS);
      } catch (error) {
        logger.error(`N8N_WORKFLOWS is not valid JSON: ${error.message}`);
      }
    }
    const all = { ...envWorkflow, ...customWorkflows };

    for (const [alias, config] of Object.entries(all)) {
      if (typeof config === 'string') {
        // Simple URL string
        this.workflows.set(alias, { url: config });
      } else if (typeof config === 'object' && config.url) {
        // Full config object
        this.workflows.set(alias, config);
      }
    }

    // Dedicated test workflow, then fall back to the generic webhook URL.
    const testUrl =
      process.env.N8N_TEST_WEBHOOK_URL ||
      this.webhookUrl ||
      DEFAULT_N8N_TEST_WEBHOOK;
    if (testUrl && !this.workflows.has('test')) {
      this.workflows.set('test', { url: testUrl });
    }
    if (testUrl && !this.workflows.has('acquisition-test')) {
      this.workflows.set('acquisition-test', { url: testUrl, timeout: 15000 });
    }
    if (testUrl && !this.workflows.has('campaign-prepare')) {
      this.workflows.set('campaign-prepare', { url: testUrl, timeout: 20000 });
    }

    if (this.workflows.size > 0) {
      logger.info(`🔗 n8n workflow registry loaded: ${Array.from(this.workflows.keys()).join(', ')}`);
    }
  }

  isReady() {
    return Boolean(this.n8nEnabled || this.workflows.size > 0);
  }

  async initialize() {
    logger.info('🔗 n8n Integration initialized');
    if (!this.n8nEnabled) {
      logger.warn('⚠️  N8N_WEBHOOK_URL not set, webhook integration disabled');
    }
    return true;
  }

  /**
   * Send event to n8n workflow
   */
  async sendEvent(eventType, data = {}, options = {}) {
    try {
      if (!this.n8nEnabled) {
        logger.warn(`Event not sent to n8n (not configured): ${eventType}`);
        return {
          event: eventType,
          status: 'unavailable',
          reason: 'N8N_WEBHOOK_URL not configured',
          timestamp: new Date()
        };
      }

      logger.info(`🔗 Sending ${eventType} event to n8n webhook`);

      const payload = {
        event: eventType,
        timestamp: new Date().toISOString(),
        data,
        source: 'hustlebot-v2'
      };

      // Send to n8n webhook with retry logic and timeout
      let response;
      let lastError;
      const timeoutMs = 10000;

      for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
        try {
          logger.debug(`n8n webhook attempt ${attempt + 1}/${this.retryAttempts}`);

          // Use AbortController for timeout support
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

          try {
            response = await fetch(this.webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
              signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
              logger.info(`✅ n8n webhook accepted event: ${eventType}`);
              break;
            }

            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          } catch (fetchError) {
            clearTimeout(timeoutId);
            throw fetchError;
          }
        } catch (error) {
          lastError = error;
          const errorMsg = error.name === 'AbortError'
            ? `timeout after ${timeoutMs}ms`
            : error.message;
          logger.warn(`n8n webhook attempt ${attempt + 1} failed: ${errorMsg}`);

          if (attempt < this.retryAttempts - 1) {
            const delay = this.retryDelay * Math.pow(2, attempt);
            logger.debug(`Retrying in ${delay}ms...`);
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      }

      if (!response || !response.ok) {
        throw lastError || new Error('n8n webhook failed after retries');
      }

      const record = {
        id: `webhook-${Date.now()}`,
        eventType,
        status: 'delivered',
        timestamp: new Date(),
        dataSize: JSON.stringify(data).length,
        attempts: this.retryAttempts
      };

      this.webhookHistory.push(record);

      return {
        eventId: record.id,
        event: eventType,
        status: 'delivered',
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`n8n event sending failed: ${error.message}`);
      return {
        event: eventType,
        status: 'failed',
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Execute a specific n8n workflow by alias
   * Maps workflow alias to registered webhook URL and executes
   */
  async execute(alias, payload = {}) {
    try {
      const workflow = this.workflows.get(alias);

      if (!workflow) {
        logger.warn(`Workflow not registered: ${alias}`);
        return {
          alias,
          status: 'failed',
          error: `Workflow '${alias}' not registered`,
          availableWorkflows: Array.from(this.workflows.keys()),
          timestamp: new Date()
        };
      }

      const workflowUrl = workflow.url;
      logger.info(`🔄 Executing workflow '${alias}' at ${workflowUrl}`);

      const request = {
        alias,
        payload,
        timestamp: new Date().toISOString(),
        source: 'hustlebot-v2'
      };

      // Use same retry + timeout logic as sendEvent
      let response;
      let lastError;
      const timeoutMs = workflow.timeout || 10000;

      for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
        try {
          logger.debug(`Workflow attempt ${attempt + 1}/${this.retryAttempts}`);

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

          try {
            response = await fetch(workflowUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(request),
              signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
              logger.info(`✅ Workflow '${alias}' executed successfully`);
              break;
            }

            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          } catch (fetchError) {
            clearTimeout(timeoutId);
            throw fetchError;
          }
        } catch (error) {
          lastError = error;
          const errorMsg = error.name === 'AbortError'
            ? `timeout after ${timeoutMs}ms`
            : error.message;
          logger.warn(`Workflow attempt ${attempt + 1} failed: ${errorMsg}`);

          if (attempt < this.retryAttempts - 1) {
            const delay = this.retryDelay * Math.pow(2, attempt);
            logger.debug(`Retrying in ${delay}ms...`);
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      }

      if (!response || !response.ok) {
        throw lastError || new Error('Workflow execution failed after retries');
      }

      let providerBody = null;
      try {
        providerBody = await response.json();
      } catch {
        providerBody = null;
      }
      const providerExecutionId = extractProviderExecutionId(providerBody);

      const record = {
        id: providerExecutionId || null,
        alias,
        status: 'executed',
        timestamp: new Date(),
        payloadSize: JSON.stringify(payload).length
      };

      this.webhookHistory.push(record);

      if (!providerExecutionId) {
        logger.warn(`n8n workflow '${alias}' accepted but returned no execution id`);
      }

      return {
        alias,
        status: 'executed',
        executionId: providerExecutionId,
        providerExecutionId,
        provider: 'n8n',
        message: Array.isArray(providerBody)
          ? providerBody[0]?.message
          : providerBody?.message,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Workflow execution failed: ${error.message}`);
      return {
        alias,
        status: 'failed',
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Content generated → trigger content workflow
   */
  async onContentGenerated(content) {
    try {
      logger.info(`📝 Content generated event: ${content.topic}`);

      return await this.sendEvent('content.generated', {
        contentId: content.id,
        topic: content.topic,
        contentType: content.type,
        readability: content.readabilityScore,
        keyTopic: content.keyTopic,
        targetAudience: content.targetAudience
      }, {
        urgency: 'high',
        retries: true
      });
    } catch (error) {
      logger.error(`Content event failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Lead scored → trigger qualification workflow
   */
  async onLeadScored(lead) {
    try {
      logger.info(`🎯 Lead scored event: ${lead.email}`);

      return await this.sendEvent('lead.scored', {
        leadId: lead.id,
        email: lead.email,
        company: lead.company,
        score: lead.score,
        isQualified: lead.score >= 60,
        qualityFactors: lead.qualityFactors
      }, {
        urgency: lead.score > 80 ? 'high' : 'normal'
      });
    } catch (error) {
      logger.error(`Lead event failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Email sent → trigger campaign workflow
   */
  async onEmailSent(email, result) {
    try {
      logger.info(`📧 Email sent event: ${email.to}`);

      return await this.sendEvent('email.sent', {
        messageId: result.messageId,
        to: email.to,
        subject: email.subject,
        template: email.template || 'custom',
        campaignId: email.trackingData?.campaignId,
        status: result.status
      });
    } catch (error) {
      logger.error(`Email event failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Order placed → trigger fulfillment workflow
   */
  async onOrderPlaced(order) {
    try {
      logger.info(`🛒 Order placed event: ${order.id}`);

      return await this.sendEvent('order.placed', {
        orderId: order.id,
        total: order.total,
        itemCount: order.items.length,
        customerEmail: order.customer.email,
        shippingAddress: order.customer.shippingAddress
      }, {
        urgency: 'high',
        retries: true
      });
    } catch (error) {
      logger.error(`Order event failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Video published → trigger distribution workflow
   */
  async onVideoPublished(video, publications) {
    try {
      logger.info(`🎬 Video published event: ${video.topic}`);

      return await this.sendEvent('video.published', {
        videoId: video.id,
        topic: video.topic,
        platforms: publications.map(p => ({
          platform: p.platform,
          url: p.url
        })),
        duration: video.duration,
        quality: video.quality
      });
    } catch (error) {
      logger.error(`Video event failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Site deployed → trigger SEO workflow
   */
  async onSiteDeployed(pageId, deployment) {
    try {
      logger.info(`🌐 Site deployed event: ${pageId}`);

      return await this.sendEvent('site.deployed', {
        pageId,
        url: deployment.url,
        status: deployment.status,
        timestamp: deployment.timestamp
      });
    } catch (error) {
      logger.error(`Site event failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Workflow executed → trigger next automation
   */
  async onWorkflowExecuted(execution) {
    try {
      logger.info(`🔄 Workflow executed: ${execution.workflowName}`);

      return await this.sendEvent('workflow.executed', {
        workflowId: execution.workflowId,
        workflowName: execution.workflowName,
        executionId: execution.id,
        status: execution.status,
        stepCount: execution.steps.length,
        outputs: execution.outputs
      });
    } catch (error) {
      logger.error(`Workflow event failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Get webhook history
   */
  getHistory(limit = 50) {
    return {
      total: this.webhookHistory.length,
      recent: this.webhookHistory.slice(-limit).reverse(),
      timestamp: new Date()
    };
  }

  /**
   * Get mock response (when n8n not configured)
   */
  getMockResponse(eventType) {
    return {
      event: eventType,
      status: 'unavailable',
      reason: 'N8N_WEBHOOK_URL not configured',
      timestamp: new Date()
    };
  }

  /**
   * Test webhook connection
   */
  async testConnection() {
    try {
      if (!this.n8nEnabled) {
        return {
          connected: false,
          reason: 'N8N_WEBHOOK_URL not set',
          timestamp: new Date()
        };
      }

      logger.info('🔗 Testing n8n webhook connection...');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'health.ping',
            timestamp: new Date().toISOString(),
            source: 'hustlebot-v2'
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        return {
          connected: response.ok,
          httpStatus: response.status,
          timestamp: new Date()
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      logger.error(`Connection test failed: ${error.message}`);
      return {
        connected: false,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Get integration status
   */
  getStatus() {
    return {
      initialized: true,
      n8nEnabled: this.n8nEnabled,
      webhookUrl: this.n8nEnabled ? '***configured***' : 'not set',
      registeredWorkflows: Array.from(this.workflows.keys()),
      totalEvents: this.webhookHistory.length,
      recentEvents: this.webhookHistory.slice(-5).map(e => ({
        event: e.eventType || e.alias,
        status: e.status,
        timestamp: e.timestamp
      })),
      timestamp: new Date()
    };
  }

  async getHealth() {
    if (!this.n8nEnabled && this.workflows.size === 0) {
      return { state: 'MISCONFIGURED', detail: 'N8N_WEBHOOK_URL not set' };
    }
    const delivered = this.webhookHistory.filter((e) => e.status === 'delivered' || e.status === 'executed');
    if (delivered.length > 0) {
      return { state: 'HEALTHY', detail: `${delivered.length} webhook(s) delivered` };
    }
    return {
      state: 'UNVERIFIED',
      detail: this.n8nEnabled
        ? 'webhook configured; no successful execution yet'
        : `${this.workflows.size} workflow alias(es) registered; no successful execution yet`
    };
  }
}

export { N8NIntegration, DEFAULT_N8N_TEST_WEBHOOK, extractProviderExecutionId };
