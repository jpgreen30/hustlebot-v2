/**
 * Configurable enrichment provider router.
 * Order: PUBLIC_WEB → APOLLO (if configured) → future providers.
 * Never fabricates missing fields.
 */

import logger from '../utils/logger.js';

export const DEFAULT_PROVIDER_ORDER = ['PUBLIC_WEB', 'APOLLO'];

export class EnrichmentRouter {
  constructor({ publicWeb, apollo, order } = {}) {
    this.publicWeb = publicWeb || null;
    this.apollo = apollo || null;
    this.order = order || DEFAULT_PROVIDER_ORDER;
    this.usage = { PUBLIC_WEB: 0, APOLLO: 0 };
  }

  isAvailable() {
    return Boolean(this.publicWeb?.enrich || this.publicWeb?.enrichOne || this.apollo?.isAvailable?.());
  }

  providerStatus() {
    return {
      PUBLIC_WEB: Boolean(this.publicWeb?.enrich || this.publicWeb?.enrichOne),
      APOLLO: this.apollo?.isAvailable?.() ? 'AVAILABLE' : 'UNAVAILABLE'
    };
  }

  async enrich(prospects = [], options = {}) {
    const list = Array.isArray(prospects) ? prospects : [prospects];
    const out = [];
    const providersUsed = [];
    for (const prospect of list) {
      const result = await this.enrichOne(prospect, options);
      out.push(result.prospect);
      providersUsed.push(...result.providers);
    }
    return {
      prospects: out,
      providers: [...new Set(providersUsed)],
      providerStatus: this.providerStatus(),
      usage: { ...this.usage },
      fabricated: false
    };
  }

  async enrichOne(prospect, options = {}) {
    let next = prospect;
    const providers = [];
    const additions = [];

    for (const name of this.order) {
      if (name === 'PUBLIC_WEB' && this.publicWeb && !options.skipPublicWeb) {
        try {
          if (typeof this.publicWeb.enrichOne === 'function') {
            const result = await this.publicWeb.enrichOne(next, options);
            if (result?.prospect) next = result.prospect;
            if (result?.additions) additions.push(...result.additions);
            this.usage.PUBLIC_WEB += 1;
            providers.push('PUBLIC_WEB');
          } else if (typeof this.publicWeb.enrich === 'function') {
            const result = await this.publicWeb.enrich([next], options);
            if (result?.prospects?.[0]) next = result.prospects[0];
            this.usage.PUBLIC_WEB += 1;
            providers.push('PUBLIC_WEB');
          }
        } catch (error) {
          logger.warn(`PUBLIC_WEB enrich failed: ${error.message}`);
        }
      }

      if (name === 'APOLLO' && this.apollo?.isAvailable?.()) {
        try {
          const result = await this.apollo.enrichOrganization(next.domain || next.website);
          this.usage.APOLLO += 1;
          providers.push('APOLLO');
          if (result.status === 'ok' && result.organization) {
            const org = result.organization;
            next = {
              ...next,
              description: next.description || org.shortDescription || null,
              company: {
                ...(next.company || {}),
                industry: next.company?.industry || org.industry || null,
                employeeRange: next.company?.employeeRange || (org.estimatedNumEmployees != null ? String(org.estimatedNumEmployees) : null),
                socialUrls: [
                  ...new Set([...(next.company?.socialUrls || []), org.linkedinUrl].filter(Boolean))
                ]
              },
              provenance: {
                ...(next.provenance || {}),
                sourceUrls: [...new Set([...(next.provenance?.sourceUrls || []), 'apollo:organizations/enrich'])]
              }
            };
            additions.push({ field: 'apollo.organization', source: 'apollo', verified: false });
          }
        } catch (error) {
          logger.warn(`APOLLO enrich failed: ${error.message}`);
        }
      }
    }

    return { prospect: next, providers, additions };
  }
}
