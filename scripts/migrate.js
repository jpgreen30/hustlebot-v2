/**
 * DATABASE MIGRATION SCRIPT
 * Creates all necessary Supabase tables for HustleBot
 * 
 * Run with: npm run db:migrate
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import logger from '../src/utils/logger.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function migrate() {
  try {
    logger.info('🚀 Starting database migration...');

    // 1. Create users table
    logger.info('Creating users table...');
    await supabase.rpc('exec', {
      sql: `
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          telegram_id BIGINT UNIQUE NOT NULL,
          telegram_username VARCHAR(255),
          monthly_budget DECIMAL(10, 2) DEFAULT 100.00,
          budget_currency VARCHAR(3) DEFAULT 'USD',
          timezone VARCHAR(50) DEFAULT 'UTC',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
      `
    }).catch(e => {
      // Table might already exist, that's OK
      if (!e.message.includes('already exists')) {
        throw e;
      }
    });

    // 2. Create projects table
    logger.info('Creating projects table...');
    await supabase.rpc('exec', {
      sql: `
        CREATE TABLE IF NOT EXISTS projects (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL REFERENCES users(id),
          type VARCHAR(50) NOT NULL,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          status VARCHAR(50) DEFAULT 'initializing',
          metadata JSONB,
          budget_allocated DECIMAL(10, 4),
          budget_spent DECIMAL(10, 4) DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
        CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
      `
    }).catch(e => {
      if (!e.message.includes('already exists')) throw e;
    });

    // 3. Create leads table
    logger.info('Creating leads table...');
    await supabase.rpc('exec', {
      sql: `
        CREATE TABLE IF NOT EXISTS leads (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          project_id UUID NOT NULL REFERENCES projects(id),
          email VARCHAR(255),
          phone VARCHAR(20),
          first_name VARCHAR(100),
          last_name VARCHAR(100),
          company VARCHAR(255),
          title VARCHAR(255),
          location VARCHAR(255),
          icp_score DECIMAL(3, 1),
          quality_score DECIMAL(3, 1),
          intent_signal VARCHAR(255),
          source VARCHAR(100),
          enriched_data JSONB,
          created_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_leads_project_id ON leads(project_id);
        CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
        CREATE INDEX IF NOT EXISTS idx_leads_quality_score ON leads(quality_score);
      `
    }).catch(e => {
      if (!e.message.includes('already exists')) throw e;
    });

    // 4. Create transactions (spend tracking) table
    logger.info('Creating transactions table...');
    await supabase.rpc('exec', {
      sql: `
        CREATE TABLE IF NOT EXISTS transactions (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL REFERENCES users(id),
          project_id UUID REFERENCES projects(id),
          amount DECIMAL(10, 4) NOT NULL,
          service VARCHAR(100) NOT NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
        CREATE INDEX IF NOT EXISTS idx_transactions_project_id ON transactions(project_id);
        CREATE INDEX IF NOT EXISTS idx_transactions_service ON transactions(service);
        CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
      `
    }).catch(e => {
      if (!e.message.includes('already exists')) throw e;
    });

    // 5. Create agent_logs table
    logger.info('Creating agent_logs table...');
    await supabase.rpc('exec', {
      sql: `
        CREATE TABLE IF NOT EXISTS agent_logs (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          agent_name VARCHAR(255) NOT NULL,
          project_id UUID REFERENCES projects(id),
          input JSONB,
          output JSONB,
          execution_time_ms INT,
          created_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_agent_logs_project_id ON agent_logs(project_id);
        CREATE INDEX IF NOT EXISTS idx_agent_logs_agent_name ON agent_logs(agent_name);
        CREATE INDEX IF NOT EXISTS idx_agent_logs_created_at ON agent_logs(created_at);
      `
    }).catch(e => {
      if (!e.message.includes('already exists')) throw e;
    });

    // 6. Create memory table
    logger.info('Creating memory table...');
    await supabase.rpc('exec', {
      sql: `
        CREATE TABLE IF NOT EXISTS memory (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL REFERENCES users(id),
          type VARCHAR(100) NOT NULL,
          data JSONB NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_memory_user_id ON memory(user_id);
        CREATE INDEX IF NOT EXISTS idx_memory_type ON memory(type);
      `
    }).catch(e => {
      if (!e.message.includes('already exists')) throw e;
    });

    // 7. Create Phase 1: capabilities table
    logger.info('Creating capabilities table (Phase 1)...');
    await supabase.rpc('exec', {
      sql: `
        CREATE TABLE IF NOT EXISTS capabilities (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          agent_name VARCHAR(255) NOT NULL,
          agent_version VARCHAR(50) NOT NULL,
          tool_name VARCHAR(255) NOT NULL,
          description TEXT,
          input_schema JSONB,
          output_schema JSONB,
          cost_per_call DECIMAL(10, 6),
          rate_limit VARCHAR(100),
          status VARCHAR(50) DEFAULT 'active',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(agent_name, agent_version, tool_name)
        );

        CREATE INDEX IF NOT EXISTS idx_capabilities_agent_name ON capabilities(agent_name);
        CREATE INDEX IF NOT EXISTS idx_capabilities_tool_name ON capabilities(tool_name);
        CREATE INDEX IF NOT EXISTS idx_capabilities_status ON capabilities(status);
      `
    }).catch(e => {
      if (!e.message.includes('already exists')) throw e;
    });

    // 8. Create Phase 1: tools table
    logger.info('Creating tools table (Phase 1)...');
    await supabase.rpc('exec', {
      sql: `
        CREATE TABLE IF NOT EXISTS tools (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name VARCHAR(255) NOT NULL,
          version VARCHAR(50) NOT NULL,
          description TEXT,
          category VARCHAR(100),
          input_schema JSONB,
          output_schema JSONB,
          examples JSONB,
          status VARCHAR(50) DEFAULT 'active',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(name, version)
        );

        CREATE INDEX IF NOT EXISTS idx_tools_name ON tools(name);
        CREATE INDEX IF NOT EXISTS idx_tools_category ON tools(category);
        CREATE INDEX IF NOT EXISTS idx_tools_status ON tools(status);
      `
    }).catch(e => {
      if (!e.message.includes('already exists')) throw e;
    });

    // 9. Create Phase 1: agents table
    logger.info('Creating agents table (Phase 1)...');
    await supabase.rpc('exec', {
      sql: `
        CREATE TABLE IF NOT EXISTS agents (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          version VARCHAR(50) NOT NULL,
          role VARCHAR(100) NOT NULL,
          description TEXT,
          capabilities TEXT[] DEFAULT '{}',
          status VARCHAR(50) DEFAULT 'active',
          max_concurrent_instances INT DEFAULT 1,
          memory_required_mb INT DEFAULT 256,
          timeout_seconds INT DEFAULT 300,
          cost_per_execution DECIMAL(10, 6) DEFAULT 0,
          parameters JSONB,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_agents_role ON agents(role);
        CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
        CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(name);
      `
    }).catch(e => {
      if (!e.message.includes('already exists')) throw e;
    });

    // 10. Create Phase 1: job_state table
    logger.info('Creating job_state table (Phase 1)...');
    await supabase.rpc('exec', {
      sql: `
        CREATE TABLE IF NOT EXISTS job_state (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          queue_name VARCHAR(100) NOT NULL,
          job_id VARCHAR(255) NOT NULL UNIQUE,
          status VARCHAR(50) NOT NULL,
          payload JSONB,
          result JSONB,
          error TEXT,
          attempts INT DEFAULT 0,
          max_attempts INT DEFAULT 3,
          delay INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          completed_at TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_job_state_status ON job_state(status);
        CREATE INDEX IF NOT EXISTS idx_job_state_queue ON job_state(queue_name);
        CREATE INDEX IF NOT EXISTS idx_job_state_created_at ON job_state(created_at);
      `
    }).catch(e => {
      if (!e.message.includes('already exists')) throw e;
    });

    // 11. Create Phase 1: mailbox table
    logger.info('Creating mailbox table (Phase 1)...');
    await supabase.rpc('exec', {
      sql: `
        CREATE TABLE IF NOT EXISTS mailbox (
          id VARCHAR(255) PRIMARY KEY,
          from_agent_id VARCHAR(255),
          to_agent_id VARCHAR(255) NOT NULL,
          message_type VARCHAR(50),
          payload JSONB,
          status VARCHAR(50) DEFAULT 'unread',
          priority VARCHAR(20) DEFAULT 'normal',
          reply_to VARCHAR(255),
          created_at TIMESTAMP DEFAULT NOW(),
          read_at TIMESTAMP,
          processed_at TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_mailbox_to_agent ON mailbox(to_agent_id, status);
        CREATE INDEX IF NOT EXISTS idx_mailbox_status ON mailbox(status);
        CREATE INDEX IF NOT EXISTS idx_mailbox_created_at ON mailbox(created_at);
      `
    }).catch(e => {
      if (!e.message.includes('already exists')) throw e;
    });

    // 12. Create Phase 1: audit_logs table (immutable)
    logger.info('Creating audit_logs table (Phase 1)...');
    await supabase.rpc('exec', {
      sql: `
        CREATE FUNCTION IF NOT EXISTS raise_immutable_error() RETURNS TRIGGER AS $$
        BEGIN
          RAISE EXCEPTION 'audit_logs table is immutable';
        END;
        $$ LANGUAGE plpgsql;

        CREATE TABLE IF NOT EXISTS audit_logs (
          id VARCHAR(255) PRIMARY KEY,
          timestamp TIMESTAMP DEFAULT NOW(),
          actor_type VARCHAR(50),
          actor_id VARCHAR(255),
          action VARCHAR(100),
          resource_type VARCHAR(100),
          resource_id VARCHAR(255),
          details JSONB,
          created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TRIGGER IF NOT EXISTS audit_logs_immutable
        BEFORE UPDATE OR DELETE ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION raise_immutable_error();

        CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
      `
    }).catch(e => {
      if (!e.message.includes('already exists')) throw e;
    });

    // 13. Create Phase 1: policies table
    logger.info('Creating policies table (Phase 1)...');
    await supabase.rpc('exec', {
      sql: `
        CREATE TABLE IF NOT EXISTS policies (
          user_id UUID PRIMARY KEY REFERENCES users(id),
          monthly_budget DECIMAL(10, 2) DEFAULT 100,
          per_operation_limit DECIMAL(10, 2) DEFAULT 10,
          approval_required_above DECIMAL(10, 2) DEFAULT 5,
          rate_limit_per_minute INT DEFAULT 60,
          enabled_features JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_policies_user_id ON policies(user_id);
      `
    }).catch(e => {
      if (!e.message.includes('already exists')) throw e;
    });

    // 14. Create Phase 1: approvals table
    logger.info('Creating approvals table (Phase 1)...');
    await supabase.rpc('exec', {
      sql: `
        CREATE TABLE IF NOT EXISTS approvals (
          id VARCHAR(255) PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES users(id),
          agent_id VARCHAR(255),
          operation VARCHAR(255),
          operation_cost DECIMAL(10, 6),
          project_id UUID REFERENCES projects(id),
          status VARCHAR(50) DEFAULT 'pending',
          requested_at TIMESTAMP DEFAULT NOW(),
          approved_at TIMESTAMP,
          approved_by VARCHAR(255),
          rejection_reason TEXT,
          details JSONB
        );

        CREATE INDEX IF NOT EXISTS idx_approvals_user_id ON approvals(user_id);
        CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
        CREATE INDEX IF NOT EXISTS idx_approvals_requested_at ON approvals(requested_at);
      `
    }).catch(e => {
      if (!e.message.includes('already exists')) throw e;
    });

    logger.info('✅ Database migration completed successfully!');
    logger.info('');
    logger.info('Phase 0 Tables:');
    logger.info('  • users - Telegram users & budgets');
    logger.info('  • projects - Landing pages, campaigns, stores');
    logger.info('  • leads - Enriched lead data');
    logger.info('  • transactions - Cost tracking');
    logger.info('  • agent_logs - Execution history');
    logger.info('  • memory - Learnings & patterns');
    logger.info('');
    logger.info('Phase 1 Tables:');
    logger.info('  • capabilities - Agent capability registry');
    logger.info('  • tools - Tool definitions');
    logger.info('  • agents - Agent identities');
    logger.info('  • job_state - Job queue state');
    logger.info('  • mailbox - Inter-agent messages');
    logger.info('  • audit_logs - Immutable audit trail');
    logger.info('  • policies - User policies');
    logger.info('  • approvals - Approval requests');

    process.exit(0);
  } catch (error) {
    logger.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
