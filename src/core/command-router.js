/**
 * COMMAND ROUTER
 * 
 * Parses natural language commands and extracts:
 * - Intent (what the user wants to do)
 * - Parameters (specific details)
 * - Vertical (industry/category)
 * - Budget allocation
 */

import logger from '../utils/logger.js';

class CommandRouter {
  constructor(db) {
    this.db = db;

    // Intent patterns for matching
    this.intentPatterns = {
      // Landing page intents
      build_landing_page: [
        'build.*landing page',
        'create.*landing page',
        'design.*landing page',
        'make.*landing page'
      ],
      
      // Lead generation intents
      get_leads: [
        'get.*leads?',
        'find.*leads?',
        'generate.*leads?',
        'scrape.*leads?',
        'create.*leads?'
      ],
      
      // E-commerce intents
      build_store: [
        'build.*store',
        'create.*store',
        'setup.*store',
        'make.*store',
        'dropshipping'
      ],
      
      // Content intents
      create_content: [
        'write.*blog',
        'create.*content',
        'generate.*content',
        'write.*article'
      ],
      
      // Email intents
      create_email_sequence: [
        'email sequence',
        'email campaign',
        'email automation',
        'autoresponder'
      ],
      
      // Video intents
      create_videos: [
        'make.*video',
        'create.*video',
        'script.*video',
        'tiktok'
      ],
      
      // Social intents
      create_social_content: [
        'social media',
        'instagram',
        'twitter',
        'linkedin',
        'facebook'
      ],
      
      // Analytics/Reporting
      get_analytics: [
        'analytics',
        'report',
        'dashboard',
        'performance',
        'metrics'
      ]
    };

    // Vertical patterns
    this.verticalPatterns = {
      personal_loans: ['personal loan', 'personal finance', 'credit'],
      business_loans: ['business loan', 'business finance', 'sme'],
      cryptocurrency: ['crypto', 'bitcoin', 'blockchain', 'defi', 'nft'],
      ecommerce: ['ecommerce', 'shopify', 'products', 'store'],
      saas: ['saas', 'software', 'app', 'subscription'],
      education: ['education', 'course', 'learning', 'training'],
      healthcare: ['healthcare', 'medical', 'health', 'fitness'],
      real_estate: ['real estate', 'property', 'housing'],
      finance: ['finance', 'fintech', 'banking', 'investment'],
      marketing: ['marketing', 'agency', 'marketing agency']
    };
  }

  /**
   * Parse natural language command into structured intent
   */
  async parseCommand(text) {
    try {
      const normalized = text.toLowerCase().trim();

      // Extract intent
      const intent = this.extractIntent(normalized);
      
      // Extract vertical
      const vertical = this.extractVertical(normalized);
      
      // Extract parameters
      const params = this.extractParameters(normalized);

      logger.debug(`Parsed command:`, { intent, vertical, params });

      return {
        raw_text: text,
        intent,
        vertical,
        parameters: params,
        confidence: this.calculateConfidence(intent)
      };
    } catch (error) {
      logger.error('Error parsing command:', error);
      throw error;
    }
  }

