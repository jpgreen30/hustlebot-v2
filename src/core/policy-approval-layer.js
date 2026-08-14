/**
 * POLICY & APPROVAL LAYER
 *
 * Responsibilities:
 * 1. Enforce budget and spending policies
 * 2. Manage approval gates for high-cost operations
 * 3. Control feature flags and capability access
 * 4. Support multiple approval levels and workflows
 * 5. Track approval decisions and audit compliance
 */

import logger from '../utils/logger.js';

class PolicyApprovalLayer {
  constructor(db, auditLogs) {
    this.db = db;
    this.auditLogs = auditLogs;

    this.policies = new Map(); // key = policyId, value = policy
    this.approvals = new Map(); // key = approvalId, value = approval request

    // Default policy thresholds
    this.defaultPolicy = {
      monthly_budget: 100, // USD
      per_operation_limit: 10, // USD
      approval_required_above: 5, // USD
      rate_limit_per_minute: 60,
      enabled_features: {
        voice_input: true,
        image_generation: true,
        lead_generation: true,
        landing_page_builder: true,
        email_automation: true
      }
    };

    this.initialized = false;
  }

  /**
   * Initialize policies from database
   */
  async initialize() {
    try {
      logger.info('🔐 Initializing Policy & Approval Layer...');

      if (this.db) {
        const rows = await this.db.getAllPolicies();
        for (const row of rows) {
          this.policies.set(row.user_id, {
            user_id: row.user_id,
            monthly_budget: row.monthly_budget,
            per_operation_limit: row.per_operation_limit,
            approval_required_above: row.approval_required_above,
            rate_limit_per_minute: row.rate_limit_per_minute,
            enabled_features: row.enabled_features,
            created_at: row.created_at,
            updated_at: row.updated_at
          });
        }

        logger.info(`✅ Loaded ${this.policies.size} user policies`);
      }

      this.initialized = true;
      logger.info(`✅ Policy & Approval Layer initialized`);
    } catch (error) {
      logger.error('Error initializing policy layer:', error);
      throw error;
    }
  }

