/**
 * FRONTEND DEVELOPER AGENT
 * 
 * Generates frontend code:
 * - React components
 * - Next.js pages
 * - Tailwind CSS
 * - HTML/CSS
 * 
 * Uses: Claude 3.5 Sonnet (best for code)
 */

import { LLMAgent } from './llm-agent.js';
import logger from '../utils/logger.js';

class FrontendDeveloperAgent extends LLMAgent {
  constructor(db, llm, budgetController) {
    super('frontend_developer', db, llm, budgetController, {
      defaultTaskType: 'code_generation',
      defaultMaxTokens: 4000,
      defaultTemperature: 0.5
    });

    this.registerTool('generate_react_component', 'Generate React component', {
      type: 'object',
      properties: {
        component_name: { type: 'string' },
        description: { type: 'string' },
        props: { type: 'array', items: { type: 'string' } },
        styling: { type: 'string', enum: ['tailwind', 'css-modules', 'styled-components'] },
        include_typescript: { type: 'boolean', default: false }
      },
      required: ['component_name', 'description']
    }, this.generateReactComponent);

    this.registerTool('generate_landing_page', 'Generate complete landing page', {
      type: 'object',
      properties: {
        page_title: { type: 'string' },
        sections: { type: 'array', items: { type: 'string' } },
        include_contact_form: { type: 'boolean' },
        include_cta_button: { type: 'boolean' }
      },
      required: ['page_title', 'sections']
    }, this.generateLandingPage);

    this.registerTool('generate_nextjs_page', 'Generate Next.js page', {
      type: 'object',
      properties: {
        route: { type: 'string' },
        description: { type: 'string' },
        include_ssr: { type: 'boolean', default: false },
        include_api: { type: 'boolean', default: false }
      },
      required: ['route', 'description']
    }, this.generateNextJsPage);
  }

  async getPrompt(taskType, context) {
    return `You are an expert React/Frontend developer.

Generate clean, efficient, modern code following best practices:
- Use functional components with hooks
- Use Tailwind CSS for styling when specified
- Include proper TypeScript types when requested
- Add comments for complex logic
- Follow React best practices
- Make components reusable

Return complete, production-ready code.`;
  }

  async generateReactComponent(input) {
    try {
      const {
        component_name,
        description,
        props = [],
        styling = 'tailwind',
        include_typescript = false
      } = input;

      const propsString = props.length > 0 
        ? `Props: ${props.join(', ')}`
        : 'No props';

      const prompt = `Generate a React component for: ${description}

Component name: ${component_name}
${propsString}
Styling: ${styling}
TypeScript: ${include_typescript}

Requirements:
- Modern, clean code
- Responsive design
- Proper component structure
- Include JSDoc comments
- Export the component properly

Return complete, ready-to-use component code.`;

      const llmResponse = await this.callLLM(prompt, {
        taskType: 'code_generation',
        maxTokens: 3000
      });

      return {
        output: {
          component_name,
          code: llmResponse.content,
          language: include_typescript ? 'typescript' : 'javascript',
          styling
        },
        cost: llmResponse.cost,
        service: 'openrouter'
      };
    } catch (error) {
      logger.error('Generate React component failed:', error);
      throw error;
    }
  }

  async generateLandingPage(input) {
    try {
      const {
        page_title,
        sections = ['hero', 'features', 'cta'],
        include_contact_form = true,
        include_cta_button = true
      } = input;

      const prompt = `Generate a complete landing page (React component) for: ${page_title}

Sections: ${sections.join(', ')}
Include contact form: ${include_contact_form}
Include CTA button: ${include_cta_button}

Create a full, responsive landing page with:
- Header with navigation
- Requested sections
- Professional Tailwind styling
- Mobile responsive
- Form if requested
- CTA buttons

Return as a complete React component file ready to use.`;

      const llmResponse = await this.callLLM(prompt, {
        taskType: 'code_generation',
        maxTokens: 5000
      });

      return {
        output: {
          page_title,
          code: llmResponse.content,
          sections,
          has_form: include_contact_form,
          has_cta: include_cta_button
        },
        cost: llmResponse.cost,
        service: 'openrouter'
      };
    } catch (error) {
      logger.error('Generate landing page failed:', error);
      throw error;
    }
  }

  async generateNextJsPage(input) {
    try {
      const {
        route,
        description,
        include_ssr = false,
        include_api = false
      } = input;

      const prompt = `Generate a Next.js page for route: ${route}

Description: ${description}
Include SSR: ${include_ssr}
Include API route: ${include_api}

Create:
1. Page component (${route}/page.js)
${include_ssr ? '2. getServerSideProps for SSR' : '2. Use client-side rendering (use client)'}
${include_api ? '3. API route (${route}/route.js)' : ''}

Use modern Next.js 13+ app directory structure.
Include proper error handling.
Add TypeScript if appropriate.

Return complete, production-ready code.`;

      const llmResponse = await this.callLLM(prompt, {
        taskType: 'code_generation',
        maxTokens: 4000
      });

      return {
        output: {
          route,
          code: llmResponse.content,
          ssr: include_ssr,
          has_api: include_api
        },
        cost: llmResponse.cost,
        service: 'openrouter'
      };
    } catch (error) {
      logger.error('Generate Next.js page failed:', error);
      throw error;
    }
  }
}

export { FrontendDeveloperAgent };
