/**
 * BOOTSTRAP DATA SCRIPT
 *
 * Populates initial data for Phase 1 registries:
 * - Agents (from existing 17 agents)
 * - Capabilities (agent + tool bindings)
 * - Tools (landing page, lead gen, etc.)
 *
 * Run with: npm run bootstrap
 */

import 'dotenv/config';
import { Database } from '../src/core/database.js';
import logger from '../src/utils/logger.js';

// Define the 17 agents (from AGENTS.md catalog)
const AGENTS = [
  // Developer agents (8)
  {
    id: 'dev-react',
    name: 'React Developer',
    version: '1.0',
    role: 'developer',
    description: 'Specializes in React/Next.js frontend development',
    capabilities: ['generate_component', 'optimize_code', 'fix_bug'],
    cost_per_execution: 0.05
  },
  {
    id: 'dev-node',
    name: 'Node Developer',
    version: '1.0',
    role: 'developer',
    description: 'Specializes in Node.js backend development',
    capabilities: ['generate_api', 'optimize_sql', 'design_schema'],
    cost_per_execution: 0.05
  },
  {
    id: 'dev-database',
    name: 'Database Engineer',
    version: '1.0',
    role: 'developer',
    description: 'Database design and optimization',
    capabilities: ['design_schema', 'optimize_sql', 'migrate_data'],
    cost_per_execution: 0.04
  },
  {
    id: 'dev-devops',
    name: 'DevOps Engineer',
    version: '1.0',
    role: 'developer',
    description: 'Infrastructure and deployment automation',
    capabilities: ['setup_deployment', 'monitor_systems', 'configure_ci_cd'],
    cost_per_execution: 0.06
  },
  {
    id: 'dev-security',
    name: 'Security Engineer',
    version: '1.0',
    role: 'developer',
    description: 'Security audit and vulnerability assessment',
    capabilities: ['audit_security', 'fix_vulnerability', 'design_auth'],
    cost_per_execution: 0.08
  },
  {
    id: 'dev-mobile',
    name: 'Mobile Developer',
    version: '1.0',
    role: 'developer',
    description: 'iOS/Android mobile app development',
    capabilities: ['generate_mobile_app', 'optimize_performance', 'fix_ui'],
    cost_per_execution: 0.07
  },
  {
    id: 'dev-qa',
    name: 'QA Engineer',
    version: '1.0',
    role: 'developer',
    description: 'Quality assurance and testing automation',
    capabilities: ['write_tests', 'analyze_coverage', 'find_bugs'],
    cost_per_execution: 0.04
  },
  {
    id: 'dev-fullstack',
    name: 'Fullstack Developer',
    version: '1.0',
    role: 'developer',
    description: 'Full-stack web application development',
    capabilities: ['generate_api', 'generate_component', 'setup_deployment'],
    cost_per_execution: 0.06
  },

  // Strategy agents (9)
  {
    id: 'strategy-market',
    name: 'Market Analyst',
    version: '1.0',
    role: 'strategy',
    description: 'Market research and competitive analysis',
    capabilities: ['analyze_market', 'identify_competitors', 'research_trends'],
    cost_per_execution: 0.05
  },
  {
    id: 'strategy-product',
    name: 'Product Manager',
    version: '1.0',
    role: 'strategy',
    description: 'Product strategy and roadmapping',
    capabilities: ['write_spec', 'prioritize_features', 'analyze_feedback'],
    cost_per_execution: 0.04
  },
  {
    id: 'strategy-sales',
    name: 'Sales Strategist',
    version: '1.0',
    role: 'strategy',
    description: 'Sales process optimization and GTM strategy',
    capabilities: ['optimize_sales', 'create_pitch', 'build_funnel'],
    cost_per_execution: 0.04
  },
  {
    id: 'strategy-marketing',
    name: 'Marketing Strategist',
    version: '1.0',
    role: 'strategy',
    description: 'Marketing campaigns and content strategy',
    capabilities: ['plan_campaign', 'create_content', 'analyze_metrics'],
    cost_per_execution: 0.04
  },
  {
    id: 'strategy-finance',
    name: 'Finance Advisor',
    version: '1.0',
    role: 'strategy',
    description: 'Financial planning and business modeling',
    capabilities: ['create_forecast', 'analyze_cash_flow', 'optimize_budget'],
    cost_per_execution: 0.05
  },
  {
    id: 'strategy-operations',
    name: 'Operations Manager',
    version: '1.0',
    role: 'strategy',
    description: 'Operational efficiency and process optimization',
    capabilities: ['optimize_operations', 'automate_workflow', 'reduce_costs'],
    cost_per_execution: 0.04
  },
  {
    id: 'strategy-hr',
    name: 'HR Specialist',
    version: '1.0',
    role: 'strategy',
    description: 'Human resources and team management',
    capabilities: ['build_team', 'create_culture', 'manage_talent'],
    cost_per_execution: 0.03
  },
  {
    id: 'strategy-legal',
    name: 'Legal Advisor',
    version: '1.0',
    role: 'strategy',
    description: 'Legal compliance and contract review',
    capabilities: ['review_contract', 'ensure_compliance', 'assess_risk'],
    cost_per_execution: 0.08
  },
  {
    id: 'strategy-investor',
    name: 'Investor Relations',
    version: '1.0',
    role: 'strategy',
    description: 'Fundraising and investor management',
    capabilities: ['prepare_pitch', 'manage_investors', 'structure_deal'],
    cost_per_execution: 0.06
  }
];

