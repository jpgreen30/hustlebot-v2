/**
 * Optional Apollo enrichment provider.
 * Official REST (api.apollo.io/api/v1):
 *   GET  /organizations/enrich
 *   POST /mixed_people/api_search   (no emails/phones)
 *   POST /people/match              (credits; may return email)
 * Missing credentials stay UNAVAILABLE. Never fabricates people or emails.
 */

import logger from '../utils/logger.js';

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

function envKey() {
  const key = process.env.APOLLO_API_KEY;
  return key && String(key).trim() ? String(key).trim() : null;
}

function domainOf(value) {
  if (!value) return null;
  return String(value).replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].trim() || null;
}

export class ApolloProvider {
  constructor(config = {}) {
    this.apiKey = config.apiKey === undefined ? envKey() : config.apiKey;
    this.fetchImpl = config.fetchImpl || fetch;
    this.lastError = null;
    this.usage = { requests: 0, search: 0, match: 0, org: 0, credits: 0 };
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
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': this.apiKey,
      Authorization: `Bearer ${this.apiKey}`
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

  async request(method, path, body = null) {
    this.usage.requests += 1;
    const response = await this.fetchImpl(`${APOLLO_BASE}${path}`, {
      method,
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined
    });
    const parsed = await response.json().catch(() => null);
    if (!response.ok) {
      this.lastError = parsed?.error || parsed?.message || `Apollo HTTP ${response.status}`;
      return { ok: false, status: response.status, error: this.lastError, body: parsed };
    }
    return { ok: true, status: response.status, body: parsed };
  }

  async enrich(input = {}) {
    if (!this.apiKey) return this.unavailable('enrich');
    const domain = domainOf(input.domain || input.website || input.prospects?.[0]?.domain);
    if (!domain) {
      return { status: 'failed', provider: 'apollo', error: 'domain required', fabricated: false };
    }
    return this.enrichOrganization(domain);
  }

  async enrichOrganization(domain) {
    if (!this.apiKey) return this.unavailable('organizations/enrich', { domain });
    const clean = domainOf(domain);
    this.usage.org += 1;
    try {
      const result = await this.request('GET', `/organizations/enrich?domain=${encodeURIComponent(clean)}`);
      if (!result.ok) {
        return {
          status: 'failed',
          provider: 'apollo',
          domain: clean,
          error: result.error,
          httpStatus: result.status,
          fabricated: false
        };
      }
      const org = result.body?.organization || result.body;
      if (!org || typeof org !== 'object') {
        return { status: 'empty', provider: 'apollo', domain: clean, fabricated: false };
      }
      return {
        status: 'ok',
        provider: 'apollo',
        domain: clean,
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
      return { status: 'failed', provider: 'apollo', domain: clean, error: error.message, fabricated: false };
    }
  }

  /**
   * People API Search — does NOT return emails or phones.
   */
  async searchPeople(input = {}) {
    if (!this.apiKey) return this.unavailable('mixed_people/api_search');
    const domain = domainOf(input.domain || input.organizationDomain);
    const titles = Array.isArray(input.titles) ? input.titles.filter(Boolean) : [];
    if (!domain && !input.organizationName && !titles.length) {
      return { status: 'failed', provider: 'apollo', error: 'domain or titles required', fabricated: false };
    }
    this.usage.search += 1;
    const body = {
      page: input.page || 1,
      per_page: Math.min(Number(input.perPage || 8), 25)
    };
    if (domain) body.q_organization_domains_list = [domain];
    if (titles.length) body.person_titles = titles;
    if (input.seniorities) body.person_seniorities = input.seniorities;

    try {
      const result = await this.request('POST', '/mixed_people/api_search', body);
      if (!result.ok) {
        return {
          status: result.status === 401 || result.status === 403 ? 'unavailable' : 'failed',
          provider: 'apollo',
          error: result.error,
          httpStatus: result.status,
          people: [],
          fabricated: false
        };
      }
      const people = (result.body?.people || result.body?.contacts || []).map((person) => this.toSearchPerson(person, domain));
      return {
        status: 'ok',
        provider: 'apollo',
        domain,
        people,
        total: result.body?.pagination?.total_entries ?? people.length,
        fabricated: false
      };
    } catch (error) {
      this.lastError = error.message;
      logger.warn(`Apollo people search failed: ${error.message}`);
      return { status: 'failed', provider: 'apollo', error: error.message, people: [], fabricated: false };
    }
  }

  /**
   * People Enrichment. Credits apply when data is found.
   * Does not enable personal-email or phone waterfall unless explicitly requested.
   */
  async enrichPerson(input = {}) {
    if (!this.apiKey) return this.unavailable('people/match');
    const body = {};
    if (input.personId || input.id) body.id = input.personId || input.id;
    if (input.fullName || input.name) body.name = input.fullName || input.name;
    if (input.firstName) body.first_name = input.firstName;
    if (input.lastName) body.last_name = input.lastName;
    if (input.domain) body.domain = domainOf(input.domain);
    if (input.linkedinUrl) body.linkedin_url = input.linkedinUrl;
    if (input.email) body.email = input.email;
    if (input.organizationName) body.organization_name = input.organizationName;
    if (!Object.keys(body).length) {
      return { status: 'failed', provider: 'apollo', error: 'person match requires id, name+domain, or email', fabricated: false };
    }
    this.usage.match += 1;
    try {
      const result = await this.request('POST', '/people/match', body);
      if (!result.ok) {
        return {
          status: 'failed',
          provider: 'apollo',
          error: result.error,
          httpStatus: result.status,
          person: null,
          fabricated: false
        };
      }
      const person = result.body?.person;
      if (!person) {
        return { status: 'empty', provider: 'apollo', person: null, fabricated: false };
      }
      return {
        status: 'ok',
        provider: 'apollo',
        person: this.toEnrichedPerson(person, input.domain),
        fabricated: false
      };
    } catch (error) {
      this.lastError = error.message;
      logger.warn(`Apollo person match failed: ${error.message}`);
      return { status: 'failed', provider: 'apollo', error: error.message, person: null, fabricated: false };
    }
  }

  toSearchPerson(person, domain) {
    return {
      personId: person.id || person.person_id || null,
      providerPersonId: person.id || person.person_id || null,
      fullName: person.name || [person.first_name, person.last_name].filter(Boolean).join(' ') || null,
      title: person.title || person.headline || null,
      organization: person.organization?.name || person.organization_name || null,
      organizationDomain: domain || person.organization?.primary_domain || null,
      publicProfileUrl: person.linkedin_url || null,
      linkedinUrl: person.linkedin_url || null,
      email: null,
      phone: null,
      provider: 'apollo',
      source: 'apollo:mixed_people/api_search',
      confidence: 0.62,
      hasEmailHint: Boolean(person.has_email || person.email_status),
      hasPhoneHint: Boolean(person.has_direct_phone)
    };
  }

  toEnrichedPerson(person, domain) {
    const emailStatus = String(person.email_status || '').toLowerCase();
    return {
      personId: person.id || null,
      providerPersonId: person.id || null,
      fullName: person.name || [person.first_name, person.last_name].filter(Boolean).join(' ') || null,
      title: person.title || null,
      organization: person.organization?.name || person.organization_name || null,
      organizationDomain: domain || person.organization?.primary_domain || null,
      publicProfileUrl: person.linkedin_url || null,
      linkedinUrl: person.linkedin_url || null,
      email: person.email || null,
      phone: person.phone_numbers?.[0]?.sanitized_number || person.phone_number || null,
      emailStatusRaw: person.email_status || null,
      providerVerifiedEmail: emailStatus === 'verified',
      provider: 'apollo',
      source: 'apollo:people/match',
      confidence: emailStatus === 'verified' ? 0.9 : 0.7
    };
  }

  async getHealth() {
    if (!this.apiKey) {
      return { state: 'UNAVAILABLE', detail: 'APOLLO_API_KEY not set' };
    }
    try {
      const result = await this.request('GET', '/auth/health');
      if (result.status === 401 || result.status === 403) {
        return { state: 'MISCONFIGURED', detail: `Apollo auth failed (${result.status})` };
      }
      if (result.ok || result.status === 404) {
        return { state: 'HEALTHY', detail: result.ok ? 'auth health ok' : 'credentials present' };
      }
      return { state: 'DEGRADED', detail: result.error || `HTTP ${result.status}` };
    } catch (error) {
      return { state: 'UNVERIFIED', detail: `credentials present, probe failed: ${error.message}` };
    }
  }
}

export { envKey as apolloEnvKey };