  /**
   * Extract intent from text
   */
  extractIntent(text) {
    for (const [intent, patterns] of Object.entries(this.intentPatterns)) {
      for (const pattern of patterns) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(text)) {
          return intent;
        }
      }
    }
    return 'general';
  }

  /**
   * Extract vertical/industry
   */
  extractVertical(text) {
    for (const [vertical, keywords] of Object.entries(this.verticalPatterns)) {
      for (const keyword of keywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (regex.test(text)) {
          return vertical;
        }
      }
    }
    return 'general';
  }

  /**
   * Extract specific parameters from command
   */
  extractParameters(text) {
    const params = {};

    // Quantity (50 leads, 100 images, etc)
    const quantityMatch = text.match(/(\d+)\s*(leads?|images?|products?|posts?|videos?|emails?)/i);
    if (quantityMatch) {
      params.quantity = parseInt(quantityMatch[1]);
      params.quantity_type = quantityMatch[2].toLowerCase();
    }

    // Budget ($20, max $100, budget $50)
    const budgetMatch = text.match(/\$(\d+(?:\.\d{2})?)/);
    if (budgetMatch) {
      params.budget = parseFloat(budgetMatch[1]);
    }

    // Location (California, USA, etc)
    const locationMatch = text.match(/(California|Texas|New York|USA|UK|Canada|Australia|Germany|France|India|Singapore|Australia)/i);
    if (locationMatch) {
      params.location = locationMatch[1];
    }

    // Tone/Style
    if (/professional|formal|corporate/i.test(text)) {
      params.tone = 'professional';
    } else if (/casual|friendly|funny|humorous/i.test(text)) {
      params.tone = 'casual';
    } else if (/luxury|premium|high-end/i.test(text)) {
      params.tone = 'premium';
    }

    // Deadline/Urgency
    if (/asap|urgent|today|immediately|right now|by end of day|by tomorrow/i.test(text)) {
      params.urgency = 'high';
    } else if (/this week|this month|soon/i.test(text)) {
      params.urgency = 'medium';
    }

    // Delivery method
    if (/email|send.*email/i.test(text)) {
      params.delivery = 'email';
    } else if (/webhook|post.*webhook/i.test(text)) {
      params.delivery = 'webhook';
    } else if (/brevo|crm/i.test(text)) {
      params.delivery = 'crm';
    }

    return params;
  }

  /**
   * Calculate confidence score (0-1) of parsed intent
   */
  calculateConfidence(intent) {
    // Direct intent = high confidence
    if (intent !== 'general') {
      return 0.85;
    }
    return 0.6; // General intent = lower confidence
  }

  /**
   * Route command to appropriate agents
   */
  async routeCommand(parsedCommand) {
    const { intent, vertical, parameters } = parsedCommand;

    const route = {
      intent,
      vertical,
      parameters,
      agents: [],
      swarms: []
    };

    // Route based on intent
    switch (intent) {
      case 'build_landing_page':
        route.swarms.push('landing_page_swarm');
        route.agents.push(
          'copywriter',
          'frontend_developer',
          'designer',
          'integration_agent',
          'devops'
        );
        route.estimated_cost = 15 + (parameters.quantity_type === 'components' ? parameters.quantity * 0.5 : 0);
        break;

      case 'get_leads':
        route.swarms.push('lead_gen_swarm');
        route.agents.push(
          'scraper',
          'lead_validator',
          'lead_enricher',
          'lead_scorer',
          'delivery_agent'
        );
        route.estimated_cost = 5 + (parameters.quantity || 50) * 0.1;
        break;

      case 'build_store':
        route.swarms.push('ecommerce_swarm');
        route.agents.push(
          'product_agent',
          'frontend_developer',
          'backend_developer',
          'designer',
          'integration_agent',
          'devops'
        );
        route.estimated_cost = 30 + (parameters.quantity || 50) * 0.2;
        break;

      case 'create_content':
        route.swarms.push('content_swarm');
        route.agents.push(
          'content_writer',
          'seo_optimizer',
          'image_generator',
          'distributor'
        );
        route.estimated_cost = 8 + (parameters.quantity || 5) * 1.5;
        break;

      case 'create_email_sequence':
        route.swarms.push('email_swarm');
        route.agents.push(
          'copywriter',
          'email_designer',
          'integration_agent'
        );
        route.estimated_cost = 3;
        break;

      case 'create_videos':
        route.swarms.push('video_swarm');
        route.agents.push(
          'script_writer',
          'video_producer',
          'image_generator',
          'distributor'
        );
        route.estimated_cost = 10 + (parameters.quantity || 5) * 2;
        break;

      case 'create_social_content':
        route.swarms.push('social_swarm');
        route.agents.push(
          'copywriter',
          'image_generator',
          'distributor'
        );
        route.estimated_cost = 5 + (parameters.quantity || 20) * 0.15;
        break;

      default:
        logger.warn(`Unhandled intent: ${intent}`);
        route.error = 'Intent not recognized';
    }

    return route;
  }

  /**
   * Format command for display
   */
  formatCommandSummary(parsedCommand) {
    const { intent, vertical, parameters } = parsedCommand;

    let summary = `📋 <b>Command Summary</b>\n`;
    summary += `Intent: ${intent}\n`;
    
    if (vertical !== 'general') {
      summary += `Vertical: ${vertical}\n`;
    }

    if (parameters.quantity) {
      summary += `Quantity: ${parameters.quantity} ${parameters.quantity_type}\n`;
    }

    if (parameters.budget) {
      summary += `Budget: $${parameters.budget}\n`;
    }

    if (parameters.location) {
      summary += `Location: ${parameters.location}\n`;
    }

    if (parameters.tone) {
      summary += `Tone: ${parameters.tone}\n`;
    }

    return summary;
  }
}

export { CommandRouter };
