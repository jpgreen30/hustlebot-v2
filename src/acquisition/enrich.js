/**
 * Provider-independent prospect enrichment.
 *
 * Adds only public data found on the organization's own website.
 * Never fabricates email, phone, employee count, title, or identity.
 * Inferred guesses are tagged as inferred, never verified.
 */

import { normalizeDomain, normalizeEmail, normalizePhone, normalizeSocialUrl, normalizeUrl, normalizeWhitespace } from './normalize.js';
import { extractEmails, extractPhones } from './extract.js';
import logger from '../utils/logger.js';

const CONTACT_PATHS = ['/', '/contact', '/contact-us', '/about', '/about-us'];

export class ProspectEnricher {
  constructor({ scraper } = {}) {
    this.scraper = scraper || null;
  }

  isAvailable() {
    return Boolean(this.scraper && typeof this.scraper.scrape === 'function');
  }

  qualify(prospect, objective = '') {
    const hay = [
      prospect.organizationName,
      prospect.description,
      prospect.category,
      prospect.domain
    ].filter(Boolean).join(' ').toLowerCase();
    const reasons = [];
    const tags = [];
    let score = 0;

    const signals = [
      { re: /affiliate|performance marketing|cpa|media buy/i, tag: 'affiliate', pts: 25 },
      { re: /saas|software|platform|api/i, tag: 'software', pts: 15 },
      { re: /attribution|analytics|tracking/i, tag: 'measurement', pts: 20 },
      { re: /fintech|payment|commerce/i, tag: 'commerce', pts: 10 },
      { re: /agency|network/i, tag: 'agency', pts: 10 }
    ];
    for (const signal of signals) {
      if (signal.re.test(hay) || signal.re.test(objective)) {
        tags.push(signal.tag);
        score += signal.pts;
        reasons.push(`matched public text for ${signal.tag}`);
      }
    }
    if (prospect.contact?.email) {
      score += 15;
      reasons.push('public email present on source page');
    }
    if (prospect.website || prospect.domain) {
      score += 10;
      reasons.push('public website/domain present');
    }

    return {
      score: Math.min(100, score),
      reasons,
      tags: [...new Set(tags)]
    };
  }

  async enrichOne(prospect, options = {}) {
    const started = { ...prospect };
    const additions = [];
    const target = started.website || (started.domain ? `https://${started.domain}` : null);

    if (!this.isAvailable() || !target || options.skipNetwork) {
      return {
        prospect: {
          ...started,
          qualification: this.qualify(started, options.objective)
        },
        enriched: false,
        additions,
        reason: !this.isAvailable() ? 'no enrichment scraper' : (!target ? 'no public website' : 'skipped')
      };
    }

    const pages = [];
    for (const path of CONTACT_PATHS) {
      const url = path === '/' ? target : new URL(path, target).toString();
      try {
        const scraped = await this.scraper.scrape(url, { timeoutMs: options.timeoutMs || 12000 });
        if (scraped.status === 'ok') pages.push(scraped);
      } catch (error) {
        logger.warn(`enrich scrape failed ${url}: ${error.message}`);
      }
      if (pages.length >= (options.maxPages || 2)) break;
    }

    if (pages.length === 0) {
      return {
        prospect: {
          ...started,
          qualification: this.qualify(started, options.objective)
        },
        enriched: false,
        additions,
        reason: 'no public pages fetched'
      };
    }

    const blob = pages.map((p) => `${p.markdown || ''}\n${p.html || ''}`).join('\n');
    const emails = extractEmails(blob).filter((email) => {
      const domain = normalizeDomain(started.domain || target);
      return !domain || email.endsWith(`@${domain}`) || email.endsWith(`.${domain}`);
    });
    const phones = extractPhones(blob);
    const socials = [];
    for (const page of pages) {
      for (const link of page.links || []) {
        const social = normalizeSocialUrl(link);
        if (social) socials.push(social);
      }
    }

    const next = {
      ...started,
      contact: { ...started.contact },
      company: {
        ...started.company,
        socialUrls: [...(started.company?.socialUrls || [])]
      },
      provenance: {
        ...started.provenance,
        sourceUrls: [...(started.provenance?.sourceUrls || [])]
      }
    };

    if (!next.contact.email && emails[0]) {
      next.contact.email = normalizeEmail(emails[0]);
      additions.push({ field: 'contact.email', source: pages[0].finalUrl || target, verified: false });
    }
    if (!next.contact.phone && phones[0]) {
      next.contact.phone = normalizePhone(phones[0]);
      additions.push({ field: 'contact.phone', source: pages[0].finalUrl || target, verified: false });
    }
    if (!next.description) {
      const desc = normalizeWhitespace(pages[0].metadata?.description);
      if (desc) {
        next.description = desc;
        additions.push({ field: 'description', source: pages[0].finalUrl || target, verified: false });
      }
    }
    for (const social of socials) {
      if (!next.company.socialUrls.includes(social)) {
        next.company.socialUrls.push(social);
        additions.push({ field: 'company.socialUrls', source: social, verified: false });
      }
    }
    if (!next.website) next.website = normalizeUrl(target);
    if (!next.domain) next.domain = normalizeDomain(target);

    next.provenance.sourceUrls = [...new Set([
      ...next.provenance.sourceUrls,
      ...pages.map((p) => p.finalUrl || p.url)
    ])];
    next.provenance.extractionMethod = [
      next.provenance.extractionMethod,
      additions.length ? 'public-web-enrich' : null
    ].filter(Boolean).join('+');
    next.qualification = this.qualify(next, options.objective);

    return {
      prospect: next,
      enriched: additions.length > 0,
      additions,
      reason: additions.length ? 'public website fields added' : 'no additional public fields found'
    };
  }

  async enrich(prospects, options = {}) {
    const out = [];
    let enriched = 0;
    for (const prospect of prospects) {
      const result = await this.enrichOne(prospect, options);
      out.push(result.prospect);
      if (result.enriched) enriched += 1;
    }
    return { prospects: out, enrichedCount: enriched };
  }
}
