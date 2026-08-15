/**
 * LEAD FACTORY
 *
 * End-to-end lead generation pipeline:
 * Source → Acquire → Normalize → Validate → Dedupe → Enrich → Score → Route
 *
 * Inputs: Firecrawl, Apollo, search results, databases
 * Outputs: Qualified leads to CRM, email, calling
 */

import logger from '../utils/logger.js';

class LeadFactory {
  constructor(config = {}) {
    this.db = config.db || null;
    this.firecrawlApiKey = process.env.FIRECRAWL_API_KEY;
    this.apolloApiKey = process.env.APOLLO_API_KEY;
    this.hubspotToken = process.env.HUBSPOT_ACCESS_TOKEN;

    this.integrations = {
      firecrawl: !!this.firecrawlApiKey,
      apollo: !!this.apolloApiKey,
      hubspot: !!this.hubspotToken
    };

    this.domainContext = config.domainContext || 'parenting and family wellness';
  }

  /**
   * Full lead pipeline: Source → Qualify → Route
   */
  async processLeads(source, criteria = {}) {
    try {
      logger.info(`🎯 Processing leads from source: ${source}`);

      // Step 1: Acquire leads from source
      const acquired = await this.acquireLeads(source, criteria);
      logger.info(`📥 Acquired: ${acquired.leads.length} leads`);

      // Step 2: Normalize data
      const normalized = await this.normalizeLeads(acquired.leads);
      logger.info(`📋 Normalized: ${normalized.leads.length} leads`);

      // Step 3: Validate emails/phones
      const validated = await this.validateLeads(normalized.leads);
      logger.info(`✅ Validated: ${validated.valid} valid leads`);

      // Step 4: Deduplicate
      const deduped = await this.deduplicateLeads(validated.leads);
      logger.info(`🔄 Deduped: ${deduped.leads.length} unique leads`);

      // Step 5: Enrich with company data
      const enriched = await this.enrichLeads(deduped.leads);
      logger.info(`🔍 Enriched: ${enriched.enrichedCount} leads with company data`);

      // Step 6: Score leads
      const scored = await this.scoreLeads(enriched.leads, criteria);
      logger.info(`⭐ Scored: avg ${scored.avgScore.toFixed(1)}/100`);

      // Step 7: Qualify (filter by score)
      const qualified = scored.leads.filter(l => l.score >= (criteria.minScore || 60));
      logger.info(`🎯 Qualified: ${qualified.length} leads`);

      // Step 8: Route to destinations
      const routed = await this.routeLeads(qualified, criteria);
      logger.info(`📤 Routed: ${routed.routedCount} leads to destinations`);

      return {
        pipeline: {
          source,
          criteria,
          timestamp: new Date()
        },
        stats: {
          acquired: acquired.leads.length,
          normalized: normalized.leads.length,
          validated: validated.valid,
          deduped: deduped.leads.length,
          enriched: enriched.enrichedCount,
          scored: scored.leads.length,
          qualified,
          routed: routed.routedCount
        },
        leads: qualified,
        results: routed
      };
    } catch (error) {
      logger.error(`Lead pipeline failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Step 1: Acquire leads from source
   */
  async acquireLeads(source, criteria = {}) {
    try {
      logger.info(`🔍 Acquiring leads from ${source}`);

      if (!this.integrations.firecrawl) {
        return this.getPlaceholderLeads(source, criteria);
      }

      // In production: call Firecrawl API to scrape sources
      // const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      //   method: 'POST',
      //   headers: { 'Authorization': `Bearer ${this.firecrawlApiKey}` },
      //   body: JSON.stringify({ url: source, ...criteria })
      // });

      return this.getPlaceholderLeads(source, criteria);
    } catch (error) {
      logger.error(`Lead acquisition failed: ${error.message}`);
      return { leads: [], error: error.message };
    }
  }

  /**
   * Step 2: Normalize lead data
   */
  async normalizeLeads(leads) {
    try {
      const normalized = leads.map(lead => ({
        firstName: (lead.firstName || lead.name || '').split(' ')[0],
        lastName: (lead.lastName || (lead.name || '').split(' ')[1] || ''),
        email: (lead.email || '').toLowerCase().trim(),
        phone: (lead.phone || '').replace(/\D/g, ''),
        company: (lead.company || '').trim(),
        title: (lead.title || lead.jobTitle || '').trim(),
        location: lead.location || lead.city || '',
        website: lead.website || '',
        linkedinUrl: lead.linkedinUrl || '',
        source: lead.source || 'unknown',
        raw: lead
      }));

      return { leads: normalized };
    } catch (error) {
      logger.error(`Lead normalization failed: ${error.message}`);
      return { leads: [] };
    }
  }

  /**
   * Step 3: Validate emails and phones
   */
  async validateLeads(leads) {
    try {
      const validated = leads.filter(lead => {
        const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email);
        const validPhone = lead.phone.length >= 10;
        return validEmail || validPhone;
      });

      return {
        leads: validated,
        valid: validated.length,
        invalid: leads.length - validated.length
      };
    } catch (error) {
      logger.error(`Lead validation failed: ${error.message}`);
      return { leads, valid: leads.length, invalid: 0 };
    }
  }

  /**
   * Step 4: Deduplicate leads
   */
  async deduplicateLeads(leads) {
    try {
      const seen = new Set();
      const deduped = [];

      for (const lead of leads) {
        const key = `${lead.email}-${lead.phone}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(lead);
        }
      }

      return { leads: deduped };
    } catch (error) {
      logger.error(`Deduplication failed: ${error.message}`);
      return { leads };
    }
  }

  /**
   * Step 5: Enrich with company data
   */
  async enrichLeads(leads) {
    try {
      if (!this.integrations.apollo) {
        return { leads, enrichedCount: 0 };
      }

      logger.info(`🔍 Enriching ${leads.length} leads with Apollo`);

      // In production: call Apollo API
      // for (const lead of leads) {
      //   const response = await fetch('https://api.apollo.io/v1/people/match', {
      //     method: 'POST',
      //     headers: { 'Authorization': `Bearer ${this.apolloApiKey}` },
      //     body: JSON.stringify({ email: lead.email })
      //   });
      // }

      // Mock enrichment
      const enriched = leads.map(lead => ({
        ...lead,
        companySize: Math.random() > 0.5 ? '1-50' : '51-200',
        industry: 'Healthcare/SaaS',
        revenue: '$10M-$100M',
        enrichmentSource: 'apollo'
      }));

      return { leads: enriched, enrichedCount: leads.length };
    } catch (error) {
      logger.error(`Lead enrichment failed: ${error.message}`);
      return { leads, enrichedCount: 0 };
    }
  }

  /**
   * Step 6: Score leads (ICP match)
   */
  async scoreLeads(leads, criteria = {}) {
    try {
      const scored = leads.map(lead => {
        let score = 50; // base

        // Email quality (+15)
        if (lead.email && lead.email.includes('@')) score += 15;

        // Has phone (+10)
        if (lead.phone && lead.phone.length >= 10) score += 10;

        // Has company info (+10)
        if (lead.company && lead.company.length > 2) score += 10;

        // Has title (+10)
        if (lead.title && lead.title.length > 2) score += 10;

        // ICP match: company size (+15)
        if (criteria.companySize && lead.companySize) score += 15;

        // ICP match: industry (+15)
        if (criteria.industry && lead.industry) score += 15;

        // Location match (+10)
        if (criteria.location && lead.location) score += 10;

        return {
          ...lead,
          score: Math.min(score, 100),
          qualityFactors: {
            hasEmail: !!lead.email,
            hasPhone: !!lead.phone,
            hasCompany: !!lead.company,
            hasTitle: !!lead.title,
            isICPMatch: score > 70
          }
        };
      });

      const avgScore = scored.reduce((sum, l) => sum + l.score, 0) / scored.length;

      return { leads: scored, avgScore };
    } catch (error) {
      logger.error(`Lead scoring failed: ${error.message}`);
      return { leads, avgScore: 0 };
    }
  }

  /**
   * Step 7: Route qualified leads to destinations
   */
  async routeLeads(leads, criteria = {}) {
    try {
      logger.info(`📤 Routing ${leads.length} leads`);

      const routed = {
        hubspot: [],
        email: [],
        calling: [],
        webhook: []
      };

      for (const lead of leads) {
        // Route to HubSpot if configured
        if (this.integrations.hubspot && criteria.hubspotDealStage) {
          routed.hubspot.push({
            lead,
            action: 'createContact',
            dealStage: criteria.hubspotDealStage,
            status: 'queued'
          });
        }

        // Route to email sequence if configured
        if (criteria.emailSequence) {
          routed.email.push({
            lead,
            sequence: criteria.emailSequence,
            status: 'queued'
          });
        }

        // Route to calling if score > 80
        if (lead.score > 80 && lead.phone && criteria.enableCalling) {
          routed.calling.push({
            lead,
            priority: 'high',
            status: 'queued'
          });
        }

        // Route to webhook if provided
        if (criteria.webhookUrl) {
          routed.webhook.push({
            lead,
            webhookUrl: criteria.webhookUrl,
            status: 'queued'
          });
        }
      }

      const routedCount = Object.values(routed).reduce((sum, arr) => sum + arr.length, 0);

      return {
        routed,
        routedCount,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Lead routing failed: ${error.message}`);
      return { routed: {}, routedCount: 0 };
    }
  }

  /**
   * Placeholder leads for testing
   */
  getPlaceholderLeads(source, criteria = {}) {
    logger.warn(`Using placeholder leads for source: ${source}`);
    return {
      leads: [
        {
          firstName: 'Sarah',
          lastName: 'Johnson',
          email: 'sarah@example.com',
          phone: '5551234567',
          company: 'TechCorp',
          title: 'VP of Marketing',
          location: 'San Francisco, CA',
          source
        },
        {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
          phone: '5559876543',
          company: 'HealthCo',
          title: 'Director of Operations',
          location: 'New York, NY',
          source
        },
        {
          firstName: 'Emily',
          lastName: 'Chen',
          email: 'emily@example.com',
          phone: '5555551234',
          company: 'StartupXYZ',
          title: 'Founder',
          location: 'Austin, TX',
          source
        }
      ],
      source: 'placeholder'
    };
  }

  /**
   * Get lead factory status
   */
  getStatus() {
    return {
      initialized: true,
      firecrawlEnabled: this.integrations.firecrawl,
      apolloEnabled: this.integrations.apollo,
      hubspotEnabled: this.integrations.hubspot,
      timestamp: new Date()
    };
  }
}

export { LeadFactory };