  /**
   * Get or create policy for user
   */
  async getPolicy(userId) {
    let policy = this.policies.get(userId);

    if (!policy) {
      // Create default policy for new user
      policy = {
        user_id: userId,
        ...this.defaultPolicy,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      this.policies.set(userId, policy);

      if (this.db) {
        await this.db.createPolicy(policy);
      }
    }

    return policy;
  }

  /**
   * Check if operation is allowed under policy
   */
  async checkPolicy(userId, operation, operationCost = 0, details = {}) {
    try {
      const policy = await this.getPolicy(userId);

      const result = {
        allowed: true,
        reason: 'Policy check passed',
        warnings: [],
        requires_approval: false
      };

      // Check if cost exceeds per-operation limit
      if (operationCost > policy.per_operation_limit) {
        result.allowed = false;
        result.reason = `Operation cost ($${operationCost}) exceeds per-operation limit ($${policy.per_operation_limit})`;

        if (this.auditLogs) {
          await this.auditLogs.logPolicyCheck(userId, `operation_cost_limit`, false, result.reason);
        }

        return result;
      }

      // Check if operation requires approval
      if (operationCost > policy.approval_required_above) {
        result.requires_approval = true;
        result.warnings.push(`Operation cost ($${operationCost}) requires approval`);
      }

      // Check if feature is enabled
      const featureName = details.feature;
      if (featureName && policy.enabled_features) {
        const featurePath = featureName.replace(/-/g, '_');
        if (policy.enabled_features[featurePath] === false) {
          result.allowed = false;
          result.reason = `Feature disabled: ${featureName}`;

          if (this.auditLogs) {
            await this.auditLogs.logPolicyCheck(userId, `feature_disabled`, false, result.reason);
          }

          return result;
        }
      }

      if (this.auditLogs) {
        await this.auditLogs.logPolicyCheck(userId, 'operation_allowed', true, 'All checks passed');
      }

      return result;
    } catch (error) {
      logger.error('Error checking policy:', error);
      throw error;
    }
  }

  /**
   * Request approval for operation
   */
  async requestApproval(userId, agentId, operation, operationCost, projectId, details = {}) {
    try {
      const approvalId = `appr-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const approval = {
        id: approvalId,
        user_id: userId,
        agent_id: agentId,
        operation,
        operation_cost: operationCost,
        project_id: projectId,
        status: 'pending', // pending | approved | rejected
        requested_at: new Date().toISOString(),
        approved_at: null,
        approved_by: null,
        reason: details.reason || 'High-cost operation',
        details
      };

      this.approvals.set(approvalId, approval);

      if (this.db) {
        await this.db.createApproval(approval);
      }

      if (this.auditLogs) {
        await this.auditLogs.logApprovalRequired(agentId, operation, `Cost: $${operationCost}`, projectId);
      }

      logger.info(`📋 Approval requested: ${approvalId}`);
      return approval;
    } catch (error) {
      logger.error('Error requesting approval:', error);
      throw error;
    }
  }

  /**
   * Approve an approval request
   */
  async approveRequest(approvalId, approverId) {
    try {
      const approval = this.approvals.get(approvalId);
      if (!approval) {
        throw new Error(`Approval request not found: ${approvalId}`);
      }

      if (approval.status !== 'pending') {
        throw new Error(`Cannot approve non-pending request: ${approvalId}`);
      }

      approval.status = 'approved';
      approval.approved_at = new Date().toISOString();
      approval.approved_by = approverId;

      if (this.db) {
        await this.db.updateApprovalStatus(approvalId, 'approved', approverId);
      }

      if (this.auditLogs) {
        await this.auditLogs.logApprovalDecision(
          approverId,
          approval.agent_id,
          approval.operation,
          true,
          approval.project_id
        );
      }

      logger.info(`✅ Approval granted: ${approvalId}`);
      return approval;
    } catch (error) {
      logger.error('Error approving request:', error);
      throw error;
    }
  }

  /**
   * Reject an approval request
   */
  async rejectRequest(approvalId, approverId, reason) {
    try {
      const approval = this.approvals.get(approvalId);
      if (!approval) {
        throw new Error(`Approval request not found: ${approvalId}`);
      }

      if (approval.status !== 'pending') {
        throw new Error(`Cannot reject non-pending request: ${approvalId}`);
      }

      approval.status = 'rejected';
      approval.approved_at = new Date().toISOString();
      approval.approved_by = approverId;
      approval.rejection_reason = reason;

      if (this.db) {
        await this.db.updateApprovalStatus(approvalId, 'rejected', approverId, reason);
      }

      if (this.auditLogs) {
        await this.auditLogs.logApprovalDecision(
          approverId,
          approval.agent_id,
          approval.operation,
          false,
          approval.project_id
        );
      }

      logger.info(`❌ Approval rejected: ${approvalId}`);
      return approval;
    } catch (error) {
      logger.error('Error rejecting request:', error);
      throw error;
    }
  }

  /**
   * Get approval request status
   */
  getApprovalStatus(approvalId) {
    const approval = this.approvals.get(approvalId);
    if (!approval) {
      return null;
    }

    return {
      id: approval.id,
      status: approval.status,
      operation: approval.operation,
      operation_cost: approval.operation_cost,
      requested_at: approval.requested_at,
      approved_at: approval.approved_at,
      approved_by: approval.approved_by
    };
  }

  /**
   * Get pending approvals for a user
   */
  async getPendingApprovals(userId) {
    try {
      const pending = [];

      for (const [id, approval] of this.approvals.entries()) {
        if (approval.user_id === userId && approval.status === 'pending') {
          pending.push(approval);
        }
      }

      return pending;
    } catch (error) {
      logger.error('Error getting pending approvals:', error);
      throw error;
    }
  }

  /**
   * Update user policy
   */
  async updatePolicy(userId, policyUpdates) {
    try {
      const policy = await this.getPolicy(userId);

      for (const [key, value] of Object.entries(policyUpdates)) {
        if (key in policy && key !== 'user_id') {
          policy[key] = value;
        }
      }

      policy.updated_at = new Date().toISOString();

      if (this.db) {
        await this.db.updatePolicy(userId, policyUpdates);
      }

      logger.info(`✅ Policy updated for user: ${userId}`);
      return policy;
    } catch (error) {
      logger.error('Error updating policy:', error);
      throw error;
    }
  }

  /**
   * Enable/disable feature
   */
  async setFeature(userId, featureName, enabled) {
    try {
      const policy = await this.getPolicy(userId);
      const featurePath = featureName.replace(/-/g, '_');

      if (!policy.enabled_features) {
        policy.enabled_features = {};
      }

      policy.enabled_features[featurePath] = enabled;
      policy.updated_at = new Date().toISOString();

      if (this.db) {
        await this.db.updatePolicyFeatures(userId, policy.enabled_features);
      }

      logger.info(`✅ Feature ${featureName} set to ${enabled} for user: ${userId}`);
      return policy;
    } catch (error) {
      logger.error('Error setting feature:', error);
      throw error;
    }
  }

  /**
   * Check if feature is enabled
   */
  async isFeatureEnabled(userId, featureName) {
    try {
      const policy = await this.getPolicy(userId);
      const featurePath = featureName.replace(/-/g, '_');

      return policy.enabled_features?.[featurePath] !== false; // Default to enabled if not set
    } catch (error) {
      logger.error('Error checking feature:', error);
      throw error;
    }
  }

  /**
   * Get policy statistics
   */
  async getStats() {
    try {
      const stats = {
        total_policies: this.policies.size,
        pending_approvals: 0,
        approved_approvals: 0,
        rejected_approvals: 0
      };

      for (const [id, approval] of this.approvals.entries()) {
        switch (approval.status) {
          case 'pending':
            stats.pending_approvals += 1;
            break;
          case 'approved':
            stats.approved_approvals += 1;
            break;
          case 'rejected':
            stats.rejected_approvals += 1;
            break;
        }
      }

      return stats;
    } catch (error) {
      logger.error('Error getting stats:', error);
      throw error;
    }
  }
}

export { PolicyApprovalLayer };
