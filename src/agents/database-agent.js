/**
 * DATABASE AGENT
 * 
 * Generates database:
 * - Schema design
 * - Migrations
 * - SQL queries
 * - Indexes
 * - Relationships
 * 
 * Uses: Claude 3.5 Sonnet (for complex schema design)
 */

import { LLMAgent } from './llm-agent.js';
import logger from '../utils/logger.js';

class DatabaseAgent extends LLMAgent {
  constructor(db, llm, budgetController) {
    super('database_agent', db, llm, budgetController, {
      defaultTaskType: 'code_generation',
      defaultMaxTokens: 3000,
      defaultTemperature: 0.5
    });

    this.registerTool('design_schema', 'Design database schema', {
      type: 'object',
      properties: {
        database_type: { type: 'string', enum: ['postgresql', 'mysql', 'mongodb'] },
        description: { type: 'string' },
        entities: { type: 'array', items: { type: 'string' } }
      },
      required: ['database_type', 'description']
    }, this.designSchema);

    this.registerTool('generate_migration', 'Generate database migration', {
      type: 'object',
      properties: {
        database_type: { type: 'string', enum: ['postgresql', 'mysql'] },
        migration_name: { type: 'string' },
        changes: { type: 'string', description: 'What changes to make' }
      },
      required: ['database_type', 'migration_name', 'changes']
    }, this.generateMigration);

    this.registerTool('generate_queries', 'Generate optimized SQL queries', {
      type: 'object',
      properties: {
        query_type: { type: 'string', enum: ['select', 'insert', 'update', 'delete', 'aggregate', 'join'] },
        description: { type: 'string' }
      },
      required: ['query_type', 'description']
    }, this.generateQueries);
  }

  async getPrompt(taskType, context) {
    return `You are an expert database architect.

Generate production-ready database code:
- Proper normalization
- Efficient indexing
- Relationship design
- Performance optimization
- Data integrity
- SQL best practices

Follow the specified database's conventions.`;
  }

  async designSchema(input) {
    try {
      const {
        database_type,
        description,
        entities = []
      } = input;

      const entitiesText = entities.length > 0 
        ? `Entities: ${entities.join(', ')}`
        : '';

      const prompt = `Design a database schema for: ${description}

Database: ${database_type}
${entitiesText}

Create:
1. Tables with proper columns
2. Primary keys
3. Foreign keys and relationships
4. Indexes for performance
5. Data types and constraints
6. Consider normalization

${database_type === 'postgresql' ? 'Use PostgreSQL syntax' : ''}
${database_type === 'mysql' ? 'Use MySQL syntax' : ''}

Return complete CREATE TABLE statements with:
- Column definitions
- Constraints
- Indexes
- Comments explaining design decisions`;

      const llmResponse = await this.callLLM(prompt, {
        taskType: 'code_generation',
        maxTokens: 3500
      });

      return {
        output: {
          database_type,
          schema: llmResponse.content,
          entities: entities.length > 0 ? entities : ['Inferred from schema']
        },
        cost: llmResponse.cost,
        service: 'openrouter'
      };
    } catch (error) {
      logger.error('Design schema failed:', error);
      throw error;
    }
  }

  async generateMigration(input) {
    try {
      const {
        database_type,
        migration_name,
        changes
      } = input;

      const prompt = `Generate a database migration for: ${changes}

Database: ${database_type}
Migration name: ${migration_name}

Create both UP and DOWN migrations:
- UP: What to do
- DOWN: How to rollback

Use ${database_type} syntax.
Include proper error handling.
Make it idempotent where possible.

Return migration file content.`;

      const llmResponse = await this.callLLM(prompt, {
        taskType: 'code_generation',
        maxTokens: 2500
      });

      return {
        output: {
          migration_name,
          migration: llmResponse.content,
          database_type
        },
        cost: llmResponse.cost,
        service: 'openrouter'
      };
    } catch (error) {
      logger.error('Generate migration failed:', error);
      throw error;
    }
  }

  async generateQueries(input) {
    try {
      const {
        query_type,
        description
      } = input;

      const prompt = `Generate optimized ${query_type.toUpperCase()} SQL query for: ${description}

Requirements:
- Optimized for performance
- Proper joins if applicable
- Index-friendly
- Include comments
- Handle edge cases
${query_type === 'select' ? '- Use proper WHERE clauses and LIMIT' : ''}
${query_type === 'aggregate' ? '- Use GROUP BY appropriately' : ''}

Return complete, production-ready query.`;

      const llmResponse = await this.callLLM(prompt, {
        taskType: 'code_generation',
        maxTokens: 2000
      });

      return {
        output: {
          query_type,
          query: llmResponse.content
        },
        cost: llmResponse.cost,
        service: 'openrouter'
      };
    } catch (error) {
      logger.error('Generate queries failed:', error);
      throw error;
    }
  }
}

export { DatabaseAgent };