// Define tools
const TOOLS = [
  {
    name: 'landing_page_builder',
    version: '1.0',
    description: 'Build landing pages with AI',
    category: 'content',
    input_schema: { prompt: 'string', style: 'string' },
    output_schema: { html: 'string', url: 'string' },
    examples: []
  },
  {
    name: 'lead_generator',
    version: '1.0',
    description: 'Generate qualified leads',
    category: 'sales',
    input_schema: { industry: 'string', count: 'number' },
    output_schema: { leads: 'array', count: 'number' },
    examples: []
  },
  {
    name: 'email_campaign',
    version: '1.0',
    description: 'Create and send email campaigns',
    category: 'marketing',
    input_schema: { audience: 'array', subject: 'string', body: 'string' },
    output_schema: { sent: 'number', bounced: 'number' },
    examples: []
  },
  {
    name: 'content_generator',
    version: '1.0',
    description: 'Generate marketing content',
    category: 'content',
    input_schema: { topic: 'string', format: 'string' },
    output_schema: { content: 'string' },
    examples: []
  },
  {
    name: 'image_generator',
    version: '1.0',
    description: 'Generate images from prompts',
    category: 'media',
    input_schema: { prompt: 'string', style: 'string' },
    output_schema: { url: 'string' },
    examples: []
  },
  {
    name: 'video_generator',
    version: '1.0',
    description: 'Generate videos from scripts',
    category: 'media',
    input_schema: { script: 'string', voiceover: 'boolean' },
    output_schema: { url: 'string', duration: 'number' },
    examples: []
  },
  {
    name: 'code_generator',
    version: '1.0',
    description: 'Generate code snippets',
    category: 'development',
    input_schema: { description: 'string', language: 'string' },
    output_schema: { code: 'string', explanation: 'string' },
    examples: []
  },
  {
    name: 'data_analyzer',
    version: '1.0',
    description: 'Analyze data and generate insights',
    category: 'analytics',
    input_schema: { data: 'array', metric: 'string' },
    output_schema: { insights: 'array', recommendation: 'string' },
    examples: []
  }
];

// Define capabilities (agent + tool bindings)
const CAPABILITIES = [
  // Dev + Content
  {
    agent_name: 'React Developer',
    agent_version: '1.0',
    tool_name: 'code_generator',
    description: 'Generate React component code',
    cost_per_call: 0.02,
    rate_limit: '100/minute'
  },
  // Dev + Landing Page
  {
    agent_name: 'Fullstack Developer',
    agent_version: '1.0',
    tool_name: 'landing_page_builder',
    description: 'Build full-featured landing pages',
    cost_per_call: 0.05,
    rate_limit: '10/minute'
  },
  // Strategy + Email
  {
    agent_name: 'Marketing Strategist',
    agent_version: '1.0',
    tool_name: 'email_campaign',
    description: 'Plan and execute email marketing',
    cost_per_call: 0.01,
    rate_limit: '50/minute'
  },
  // Strategy + Leads
  {
    agent_name: 'Sales Strategist',
    agent_version: '1.0',
    tool_name: 'lead_generator',
    description: 'Generate qualified sales leads',
    cost_per_call: 0.10,
    rate_limit: '5/minute'
  },
  // Strategy + Content
  {
    agent_name: 'Marketing Strategist',
    agent_version: '1.0',
    tool_name: 'content_generator',
    description: 'Generate marketing copy and content',
    cost_per_call: 0.02,
    rate_limit: '30/minute'
  },
  // Strategy + Video
  {
    agent_name: 'Marketing Strategist',
    agent_version: '1.0',
    tool_name: 'video_generator',
    description: 'Generate marketing videos',
    cost_per_call: 0.25,
    rate_limit: '2/hour'
  },
  // Developer + Analysis
  {
    agent_name: 'QA Engineer',
    agent_version: '1.0',
    tool_name: 'data_analyzer',
    description: 'Analyze test results and coverage',
    cost_per_call: 0.01,
    rate_limit: '100/minute'
  }
];

async function bootstrap() {
  try {
    logger.info('🌱 Starting bootstrap process...');

    const db = new Database();
    await db.initialize();

    logger.info('📝 Bootstrapping agents...');
    for (const agent of AGENTS) {
      try {
        await db.registerAgent(agent);
        logger.info(`  ✓ Agent registered: ${agent.name}`);
      } catch (error) {
        logger.warn(`  ⚠️  Agent already exists: ${agent.name}`);
      }
    }

    logger.info('🔨 Bootstrapping tools...');
    for (const tool of TOOLS) {
      try {
        await db.registerTool(tool);
        logger.info(`  ✓ Tool registered: ${tool.name}`);
      } catch (error) {
        logger.warn(`  ⚠️  Tool already exists: ${tool.name}`);
      }
    }

    logger.info('🔗 Bootstrapping capabilities...');
    for (const cap of CAPABILITIES) {
      try {
        await db.registerCapability(cap);
        logger.info(`  ✓ Capability registered: ${cap.agent_name} + ${cap.tool_name}`);
      } catch (error) {
        logger.warn(`  ⚠️  Capability already exists: ${cap.agent_name} + ${cap.tool_name}`);
      }
    }

    logger.info('✅ Bootstrap completed successfully!');
    logger.info('');
    logger.info('Summary:');
    logger.info(`  • ${AGENTS.length} agents registered`);
    logger.info(`  • ${TOOLS.length} tools registered`);
    logger.info(`  • ${CAPABILITIES.length} capabilities registered`);

    process.exit(0);
  } catch (error) {
    logger.error('❌ Bootstrap failed:', error);
    process.exit(1);
  }
}

bootstrap();
