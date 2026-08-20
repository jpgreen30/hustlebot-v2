/**
 * Public company research. Every field is VERIFIED, INFERRED, or UNKNOWN.
 * Never fabricates identity, employee counts, or contact data.
 */

import * as cheerio from 'cheerio';
import { normalizeDomain, normalizeSocialUrl, normalizeUrl } from '../acquisition/normalize.js';
import { nameFromTitleMatchingHost, preferDisplayName } from '../objective/discover.js';

function field(value, status, source, confidence = status === 'VERIFIED' ? 0.85 : status === 'INFERRED' ? 0.45 : 0) {
  return {
    value: value ?? null,
    status,
    source: source || null,
    confidence
  };
}

function textOf($, selector) {
  return $(selector).first().text().replace(/\s+/g, ' ').trim() || null;
}

function pickMarkdownDescription(markdown) {
  if (!markdown) return null;
  const lines = String(markdown).split('\n').map((line) => line.replace(/\s+/g, ' ').trim());
  return lines.find((line) => {
    if (line.length < 60 || line.length > 400) return false;
    if ((line.match(/ /g) || []).length < 8) return false;
    if (/cookie|privacy policy|sign in|log in|subscribe|scroll down/i.test(line)) return false;
    return true;
  }) || null;
}

export class CompanyResearcher {
  constructor({ scraper, search } = {}) {
    this.scraper = scraper;
    this.search = search;
  }

  isAvailable() {
    return Boolean(this.scraper?.scrape || this.scraper?.fetchPage);
  }

  async research(input = {}) {
    const name = input.organizationName || input.name || null;
    const website = normalizeUrl(input.website || input.domain || null);
    const domain = normalizeDomain(input.domain || website);
    if (!name && !website) {
      return { status: 'failed', error: 'organizationName or website required', intelligence: null };
    }

    const sources = [];
    let page = null;
    if (website && this.scraper?.scrape) {
      page = await this.scraper.scrape(website, { timeout: 15000 });
      if (page.status === 'ok') sources.push(website);
    }

    const html = page?.html || '';
    const markdown = page?.markdown || '';
    const $ = html ? cheerio.load(html) : null;
    const title = $ ? (textOf($, 'title') || textOf($, 'h1')) : null;
    const brand = domain ? String(domain).split('.')[0] : '';
    const titledName = title ? nameFromTitleMatchingHost(title, brand) : null;
    const resolvedName = preferDisplayName(name, titledName) || name || titledName;
    const metaDesc = $
      ? ($('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || null)
      : null;
    const jsonLd = this.readJsonLd($);
    const inferredDesc = pickMarkdownDescription(markdown);

    const description = field(
      input.description || jsonLd.description || metaDesc || inferredDesc,
      input.description ? 'VERIFIED' : (metaDesc || jsonLd.description) ? 'VERIFIED' : inferredDesc ? 'INFERRED' : 'UNKNOWN',
      input.description ? input.sourceUrl : website
    );

    const socials = [];
    if ($) {
      $('a[href]').each((_, el) => {
        const social = normalizeSocialUrl($(el).attr('href'));
        if (social) socials.push(social);
      });
    }
    if (Array.isArray(input.company?.socialUrls)) socials.push(...input.company.socialUrls);

    const contactPage = this.findContactPage($, website);
    const industry = this.inferIndustry(`${resolvedName || ''} ${description.value || ''} ${title || ''}`);

    const intelligence = {
      companyName: field(resolvedName, resolvedName ? 'VERIFIED' : 'UNKNOWN', input.sourceUrl || website),
      domain: field(domain, domain ? 'VERIFIED' : 'UNKNOWN', website),
      website: field(website, website ? 'VERIFIED' : 'UNKNOWN', website),
      description,
      industry: field(industry.value, industry.status, website, industry.confidence),
      location: field(
        input.company?.location || jsonLd.location || null,
        input.company?.location ? 'VERIFIED' : jsonLd.location ? 'VERIFIED' : 'UNKNOWN',
        input.sourceUrl || website
      ),
      products: this.inferList(`${description.value || ''} ${title || ''}`, [
        [/lead/i, 'leads'],
        [/affiliate/i, 'affiliate'],
        [/solar/i, 'solar'],
        [/insurance/i, 'insurance']
      ]),
      targetCustomers: field(null, 'UNKNOWN', null),
      socialProfiles: field([...new Set(socials)].slice(0, 8), socials.length ? 'VERIFIED' : 'UNKNOWN', website),
      publicContactPage: field(contactPage, contactPage ? 'VERIFIED' : 'UNKNOWN', website),
      companySize: field(null, 'UNKNOWN', null),
      classification: field(industry.value, industry.status, website, industry.confidence)
    };

    return {
      status: 'ok',
      organizationName: name,
      domain,
      website,
      intelligence,
      provenance: {
        provider: page?.provider || 'public-web',
        sourceUrls: sources,
        extractionMethod: 'website-meta+jsonld+text'
      }
    };
  }

  readJsonLd($) {
    if (!$) return {};
    const out = {};
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const parsed = JSON.parse($(el).contents().text());
        const nodes = Array.isArray(parsed) ? parsed : [parsed];
        for (const node of nodes) {
          if (node['@type'] === 'Organization' || node['@type'] === 'LocalBusiness') {
            out.description = node.description || out.description;
            out.location = node.address?.addressLocality || node.address?.addressRegion || out.location;
          }
        }
      } catch {
        // ignore malformed json-ld
      }
    });
    return out;
  }

  findContactPage($, website) {
    if (!$ || !website) return null;
    let found = null;
    $('a[href]').each((_, el) => {
      const href = String($(el).attr('href') || '');
      const label = $(el).text().toLowerCase();
      if (/contact|about/i.test(href) || /contact us|about us/i.test(label)) {
        try {
          found = new URL(href, website).toString();
        } catch {
          found = href;
        }
      }
    });
    return found;
  }

  inferIndustry(text) {
    if (/affiliate network|affiliate platform|affiliate marketing/i.test(text)) {
      return { value: 'affiliate-network', status: 'INFERRED', confidence: 0.55 };
    }
    if (/lead generation|lead buyer|pay per lead/i.test(text)) {
      return { value: 'lead-generation', status: 'INFERRED', confidence: 0.55 };
    }
    if (/performance marketing|media buy/i.test(text)) {
      return { value: 'performance-marketing', status: 'INFERRED', confidence: 0.5 };
    }
    if (/\bsolar\b|home service/i.test(text)) {
      return { value: 'home-services', status: 'INFERRED', confidence: 0.5 };
    }
    return { value: null, status: 'UNKNOWN', confidence: 0 };
  }

  inferList(text, rules) {
    const values = [];
    for (const [re, label] of rules) {
      if (re.test(text)) values.push(label);
    }
    return field(values, values.length ? 'INFERRED' : 'UNKNOWN', null, values.length ? 0.4 : 0);
  }
}
