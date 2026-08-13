/**
 * SUPABASE DATABASE LAYER
 * 
 * Handles all database operations:
 * - Projects (landing pages, lead gen campaigns, etc)
 * - Users (Telegram users, budgets, API keys)
 * - Leads (enriched lead data)
 * - Transactions (spend tracking)
 * - Agent logs (execution history)
 * - Memory (Mem0 storage)
 */

import { createClient } from '@supabase/supabase-js';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

class SupabaseDB {
  constructor(client) {
    this.client = client;
  }

  /**
   * ======================== USER MANAGEMENT ========================
   */

  async getOrCreateUser(telegramId, telegramUsername) {
    try {
      // Check if user exists
      let { data: user, error: fetchError } = await this.client
        .from('users')
        .select('*')
        .eq('telegram_id', telegramId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      // Create if doesn't exist
      if (!user) {
        logger.info(`Creating new user: ${telegramUsername}`);
        const { data: newUser, error: createError } = await this.client
          .from('users')
          .insert([
            {
              id: uuidv4(),
              telegram_id: telegramId,
              telegram_username: telegramUsername,
              monthly_budget: 100,
              budget_currency: 'USD',
              timezone: 'UTC',
              created_at: new Date().toISOString()
            }
          ])
          .select()
          .single();

        if (createError) throw createError;
        return newUser;
      }

      return user;
    } catch (error) {
      logger.error('Error in getOrCreateUser:', error);
      throw error;
    }
  }

  async getUserBudget(userId) {
    try {
      const { data, error } = await this.client
        .from('users')
        .select('monthly_budget, budget_currency')
        .eq('id', userId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Error in getUserBudget:', error);
      throw error;
    }
  }

  async updateUserBudget(userId, newBudget) {
    try {
      const { data, error } = await this.client
        .from('users')
        .update({ monthly_budget: newBudget })
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Error in updateUserBudget:', error);
      throw error;
    }
  }

  /**
   * ======================== PROJECT MANAGEMENT ========================
   */

  async createProject(userId, projectType, projectData) {
    try {
      const projectId = uuidv4();
      
      const { data, error } = await this.client
        .from('projects')
        .insert([
          {
            id: projectId,
            user_id: userId,
            type: projectType, // 'landing_page', 'lead_gen', 'ecommerce', 'content'
            name: projectData.name,
            description: projectData.description,
            status: 'initializing', // initializing, in_progress, completed, failed
            metadata: projectData.metadata || {},
            budget_allocated: projectData.budget_allocated || 0,
            budget_spent: 0,
            created_at: new Date().toISOString()
          }
        ])
        .select()
        .single();

      if (error) throw error;
      logger.info(`Created project: ${projectId}`);
      return data;
    } catch (error) {
      logger.error('Error in createProject:', error);
      throw error;
    }
  }

  async getProject(projectId) {
    try {
      const { data, error } = await this.client
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Error in getProject:', error);
      throw error;
    }
  }

  async listUserProjects(userId) {
    try {
      const { data, error } = await this.client
        .from('projects')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Error in listUserProjects:', error);
      throw error;
    }
  }

  async updateProjectStatus(projectId, status, metadata = {}) {
    try {
      const { data, error } = await this.client
        .from('projects')
        .update({
          status,
          metadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', projectId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Error in updateProjectStatus:', error);
      throw error;
    }
  }

  /**
   * ======================== SPEND TRACKING ========================
   */

  async recordSpend(userId, projectId, amount, service, description) {
    try {
      const { data, error } = await this.client
        .from('transactions')
        .insert([
          {
            id: uuidv4(),
            user_id: userId,
            project_id: projectId,
            amount,
            service, // 'openrouter', 'replicate', 'firecrawl', etc
            description,
            created_at: new Date().toISOString()
          }
        ])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Error in recordSpend:', error);
      throw error;
    }
  }

  async getTotalSpentThisMonth(userId) {
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const { data, error } = await this.client
        .from('transactions')
        .select('amount')
        .eq('user_id', userId)
        .gte('created_at', monthStart.toISOString());

      if (error) throw error;

      return data.reduce((sum, t) => sum + t.amount, 0);
    } catch (error) {
      logger.error('Error in getTotalSpentThisMonth:', error);
      throw error;
    }
  }

  async getSpendByService(userId, month = new Date()) {
    try {
      const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
      const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);

      const { data, error } = await this.client
        .from('transactions')
        .select('service, amount')
        .eq('user_id', userId)
        .gte('created_at', monthStart.toISOString())
        .lte('created_at', monthEnd.toISOString());

      if (error) throw error;

      const breakdown = {};
      data.forEach(({ service, amount }) => {
        breakdown[service] = (breakdown[service] || 0) + amount;
      });

      return breakdown;
    } catch (error) {
      logger.error('Error in getSpendByService:', error);
      throw error;
    }
  }

  /**
   * ======================== LEAD MANAGEMENT ========================
   */

  async storeLead(projectId, leadData) {
    try {
      const { data, error } = await this.client
        .from('leads')
        .insert([
          {
            id: uuidv4(),
            project_id: projectId,
            email: leadData.email,
            phone: leadData.phone,
            first_name: leadData.first_name,
            last_name: leadData.last_name,
            company: leadData.company,
            title: leadData.title,
            location: leadData.location,
            icp_score: leadData.icp_score || 0,
            quality_score: leadData.quality_score || 0,
            intent_signal: leadData.intent_signal || null,
            source: leadData.source,
            enriched_data: leadData.enriched_data || {},
            created_at: new Date().toISOString()
          }
        ])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Error in storeLead:', error);
      throw error;
    }
  }

  async getProjectLeads(projectId, limit = 100, offset = 0) {
    try {
      const { data, error } = await this.client
        .from('leads')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Error in getProjectLeads:', error);
      throw error;
    }
  }

  /**
   * ======================== AGENT LOGS ========================
   */

  async logAgentExecution(agentName, projectId, input, output, executionTime) {
    try {
      const { data, error } = await this.client
        .from('agent_logs')
        .insert([
          {
            id: uuidv4(),
            agent_name: agentName,
            project_id: projectId,
            input,
            output,
            execution_time_ms: executionTime,
            created_at: new Date().toISOString()
          }
        ])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Error in logAgentExecution:', error);
      throw error;
    }
  }

  /**
   * ======================== MEMORY / LEARNINGS ========================
   */

  async storeMemory(userId, memoryType, data) {
    try {
      const { data: result, error } = await this.client
        .from('memory')
        .insert([
          {
            id: uuidv4(),
            user_id: userId,
            type: memoryType, // 'successful_pattern', 'failed_pattern', 'user_preference'
            data,
            created_at: new Date().toISOString()
          }
        ])
        .select()
        .single();

      if (error) throw error;
      return result;
    } catch (error) {
      logger.error('Error in storeMemory:', error);
      throw error;
    }
  }

  async getMemoriesByType(userId, memoryType) {
    try {
      const { data, error } = await this.client
        .from('memory')
        .select('*')
        .eq('user_id', userId)
        .eq('type', memoryType)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Error in getMemoriesByType:', error);
      throw error;
    }
  }
}

/**
 * Initialize Supabase client and return wrapper
 */
export async function initSupabase() {
  try {
    const client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );

    logger.info('Testing Supabase connection...');
    const { data, error } = await client.auth.getSession();

    if (error) {
      logger.warn('Supabase connection test: anonymous mode');
    } else {
      logger.info('✅ Supabase connected successfully');
    }

    return new SupabaseDB(client);
  } catch (error) {
    logger.error('Failed to initialize Supabase:', error);
    throw error;
  }
}

export { SupabaseDB };
