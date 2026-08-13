/**
 * BUDGET CONTROLLER
 * 
 * Responsibilities:
 * 1. Track monthly spend per user
 * 2. Enforce budget limits ($100/month default)
 * 3. Alert when approaching limit
 * 4. Auto-optimize model selection when budget tight
 * 5. Generate cost breakdowns
 */

import logger from '../utils/logger.js';

class BudgetController {
  constructor(db) {
    this.db = db;
    this.warningThreshold = 0.75; // Warn at 75% spend
    this.criticalThreshold = 0.90; // Stop at 90% spend
  }

  /**
   * Check if user has budget available for operation
   */
  async canExecute(userId, estimatedCost = 0) {
    try {
      const budget = await this.db.getUserBudget(userId);
      const spent = await this.db.getTotalSpentThisMonth(userId);
      const remaining = budget.monthly_budget - spent;

      const canExecute = remaining > estimatedCost;

      if (!canExecute) {
        logger.warn(
          `User ${userId} insufficient budget. Need: $${estimatedCost.toFixed(2)}, Have: $${remaining.toFixed(2)}`
        );
      }

      return {
        canExecute,
        spent,
        budget: budget.monthly_budget,
        remaining,
        percentUsed: (spent / budget.monthly_budget) * 100
      };
    } catch (error) {
      logger.error('Error in canExecute:', error);
      throw error;
    }
  }

  /**
   * Record spend and check if alert needed
   */
  async recordSpend(userId, projectId, amount, service, description) {
    try {
      // Record the transaction
      await this.db.recordSpend(userId, projectId, amount, service, description);

      // Get updated budget status
      const status = await this.canExecute(userId);
      const alerts = [];

      // Check thresholds
      if (status.percentUsed >= this.criticalThreshold) {
        alerts.push({
          level: 'critical',
          message: `🚨 CRITICAL: You've used ${status.percentUsed.toFixed(0)}% of your monthly budget ($${status.spent.toFixed(2)} of $${status.budget})`,
          action: 'PAUSE_ALL_OPERATIONS'
        });
      } else if (status.percentUsed >= this.warningThreshold) {
        alerts.push({
          level: 'warning',
          message: `⚠️ WARNING: You've used ${status.percentUsed.toFixed(0)}% of your monthly budget ($${status.spent.toFixed(2)} of $${status.budget})`,
          action: 'AUTO_OPTIMIZE'
        });
      }

      return {
        recorded: true,
        alerts,
        status
      };
    } catch (error) {
      logger.error('Error in recordSpend:', error);
      throw error;
    }
  }

  /**
   * Get detailed budget report
   */
  async getBudgetReport(userId) {
    try {
      const budget = await this.db.getUserBudget(userId);
      const spent = await this.db.getTotalSpentThisMonth(userId);
      const byService = await this.db.getSpendByService(userId);

      const remaining = budget.monthly_budget - spent;
      const percentUsed = (spent / budget.monthly_budget) * 100;

      return {
        monthly_budget: budget.monthly_budget,
        currency: budget.budget_currency,
        spent: parseFloat(spent.toFixed(4)),
        remaining: parseFloat(remaining.toFixed(4)),
        percent_used: parseFloat(percentUsed.toFixed(1)),
        breakdown_by_service: this.formatServiceBreakdown(byService),
        status: this.getStatus(percentUsed),
        recommendations: this.getRecommendations(percentUsed, byService)
      };
    } catch (error) {
      logger.error('Error in getBudgetReport:', error);
      throw error;
    }
  }

  /**
   * Format service breakdown for display
   */
  formatServiceBreakdown(breakdown) {
    const formatted = {};
    const total = Object.values(breakdown).reduce((a, b) => a + b, 0);

    for (const [service, amount] of Object.entries(breakdown)) {
      formatted[service] = {
        amount: parseFloat(amount.toFixed(4)),
        percent: total > 0 ? parseFloat(((amount / total) * 100).toFixed(1)) : 0
      };
    }

    return formatted;
  }

  /**
   * Get budget status string
   */
  getStatus(percentUsed) {
    if (percentUsed >= this.criticalThreshold) {
      return 'CRITICAL - Budget exceeded';
    }
    if (percentUsed >= this.warningThreshold) {
      return 'WARNING - Budget running low';
    }
    if (percentUsed >= 0.5) {
      return 'CAUTION - Budget halfway used';
    }
    return 'OK - Budget available';
  }

