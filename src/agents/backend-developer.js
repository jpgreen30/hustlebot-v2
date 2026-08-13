/**
 * BACKEND DEVELOPER AGENT
 * 
 * Generates backend code:
 * - REST APIs (Express, FastAPI)
 * - Endpoints
 * - Middleware
 * - Authentication
 * - Database integration
 * 
 * Uses: Claude 3.5 Sonnet (best for complex code)
 */

import { LLMAgent } from './llm-agent.js';
import logger from '../utils/logger.js';

class BackendDeveloperAgent extends LLMAgent {
  constructor(db, llm, budgetController) {
    super('backend_developer', db, llm, budgetController, {
      defaultTaskType: 'code_generation',
      defaultMaxTokens: 4000,
      defaultTemperature: 0.5
    });

    this.registerTool('generate_api_endpoint', 'Generate API endpoint', {
      type: 'object',
      properties: {
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'] },
        route: { type: 'string' },
        description: { type: 'string' },
        framework: { type: 'string', enum: ['express', 'fastapi', 'next'] }
      },
      required: ['method', 'route', 'description']
    }, this.generateAPIEndpoint);

    this.registerTool('generate_auth_system', 'Generate auth system', {
      type: 'object',
      properties: {
        auth_type: { type: 'string', enum: ['jwt', 'session', 'oauth'] },
        framework: { type: 'string', enum: ['express', 'fastapi'] },
        include_refresh: { type: 'boolean', default: true }
      },
      required: ['auth_type', 'framework']
    }, this.generateAuthSystem);

    this.registerTool('generate_middleware', 'Generate middleware', {
      type: 'object',
      properties: {
        middleware_type: { type: 'string', enum: ['logging', 'auth', 'validation', 'cors', 'error-handling'] },
        framework: { type: 'string', enum: ['express', 'fastapi'] }
      },
      required: ['middleware_type', 'framework']
    }, this.generateMiddleware);
  }

  async getPrompt(taskType, context) {
    return `You are an expert backend developer.

Generate production-ready backend code:
- Proper error handling
- Input validation
- Security best practices
- Efficient database queries
- RESTful principles
- Well-structured and documented

Use the specified framework's best practices.`;
  }

  async generateAPIEndpoint(input) {
    try {
      const {
        method,
        route,
        description,
        framework = 'express'
      } = input;

      const prompt = `Generate a ${method} API endpoint for: ${description}

Route: ${route}
Framework: ${framework}

Requirements:
- Input validation
- Error handling
- Proper status codes
- TypeScript types if applicable
- Database integration ready
- Rate limiting awareness

${framework === 'express' ? `
Export as: export async function ${method.toLowerCase()}${route.replace(/[\/:-]/g, '')}(req, res) { ... }
` : `
Use FastAPI @app.${method.lower()}("${route}") decorator
`}

Return complete, production-ready endpoint code.`;

      const llmResponse = await this.callLLM(prompt, {
        taskType: 'code_generation',
        maxTokens: 2500
      });

      return {
        output: {
          route,
          method,
          code: llmResponse.content,
          framework
        },
        cost: llmResponse.cost,
        service: 'openrouter'
      };
    } catch (error) {
      logger.error('Generate API endpoint failed:', error);
      throw error;
    }
  }

  async generateAuthSystem(input) {
    try {
      const {
        auth_type,
        framework = 'express',
        include_refresh = true
      } = input;

      const prompt = `Generate a complete ${auth_type.toUpperCase()} authentication system for ${framework}.

Type: ${auth_type}
Include refresh tokens: ${include_refresh}

Create:
1. Auth service/helper functions
2. Login endpoint
3. Protected route middleware
4. Token validation
${include_refresh ? '5. Refresh token endpoint' : ''}

Requirements:
- Secure password hashing (bcrypt)
- Proper token generation
- Error handling
- User validation
${auth_type === 'jwt' ? '- Secret key management' : ''}

Return production-ready code.`;

      const llmResponse = await this.callLLM(prompt, {
        taskType: 'code_generation',
        maxTokens: 3500
      });

      return {
        output: {
          auth_type,
          code: llmResponse.content,
          framework,
          has_refresh: include_refresh
        },
        cost: llmResponse.cost,
        service: 'openrouter'
      };
    } catch (error) {
      logger.error('Generate auth system failed:', error);
      throw error;
    }
  }

  async generateMiddleware(input) {
    try {
      const {
        middleware_type,
        framework = 'express'
      } = input;

      const middlewareGuides = {
        logging: 'Log all requests with timestamp, method, route, status',
        auth: 'Check JWT/session and attach user to request',
        validation: 'Validate request body against schema',
        cors: 'Handle CORS headers and preflight requests',
        'error-handling': 'Catch errors and return proper error responses'
      };

      const prompt = `Generate a ${middleware_type} middleware for ${framework}.

Purpose: ${middlewareGuides[middleware_type]}

Create middleware that:
- Properly handles the ${middleware_type} concern
- Follows ${framework} conventions
- Includes error handling
- Is reusable across endpoints

Framework: ${framework}

Return production-ready middleware code.`;

      const llmResponse = await this.callLLM(prompt, {
        taskType: 'code_generation',
        maxTokens: 2000
      });

      return {
        output: {
          middleware_type,
          code: llmResponse.content,
          framework
        },
        cost: llmResponse.cost,
        service: 'openrouter'
      };
    } catch (error) {
      logger.error('Generate middleware failed:', error);
      throw error;
    }
  }
}

export { BackendDeveloperAgent };
