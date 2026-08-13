/**
 * DEVOPS AGENT
 * 
 * Generates DevOps/Infrastructure code:
 * - Docker configurations
 * - Deployment scripts
 * - Environment setup
 * - Monitoring
 * - CI/CD pipelines
 * 
 * Uses: Claude 3.5 Sonnet
 */

import { LLMAgent } from './llm-agent.js';
import logger from '../utils/logger.js';

class DevOpsAgent extends LLMAgent {
  constructor(db, llm, budgetController) {
    super('devops_agent', db, llm, budgetController, {
      defaultTaskType: 'code_generation',
      defaultMaxTokens: 2500,
      defaultTemperature: 0.5
    });

    this.registerTool('generate_dockerfile', 'Generate Dockerfile', {
      type: 'object',
      properties: {
        app_type: { type: 'string', enum: ['node', 'python', 'go', 'java'] },
        description: { type: 'string' }
      },
      required: ['app_type', 'description']
    }, this.generateDockerfile);

    this.registerTool('generate_deployment_script', 'Generate deployment script', {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['render', 'vercel', 'heroku', 'aws', 'digitalocean'] },
        app_type: { type: 'string' }
      },
      required: ['platform', 'app_type']
    }, this.generateDeploymentScript);

    this.registerTool('generate_env_config', 'Generate environment configuration', {
      type: 'object',
      properties: {
        app_type: { type: 'string' },
        environment: { type: 'string', enum: ['development', 'staging', 'production'] }
      },
      required: ['app_type', 'environment']
    }, this.generateEnvConfig);
  }

  async getPrompt(taskType, context) {
    return `You are an expert DevOps engineer.

Generate production-ready infrastructure code:
- Security best practices
- Performance optimization
- Scalability considerations
- Error handling
- Monitoring ready

Follow industry standards and conventions.`;
  }

  async generateDockerfile(input) {
    try {
      const {
        app_type,
        description
      } = input;

      const prompt = `Generate a production-ready Dockerfile for: ${description}

App type: ${app_type}

Requirements:
- Multi-stage build for optimization
- Minimal final image size
- Security best practices
- Proper port exposure
- Health checks
- Non-root user

${app_type === 'node' ? `
- Use Node.js LTS base image
- npm install with proper caching
- npm ci for CI/CD
` : ''}

${app_type === 'python' ? `
- Use Python slim image
- Requirements.txt or Poetry
- Virtual environment
` : ''}

Return complete Dockerfile with comments.`;

      const llmResponse = await this.callLLM(prompt, {
        taskType: 'code_generation',
        maxTokens: 2000
      });

      return {
        output: {
          app_type,
          dockerfile: llmResponse.content
        },
        cost: llmResponse.cost,
        service: 'openrouter'
      };
    } catch (error) {
      logger.error('Generate Dockerfile failed:', error);
      throw error;
    }
  }

  async generateDeploymentScript(input) {
    try {
      const {
        platform,
        app_type
      } = input;

      const prompt = `Generate deployment script/configuration for ${platform}.

App type: ${app_type}

Create:
1. Deployment configuration (${platform}-specific)
2. Environment variable setup
3. Database migration (if applicable)
4. Health checks
5. Rollback procedures

${platform === 'render' ? `
Use render.yaml configuration
Include web service, background worker if needed
` : ''}

${platform === 'vercel' ? `
Use vercel.json
Configure functions and edge middleware
` : ''}

${platform === 'heroku' ? `
Generate Procfile
Include buildpacks configuration
` : ''}

Return complete, production-ready configuration.`;

      const llmResponse = await this.callLLM(prompt, {
        taskType: 'code_generation',
        maxTokens: 2500
      });

      return {
        output: {
          platform,
          app_type,
          deployment_config: llmResponse.content
        },
        cost: llmResponse.cost,
        service: 'openrouter'
      };
    } catch (error) {
      logger.error('Generate deployment script failed:', error);
      throw error;
    }
  }

  async generateEnvConfig(input) {
    try {
      const {
        app_type,
        environment
      } = input;

      const prompt = `Generate environment configuration for ${environment}.

App type: ${app_type}

Create:
1. .env.${environment} file with necessary variables
2. Secrets management guidelines
3. Service credentials
4. Database connection strings
5. API endpoints
6. Logging configuration
7. Performance tuning parameters

${environment === 'production' ? `
- High security standards
- Performance optimized
- Monitoring enabled
- Error reporting
` : environment === 'staging' ? `
- Close to production
- Testing enabled
- Debug logging
` : `
- Local development
- Easy debugging
- Mock services option
`}

Return template with explanations of each variable.`;

      const llmResponse = await this.callLLM(prompt, {
        taskType: 'code_generation',
        maxTokens: 2000
      });

      return {
        output: {
          environment,
          config: llmResponse.content
        },
        cost: llmResponse.cost,
        service: 'openrouter'
      };
    } catch (error) {
      logger.error('Generate env config failed:', error);
      throw error;
    }
  }
}

export { DevOpsAgent };
