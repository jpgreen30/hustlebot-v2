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

    logger.info('✅ Database migration completed successfully!');
    logger.info('');
    logger.info('Tables created:');
    logger.info('  • users - Telegram users & budgets');
    logger.info('  • projects - Landing pages, campaigns, stores');
    logger.info('  • leads - Enriched lead data');
    logger.info('  • transactions - Cost tracking');
    logger.info('  • agent_logs - Execution history');
    logger.info('  • memory - Learnings & patterns');

    process.exit(0);
  } catch (error) {
    logger.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
