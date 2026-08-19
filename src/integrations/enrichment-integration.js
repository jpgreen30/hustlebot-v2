/**
 * ENRICHMENT INTEGRATION
 *
 * Provider-independent enrichment facade.
 * Clearbit is not used. Missing providers stay unavailable.
 * Production never fabricates company size, titles, emails, or phones.
 */

import logger from '../utils/logger.js';

class EnrichmentIntegration {
  constructor(config = {}) {
    this.apolloApiKey = process.env.APOLLO_API_KEY || null;
    this.clearbitApiKey = process.env.CLEARBIT_API_KEY || null;
    this.publicEnricher = config.publicEnricher || null;
    this.enrichedRecords = new Map();
  }

  isReady() {
    return Boolean(this.publicEnricher || this.apolloApiKey);
  }

  async initialize() {
    logger.info('🔍 Enrichment Integration initialized');
    if (!this.apolloApiKey && !this.clearbitApiKey && !this.publicEnricher) {
      logger.warn('⚠️  No paid enrichment provider configured; public-web enricher may still run');
    }
    return true;
  }

  unavailable(kind, target) {
    return {
      status: 'unavailable',
      kind,
      target,
      reason: 'No enrichment provider is configured; refusing to fabricate firmographics',
      fabricated: false,
      timestamp: new Date()
    };
  }

  async enrichCompany(domain) {
    const value = typeof domain === 'string' ? domain : domain?.domain;
    logger.info(`🏢 Enrich company request for: ${value}`);
    if (this.publicEnricher && value) {
      const result = await this.publicEnricher.enrichOne({
        organizationName: value,
        domain: value,
        website: value.includes('://') ? value : `https://${value}`
      });
      return {
        status: result.enriched ? 'ok' : 'empty',
        domain: value,
        prospect: result.prospect,
        additions: result.additions,
        fabricated: false,
        timestamp: new Date()
      };
    }
    return this.unavailable('company', value);
  }

  async enrichPerson(input) {
    const email = typeof input === 'string' ? input : input?.email;
    logger.info(`👤 Enrich person request for: ${email || 'unknown'}`);
    return this.unavailable('person', email);
  }

  async getCompanyInsights(domain) {
    return this.unavailable('company-insights', domain);
  }

  async getPersonInsights(email) {
    return this.unavailable('person-insights', email);
  }

  async batchEnrichCompanies(domains = []) {
    const results = [];
    for (const domain of domains) {
      results.push(await this.enrichCompany(domain));
    }
    return {
      totalRequested: domains.length,
      totalEnriched: results.filter((r) => r.status === 'ok').length,
      results,
      fabricated: false
    };
  }

  async batchEnrichPeople(emails = []) {
    return {
      totalRequested: emails.length,
      totalEnriched: 0,
      results: emails.map((email) => this.unavailable('person', email)),
      fabricated: false
    };
  }

  async verifyEmail(email) {
    return {
      email,
      status: 'unavailable',
      reason: 'No email-verification provider configured',
      fabricated: false
    };
  }

  async getSimilarCompanies(domain) {
    return this.unavailable('similar-companies', domain);
  }

  async calculateICPScore(companyData, icpCriteria) {
    let score = 0;
    const reasons = [];
    if (icpCriteria?.employeeRange && companyData?.employees != null) {
      if (companyData.employees >= icpCriteria.employeeRange[0] &&
          companyData.employees <= icpCriteria.employeeRange[1]) {
        score += 25;
        reasons.push('employee range matched provided data');
      }
    }
    if (icpCriteria?.industries && companyData?.industry &&
        icpCriteria.industries.includes(companyData.industry)) {
      score += 25;
      reasons.push('industry matched provided data');
    }
    return {
      score,
      maxScore: 100,
      reasons,
      fabricated: false,
      timestamp: new Date()
    };
  }

  getStatus() {
    return {
      initialized: true,
      apolloEnabled: Boolean(this.apolloApiKey),
      clearbitEnabled: Boolean(this.clearbitApiKey),
      publicEnricher: Boolean(this.publicEnricher),
      totalEnrichments: this.enrichedRecords.size,
      timestamp: new Date()
    };
  }
}

export { EnrichmentIntegration };
