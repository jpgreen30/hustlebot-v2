/**
 * DATABASE ABSTRACTION LAYER
 *
 * Responsibilities:
 * 1. Provide unified interface to Supabase
 * 2. Implement all registry stub methods
 * 3. Handle connection pooling and errors
 * 4. Support transactions for multi-step operations
 */

import { createClient } from '@supabase/supabase-js';
import logger from '../utils/logger.js';

class Database {
  constructor() {
    this.supabase = null;
    this.initialized = false;
  }

  /**
   * Initialize database connection
   */
  async initialize() {
    try {
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_KEY environment variables');
      }

      this.supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_KEY
      );

      // Test connection
      const { data, error } = await this.supabase.from('users').select('count', { count: 'exact' }).limit(0);
      if (error && !error.message.includes('Does not exist')) {
        throw error;
      }

      this.initialized = true;
      logger.info('✅ Database connection established');
    } catch (error) {
      logger.error('Error initializing database:', error);
      throw error;
    }
  }

  // ============ CAPABILITY REGISTRY METHODS ============

  async getAllCapabilities() {
    try {
      const { data, error } = await this.supabase
        .from('capabilities')
        .select('*');

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('Error getting capabilities:', error);
      return [];
    }
  }

  async registerCapability(metadata) {
    try {
      const { data, error } = await this.supabase
        .from('capabilities')
        .insert([metadata])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Error registering capability:', error);
      throw error;
    }
  }

  async updateCapabilityStatus(agentName, agentVersion, toolName, status) {
    try {
      const { error } = await this.supabase
        .from('capabilities')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('agent_name', agentName)
        .eq('agent_version', agentVersion)
        .eq('tool_name', toolName);

      if (error) throw error;
    } catch (error) {
      logger.error('Error updating capability status:', error);
      throw error;
    }
  }

  // ============ TOOL REGISTRY METHODS ============

  async getAllTools() {
    try {
      const { data, error } = await this.supabase
        .from('tools')
        .select('*');

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('Error getting tools:', error);
      return [];
    }
  }

  async registerTool(metadata) {
    try {
      const { data, error } = await this.supabase
        .from('tools')
        .insert([metadata])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Error registering tool:', error);
      throw error;
    }
  }

  async updateToolStatus(toolName, version, status) {
    try {
      const { error } = await this.supabase
        .from('tools')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('name', toolName)
        .eq('version', version);

      if (error) throw error;
    } catch (error) {
      logger.error('Error updating tool status:', error);
      throw error;
    }
  }

  // ============ JOB QUEUE METHODS ============

  async createJob(job) {
    try {
      const { data, error } = await this.supabase
        .from('job_state')
        .insert([job])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Error creating job:', error);
      throw error;
    }
  }

  async getJob(jobId) {
    try {
      const { data, error } = await this.supabase
        .from('job_state')
        .select('*')
        .eq('job_id', jobId)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
      return data || null;
    } catch (error) {
      logger.error('Error getting job:', error);
      return null;
    }
  }

  async updateJob(jobId, updates) {
    try {
      const { error } = await this.supabase
        .from('job_state')
        .update(updates)
        .eq('job_id', jobId);

      if (error) throw error;
    } catch (error) {
      logger.error('Error updating job:', error);
      throw error;
    }
  }

  async deleteJob(jobId) {
    try {
      const { error } = await this.supabase
        .from('job_state')
        .delete()
        .eq('job_id', jobId);

      if (error) throw error;
      return true;
    } catch (error) {
      logger.error('Error deleting job:', error);
      throw error;
    }
  }

  async getPendingJobs() {
    try {
      const { data, error } = await this.supabase
        .from('job_state')
        .select('*')
        .in('status', ['queued', 'started', 'retrying']);

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('Error getting pending jobs:', error);
      return [];
    }
  }

  // ============ AGENT MAILBOX METHODS ============

  async createMessage(message) {
    try {
      const { data, error } = await this.supabase
        .from('mailbox')
        .insert([message])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Error creating message:', error);
      throw error;
    }
  }

  async getMessage(messageId) {
    try {
      const { data, error } = await this.supabase
        .from('mailbox')
        .select('*')
        .eq('id', messageId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error) {
      logger.error('Error getting message:', error);
      return null;
    }
  }

  async updateMessageStatus(messageId, status, timestamp) {
    try {
      const updateData = { status };
      if (status === 'read') {
        updateData.read_at = timestamp;
      } else if (status === 'processed') {
        updateData.processed_at = timestamp;
      }

      const { error } = await this.supabase
        .from('mailbox')
        .update(updateData)
        .eq('id', messageId);

      if (error) throw error;
    } catch (error) {
      logger.error('Error updating message status:', error);
      throw error;
    }
  }

  async deleteMessage(messageId) {
    try {
      const { error } = await this.supabase
        .from('mailbox')
        .delete()
        .eq('id', messageId);

      if (error) throw error;
      return true;
    } catch (error) {
      logger.error('Error deleting message:', error);
      throw error;
    }
  }

  async getUnprocessedMessages() {
    try {
      const { data, error } = await this.supabase
        .from('mailbox')
        .select('*')
        .in('status', ['unread', 'read']);

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('Error getting unprocessed messages:', error);
      return [];
    }
  }

  // ============ AGENT IDENTITIES METHODS ============

  async getAllAgents() {
    try {
      const { data, error } = await this.supabase
        .from('agents')
        .select('*');

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('Error getting agents:', error);
      return [];
    }
  }

  async registerAgent(agent) {
    try {
      const { data, error } = await this.supabase
        .from('agents')
        .insert([agent])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Error registering agent:', error);
      throw error;
    }
  }

  async updateAgentStatus(agentId, status) {
    try {
      const { error } = await this.supabase
        .from('agents')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', agentId);

      if (error) throw error;
    } catch (error) {
      logger.error('Error updating agent status:', error);
      throw error;
    }
  }

  async updateAgentCapabilities(agentId, capabilities) {
    try {
      const { error } = await this.supabase
        .from('agents')
        .update({ capabilities, updated_at: new Date().toISOString() })
        .eq('id', agentId);

      if (error) throw error;
    } catch (error) {
      logger.error('Error updating agent capabilities:', error);
      throw error;
    }
  }

  // ============ AUDIT LOGS METHODS ============

  async bulkCreateAuditLogs(entries) {
    try {
      const { error } = await this.supabase
        .from('audit_logs')
        .insert(entries);

      if (error) throw error;
      return entries.length;
    } catch (error) {
      logger.error('Error bulk creating audit logs:', error);
      return 0;
    }
  }

  async queryAuditLogs(filter = {}) {
    try {
      let query = this.supabase.from('audit_logs').select('*');

      if (filter.actor_type) {
        query = query.eq('actor_type', filter.actor_type);
      }
      if (filter.action) {
        query = query.eq('action', filter.action);
      }
      if (filter.resource_type) {
        query = query.eq('resource_type', filter.resource_type);
      }
      if (filter.resource_id) {
        query = query.eq('resource_id', filter.resource_id);
      }

      const { data, error } = await query.order('timestamp', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('Error querying audit logs:', error);
      return [];
    }
  }

  async getRecentAuditLogs(limit = 100) {
    try {
      const { data, error } = await this.supabase
        .from('audit_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('Error getting recent audit logs:', error);
      return [];
    }
  }

  async deleteOldAuditLogs(olderThanDays) {
    try {
      const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();

      const { data: deletedData, error } = await this.supabase
        .from('audit_logs')
        .delete()
        .lt('timestamp', cutoffDate)
        .select('id');

      if (error) throw error;
      return deletedData?.length || 0;
    } catch (error) {
      logger.error('Error deleting old audit logs:', error);
      return 0;
    }
  }

  // ============ POLICY & APPROVAL METHODS ============

  async getAllPolicies() {
    try {
      const { data, error } = await this.supabase
        .from('policies')
        .select('*');

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('Error getting policies:', error);
      return [];
    }
  }

  async createPolicy(policy) {
    try {
      const { data, error } = await this.supabase
        .from('policies')
        .insert([policy])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Error creating policy:', error);
      throw error;
    }
  }

  async updatePolicy(userId, updates) {
    try {
      const { error } = await this.supabase
        .from('policies')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('user_id', userId);

      if (error) throw error;
    } catch (error) {
      logger.error('Error updating policy:', error);
      throw error;
    }
  }

  async updatePolicyFeatures(userId, enabledFeatures) {
    try {
      const { error } = await this.supabase
        .from('policies')
        .update({ enabled_features: enabledFeatures, updated_at: new Date().toISOString() })
        .eq('user_id', userId);

      if (error) throw error;
    } catch (error) {
      logger.error('Error updating policy features:', error);
      throw error;
    }
  }

  async createApproval(approval) {
    try {
      const { data, error } = await this.supabase
        .from('approvals')
        .insert([approval])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Error creating approval:', error);
      throw error;
    }
  }

  async updateApprovalStatus(approvalId, status, approverId, reason = null) {
    try {
      const updateData = {
        status,
        approved_by: approverId,
        approved_at: new Date().toISOString()
      };

      if (reason) {
        updateData.rejection_reason = reason;
      }

      const { error } = await this.supabase
        .from('approvals')
        .update(updateData)
        .eq('id', approvalId);

      if (error) throw error;
    } catch (error) {
      logger.error('Error updating approval status:', error);
      throw error;
    }
  }

  // ============ BUDGET & TRANSACTION METHODS ============

  async recordSpend(userId, projectId, amount, service, description) {
    try {
      const transaction = {
        user_id: userId,
        project_id: projectId,
        amount,
        service,
        description,
        created_at: new Date().toISOString()
      };

      const { error } = await this.supabase
        .from('transactions')
        .insert([transaction]);

      if (error) throw error;
    } catch (error) {
      logger.error('Error recording spend:', error);
      throw error;
    }
  }

  async getUserBudget(userId) {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('monthly_budget, budget_currency')
        .eq('id', userId)
        .single();

      if (error) throw error;
      return data || { monthly_budget: 100, budget_currency: 'USD' };
    } catch (error) {
      logger.error('Error getting user budget:', error);
      return { monthly_budget: 100, budget_currency: 'USD' };
    }
  }

  async getTotalSpentThisMonth(userId) {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const { data, error } = await this.supabase
        .from('transactions')
        .select('amount')
        .eq('user_id', userId)
        .gte('created_at', startOfMonth);

      if (error) throw error;

      return (data || []).reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);
    } catch (error) {
      logger.error('Error getting total spent:', error);
      return 0;
    }
  }

  async getSpendByService(userId) {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const { data, error } = await this.supabase
        .from('transactions')
        .select('service, amount')
        .eq('user_id', userId)
        .gte('created_at', startOfMonth);

      if (error) throw error;

      const breakdown = {};
      for (const tx of data || []) {
        breakdown[tx.service] = (breakdown[tx.service] || 0) + parseFloat(tx.amount || 0);
      }

      return breakdown;
    } catch (error) {
      logger.error('Error getting spend by service:', error);
      return {};
    }
  }
}

export { Database };