  /**
   * Get cost optimization recommendations
   */
  getRecommendations(percentUsed, breakdown) {
    const recommendations = [];

    // Service-specific recommendations
    if (breakdown.openrouter > 20) {
      recommendations.push({
        priority: 'HIGH',
        service: 'OpenRouter',
        suggestion: 'Switch to Grok 2 or Llama 3.1 for non-critical tasks',
        potential_savings: 'Save 50-70% on LLM costs'
      });
    }

    if (breakdown.replicate > 15) {
      recommendations.push({
        priority: 'MEDIUM',
        service: 'Image Generation',
        suggestion: 'Use free tier or batch fewer images',
        potential_savings: 'Save $5-10/month'
      });
    }

    if (breakdown.firecrawl > 10) {
      recommendations.push({
        priority: 'MEDIUM',
        service: 'Web Scraping',
        suggestion: 'Batch scraping requests or use simpler extraction',
        potential_savings: 'Save $3-5/month'
      });
    }

    // Overall budget recommendations
    if (percentUsed >= this.warningThreshold) {
      recommendations.push({
        priority: 'CRITICAL',
        service: 'Overall',
        suggestion: 'Increase monthly budget or reduce project scope',
        potential_savings: 'Avoid service interruptions'
      });
    }

    return recommendations;
  }

  /**
   * Get optimization settings based on budget status
   */
  async getOptimizationSettings(userId) {
    try {
      const status = await this.canExecute(userId);
      const percentUsed = status.percentUsed;

      const settings = {
        use_cheap_models: false,
        reduce_image_quality: false,
        batch_operations: false,
        disable_premium_features: false,
        cache_aggressively: false
      };

      if (percentUsed >= 75) {
        settings.use_cheap_models = true;
        settings.reduce_image_quality = true;
        settings.batch_operations = true;
        settings.cache_aggressively = true;
      }

      if (percentUsed >= 90) {
        settings.disable_premium_features = true;
      }

      return settings;
    } catch (error) {
      logger.error('Error in getOptimizationSettings:', error);
      throw error;
    }
  }

  /**
   * Estimate cost of operation
   */
  estimateCost(operation, parameters = {}) {
    const costMap = {
      'llm_call_sonnet': { base: 0.01, per_1k_tokens: 0.005 },
      'llm_call_grok': { base: 0.002, per_1k_tokens: 0.001 },
      'image_generation': { base: 0.10, per_image: 0.05 },
      'web_scraping': { base: 0.02, per_url: 0.01 },
      'lead_enrichment': { base: 0.05, per_lead: 0.01 },
      'email_send': { base: 0, per_email: 0.001 },
      'landing_page_build': { base: 2.00, per_component: 0.50 },
      'deployment': { base: 0, per_deployment: 0 }
    };

    const spec = costMap[operation];
    if (!spec) {
      logger.warn(`Unknown operation for cost estimation: ${operation}`);
      return 0;
    }

    let cost = spec.base;

    // Add variable costs
    if (spec.per_1k_tokens && parameters.tokens) {
      cost += (parameters.tokens / 1000) * spec.per_1k_tokens;
    }

    if (spec.per_image && parameters.quantity) {
      cost += parameters.quantity * spec.per_image;
    }

    if (spec.per_url && parameters.urls) {
      cost += parameters.urls * spec.per_url;
    }

    if (spec.per_lead && parameters.quantity) {
      cost += parameters.quantity * spec.per_lead;
    }

    if (spec.per_email && parameters.quantity) {
      cost += parameters.quantity * spec.per_email;
    }

    if (spec.per_component && parameters.components) {
      cost += parameters.components * spec.per_component;
    }

    return parseFloat(cost.toFixed(4));
  }

  /**
   * Generate budget alert message
   */
  formatBudgetAlert(userId, status, alert) {
    const spent = status.spent.toFixed(2);
    const budget = status.budget.toFixed(2);
    const remaining = status.remaining.toFixed(2);
    const percent = status.percentUsed.toFixed(1);

    let message = `💰 <b>Budget Report</b>\n\n`;
    message += `Monthly Budget: $${budget}\n`;
    message += `Spent: $${spent} (${percent}%)\n`;
    message += `Remaining: $${remaining}\n\n`;

    if (alert.level === 'critical') {
      message += `🚨 <b>CRITICAL</b>\n`;
      message += alert.message + '\n\n';
      message += `All operations have been paused to prevent overage.\n`;
      message += `[Increase Budget] [View Breakdown]\n`;
    } else if (alert.level === 'warning') {
      message += `⚠️ <b>WARNING</b>\n`;
      message += alert.message + '\n\n';
      message += `System is auto-optimizing to reduce costs.\n`;
      message += `[Increase Budget] [View Breakdown] [Optimize]\n`;
    }

    return message;
  }
}

export { BudgetController };
