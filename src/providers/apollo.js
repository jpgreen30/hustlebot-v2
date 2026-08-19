/**
 * Optional Apollo enrichment provider.
 * Official REST contract (api.apollo.io/api/v1) with X-Api-Key.
 * Missing credentials stay UNAVAILABLE. Never fabricates people or emails.
 */

import logger from '../utils/logger.js';

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

function envKey() {
  const key = process.env.APOLLO_API_KEY;
  return key && String(key).trim() ? String(key).trim() : null;
}

export class ApolloProvider {
  constructor(config = {}) {
    this.apiKey = config.apiKey || envKey();
    this.fetchImpl = config.fetchImpl || fetch;
    this.lastError = null;
    this.usage = { requests: 0, credits: 0 };
  }

  isAvailable() {
    return Boolean(this.apiKey);
  }

  isReady() {
    return this.isAvailable();
  }

  headers() {
    return {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': this.apiKey
    };
  }

  unavailable(operation, extra = {}) {
    return {
      status: 'unavailable',
      provider: 'apollo',
      operation,
      reason: 'APOLLO_API_KEY not configured',
      fabricated: false,
      ...extra
    };
  }

  async enrich(input = {}) {
    if (!this.apiKey) return this.unavailable('enrich');
    const domain = input.domain || input.website || input.prospects?.[0]?.domain;
    if (!domain) {
      return { status: 'failed', provider: 'apollo', error: 'domain required', fabricated: false };
    }
    return this.enrichOrganization(domain);
  }

  async enrichOrganization(domain) {
    if (!this.apiKey) return this.unavailable('organizations/enrich', { domain });
    this.usage.requests += 1;
    try {
      const url = `${APOLLO_BASE}/organizations/enrich?domain=${encodeURIComponent(String(domain).replace(/^https?:\/\//, '').split('/')[0])}`;
      const response = await this.fetchImpl(url, { method: 'GET', headers: this.headers() });
      const parsed = await response.json().catch(() => null);
      if (!response.ok) {
        this.lastError = parsed?.error || parsed?.message || `Apollo HTTP ${response.status}`;
        return {
          status: 'failed',
          provider: 'apollo',
          domain,
          error: this.lastError,
          httpStatus: response.status,
          fabricated: false
        };
      }
      const org = parsed?.organization || parsed;
      if (!org || typeof org !== 'object') {
        return { status: 'empty', provider: 'apollo', domain, fabricated: false };
      }
      return {
        status: 'ok',
        provider: 'apollo',
        domain,
        organization: {
          name: org.name || null,
          website: org.website_url || org.primary_domain || null,
          industry: org.industry || null,
          estimatedNumEmployees: org.estimated_num_employees ?? null,
          shortDescription: org.short_description || org.seo_description || null,
          linkedinUrl: org.linkedin_url || null
        },
        fabricated: false
      };
    } catch (error) {
      this.lastError = error.message;
      logger.warn(`Apollo enrich failed: ${error.message}`);
      return { status: 'failed', provider: 'apollo', domain, error: error.message, fabricated: false };
    }
  }

  async getHealth() {
    if (!this.apiKey) {
      return { state: 'UNAVAILABLE', detail: 'APOLLO_API_KEY not set' };
    }
    return { state: 'UNVERIFIED', detail: 'credentials present, not probed on every health check' };
  }
}

export { envKey as apolloEnvKey };
