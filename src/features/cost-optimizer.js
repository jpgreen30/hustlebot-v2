/**
 * COST OPTIMIZER
 *
 * Budget tracking, cost analysis, and optimization recommendations
 */

import logger from '../utils/logger.js';

class CostOptimizer {
  constructor(config = {}) {
    this.monthlyBudget = parseFloat(process.env.MONTHLY_BUDGET || '100');
    this.transactions = new Map();
    this.recommendations = new Map();
    this.alerts = new Map();
  }

  async initialize() {
    logger.info('💰 Cost Optimizer initialized');
    logger.info(`   Monthly budget: $${this.monthlyBudget}`);
    return true;
  }

  /**
   * Log transaction
   */
  async logTransaction(service, amount, metadata = {}) {
    try {
      logger.info(`💳 Logging transaction: ${service} - $${amount}`);

      const transaction = {
        id: `txn_${Date.now()}`,
        service,
        amount,
        metadata,
        timestamp: new Date(),
        month: new Date().toISOString().slice(0, 7)
      };

      this.transactions.set(transaction.id, transaction);

      // Check if spending exceeds budget
      const monthlySpend = this.getMonthlySpend();
      if (monthlySpend > this.monthlyBudget) {
        this.createAlert('BUDGET_EXCEEDED', `Monthly spend ($${monthlySpend.toFixed(2)}) exceeded budget ($${this.monthlyBudget})`);
      }

      return {
        transactionId: transaction.id,
        service,
        amount,
        logged: true,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Transaction logging failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Get monthly spending
   */
  getMonthlySpend() {
    const currentMonth = new Date().toISOString().slice(0, 7);
    return Array.from(this.transactions.values())
      .filter(t => t.month === currentMonth)
      .reduce((sum, t) => sum + t.amount, 0);
  }

  /**
   * Get spending breakdown by service
   */
  async getSpendingBreakdown(month = null) {
    try {
      const targetMonth = month || new Date().toISOString().slice(0, 7);

      const breakdown = {};
      Array.from(this.transactions.values())
        .filter(t => t.month === targetMonth)
        .forEach(t => {
          breakdown[t.service] = (breakdown[t.service] || 0) + t.amount;
        });

      const total = Object.values(breakdown).reduce((sum, v) => sum + v, 0);
      const remaining = this.monthlyBudget - total;

      return {
        month: targetMonth,
        services: breakdown,
        total: parseFloat(total.toFixed(2)),
        budget: this.monthlyBudget,
        remaining: Math.max(0, remaining),
        percentageUsed: (total / this.monthlyBudget * 100).toFixed(1),
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Breakdown retrieval failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Analyze cost trends
   */
  async analyzeCostTrends(months = 3) {
    try {
      logger.info(`📈 Analyzing cost trends for last ${months} months`);

      const trends = {};
      const now = new Date();

      for (let i = 0; i < months; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStr = date.toISOString().slice(0, 7);

        const monthlyTotal = Array.from(this.transactions.values())
          .filter(t => t.month === monthStr)
          .reduce((sum, t) => sum + t.amount, 0);

        trends[monthStr] = monthlyTotal;
      }

      const values = Object.values(trends);
      const avgSpend = values.reduce((sum, v) => sum + v, 0) / values.length;
      const trend = values[0] > avgSpend ? 'increasing' : 'decreasing';

      return {
        months: trends,
        averageSpend: avgSpend.toFixed(2),
        trend,
        forecast30days: (avgSpend).toFixed(2),
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Trend analysis failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Generate cost recommendations
   */
  async generateRecommendations() {
    try {
      logger.info(`💡 Generating cost optimization recommendations`);

      const breakdown = await this.getSpendingBreakdown();
      const recommendations = [];

      // Find high-cost services
      const sorted = Object.entries(breakdown.services || {})
        .sort((a, b) => b[1] - a[1]);

      for (const [service, cost] of sorted.slice(0, 3)) {
        if (cost > this.monthlyBudget * 0.3) {
          recommendations.push({
            id: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            service,
            current: cost,
            recommendation: `${service} accounts for ${(cost / breakdown.total * 100).toFixed(0)}% of costs. Consider optimization.`,
            potential_savings: (cost * 0.2).toFixed(2),
            priority: 'high'
          });
        }
      }

      // Budget alert
      if (breakdown.percentageUsed > 80) {
        recommendations.push({
          id: `rec_${Date.now()}`,
          recommendation: `Budget usage at ${breakdown.percentageUsed}%. Only $${breakdown.remaining} remaining.`,
          priority: 'critical'
        });
      }

      for (const rec of recommendations) {
        this.recommendations.set(rec.id, rec);
      }

      return {
        recommendationCount: recommendations.length,
        recommendations,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Recommendation generation failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Set budget alert
   */
  async setBudgetAlert(percentage) {
    try {
      const threshold = this.monthlyBudget * (percentage / 100);
      const currentSpend = this.getMonthlySpend();

      if (currentSpend >= threshold) {
        this.createAlert('BUDGET_THRESHOLD', `Budget threshold ${percentage}% reached`);
      }

      return {
        threshold: threshold.toFixed(2),
        currentSpend: currentSpend.toFixed(2),
        percentage,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Alert setting failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Get cost per operation
   */
  async getCostPerOperation(operationType, count) {
    try {
      logger.info(`💰 Calculating cost per operation: ${operationType}`);

      // Estimated costs per operation
      const operationCosts = {
        'image_generation': 0.02,
        'blog_post': 0.05,
        'video_generation': 0.15,
        'lead_enrichment': 0.01,
        'email_send': 0.001,
        'api_call': 0.0001
      };

      const costPerOp = operationCosts[operationType] || 0.01;
      const totalCost = costPerOp * count;

      return {
        operationType,
        count,
        costPerOperation: costPerOp.toFixed(4),
        totalCost: totalCost.toFixed(2),
        estimatedMonthlyAtScale: (totalCost * 30).toFixed(2),
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Cost calculation failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Create alert
   */
  createAlert(type, message) {
    const alert = {
      id: `alert_${Date.now()}`,
      type,
      message,
      severity: type === 'BUDGET_EXCEEDED' ? 'critical' : 'warning',
      createdAt: new Date(),
      resolved: false
    };

    this.alerts.set(alert.id, alert);
    logger.warn(`⚠️  Alert: ${message}`);

    return alert;
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts() {
    try {
      const active = Array.from(this.alerts.values())
        .filter(a => !a.resolved)
        .sort((a, b) => b.createdAt - a.createdAt);

      return {
        alertCount: active.length,
        alerts: active,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Alert retrieval failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Resolve alert
   */
  async resolveAlert(alertId) {
    try {
      if (!this.alerts.has(alertId)) {
        throw new Error(`Alert ${alertId} not found`);
      }

      const alert = this.alerts.get(alertId);
      alert.resolved = true;
      alert.resolvedAt = new Date();

      logger.info(`✅ Alert resolved: ${alertId}`);

      return {
        alertId,
        resolved: true,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Alert resolution failed: ${error.message}`);
      return { error: error.message };
    }
  }

  getStatus() {
    const monthlySpend = this.getMonthlySpend();

    return {
      initialized: true,
      monthlyBudget: this.monthlyBudget,
      currentSpend: parseFloat(monthlySpend.toFixed(2)),
      remaining: Math.max(0, this.monthlyBudget - monthlySpend).toFixed(2),
      percentageUsed: (monthlySpend / this.monthlyBudget * 100).toFixed(1),
      totalTransactions: this.transactions.size,
      activeAlerts: Array.from(this.alerts.values()).filter(a => !a.resolved).length,
      timestamp: new Date()
    };
  }
}

export { CostOptimizer };
