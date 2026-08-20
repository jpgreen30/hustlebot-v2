/**
 * Extract organizations and public contacts from real page content.
 * Only emits fields that actually appear. No invented emails or names.
 */

import * as cheerio from 'cheerio';
import { createProspect } from './schema.js';
import { normalizeDomain, normalizeEmail, normalizeOrganizationName, normalizePhone, normalizeSocialUrl, normalizeUrl } from './normalize.js';

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/g;
const GENERIC_NAMES = new Set([
  'home', 'about', 'contact', 'exhibitors', 'exhibitor', 'sponsors', 'sponsor',
  'privacy', 'terms', 'login', 'register', 'blog', 'news', 'faq', 'faqs',
  'schedule', 'agenda', 'speakers', 'venue', 'plan your visit', 'attend',
  'networking', 'exhibit', 'meet market', 'affiliate summit', 'affiliate summit west',
  'affiliate summit east'
]);

const GENERIC_NAME_RE = /^(20\d{2}\s+)?(exhibitors?|sponsors?|attend|register|login|about|contact|home|news|blog|faq|faqs|schedule|agenda|speakers?|venue|networking|exhibit|privacy|terms)(\s|$)/i;
const NAV_NOISE_RE = /(brochure|application|convince your boss|delegate pack|sample attendee|speaker application|breakfast briefing|partnership week|meet market|content & commerce|pass application)/i;

function isGenericName(name) {
  if (!name) return true;
  const lower = name.toLowerCase();
  if (GENERIC_NAMES.has(lower)) return true;
  if (GENERIC_NAME_RE.test(name)) return true;
  if (NAV_NOISE_RE.test(name)) return true;
  if (/affiliate summit/i.test(name)) return true;
  if (/livebuzz|clarion-event|moduleid/i.test(name)) return true;
  return false;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function resolveHref(href, base) {
  if (!href) return null;
  try {
    return normalizeUrl(new URL(href, base).toString());
  } catch {
    return normalizeUrl(href);
  }
}

export function extractEmails(text) {
  if (!text) return [];
  const found = String(text).match(EMAIL_RE) || [];
  return unique(found.map(normalizeEmail));
}

export function extractPhones(text) {
  if (!text) return [];
  const found = String(text).match(PHONE_RE) || [];
  return unique(found.map(normalizePhone));
}

function jsonLdBlocks(html) {
  if (!html) return [];
  const $ = cheerio.load(html);
  const blocks = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) blocks.push(...parsed);
      else if (parsed['@graph']) blocks.push(...parsed['@graph']);
      else blocks.push(parsed);
    } catch {
      // ignore broken JSON-LD
    }
  });
  return blocks;
}

function fromJsonLd(block, page) {
  const type = String(block['@type'] || '').toLowerCase();
  if (!/(organization|localbusiness|corporation|exhibitor|company)/.test(type) && !block.name) {
    return null;
  }
  const name = normalizeOrganizationName(block.name);
  if (!name) return null;
  const website = normalizeUrl(block.url);
  return createProspect({
    organizationName: name,
    website,
    domain: normalizeDomain(website || block.url),
    description: block.description || null,
    sourceUrl: page.url,
    sourceType: page.sourceType || 'directory',
    sourceEvent: page.sourceEvent || null,
    contact: {
      email: normalizeEmail(block.email),
      phone: normalizePhone(block.telephone || block.phone),
      fullName: null
    },
    company: {
      industry: block.industry || null,
      location: block.address?.addressLocality
        || [block.address?.addressLocality, block.address?.addressRegion].filter(Boolean).join(', ')
        || null,
      socialUrls: (Array.isArray(block.sameAs) ? block.sameAs : [block.sameAs]).map(normalizeSocialUrl).filter(Boolean)
    },
    provenance: {
      provider: page.provider || null,
      sourceUrls: [page.url],
      extractionMethod: 'json-ld'
    }
  });
}

function cardsFromHtml(html, page) {
  if (!html) return [];
  const $ = cheerio.load(html);
  const prospects = [];

  const selectors = [
    '[class*="exhibitor"]',
    '[class*="sponsor"]',
    '[class*="vendor"]',
    '[class*="partner"]',
    '[data-exhibitor]',
    '#mw-pages li',
    '.mw-category li',
    'a.business-name',
    '[class*="business-name"]',
    '[class*="listing-name"]',
    '.row-listing',
    '.v-card',
    '.srp-listing'
  ];

  const seen = new Set();
  for (const selector of selectors) {
    $(selector).each((_, el) => {
      const node = $(el);
      const heading = normalizeOrganizationName(
        node.find('h1,h2,h3,h4,.name,[class*="name"]').first().text()
        || node.find('a').first().text()
        || node.text()
      );
      if (!heading || isGenericName(heading)) return;
      if (heading.split(' ').length > 12) return;
      const blob = node.text().replace(/\s+/g, ' ').trim();
      if (blob.length > 1200) return;
      const href = resolveHref(
        node.find('a[href]').first().attr('href') || (node.is('a') ? node.attr('href') : null),
        page.url
      );
      const listingSelector = /exhibitor|sponsor|vendor|partner|mw-pages|mw-category|business-name|listing-name|row-listing|v-card|srp-listing/.test(selector);
      if (!listingSelector && !href) return;
      const key = heading.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);

      const emails = extractEmails(blob);
      const phones = extractPhones(blob);
      const socials = [];
      node.find('a[href]').each((__, a) => {
        const social = normalizeSocialUrl(resolveHref($(a).attr('href'), page.url));
        if (social) socials.push(social);
      });

      prospects.push(createProspect({
        organizationName: heading,
        website: href && !hostnameMatches(href, page.url) ? href : null,
        domain: href && !hostnameMatches(href, page.url) ? normalizeDomain(href) : null,
        description: blob.length < 400 ? blob : null,
        sourceUrl: page.url,
        sourceType: page.sourceType || 'directory',
        sourceEvent: page.sourceEvent || null,
        contact: {
          email: emails[0] || null,
          phone: phones[0] || null
        },
        company: { socialUrls: socials },
        provenance: {
          provider: page.provider || null,
          sourceUrls: [page.url],
          extractionMethod: `html:${selector}`
        }
      }));
    });
    if (prospects.length >= 80) break;
  }
  return prospects;
}

function hostnameMatches(a, b) {
  try {
    const ha = new URL(a).hostname.replace(/^www\./, '');
    const hb = new URL(b).hostname.replace(/^www\./, '');
    return ha === hb;
  } catch {
    return false;
  }
}

function fromMarkdownList(markdown, page) {
  if (!markdown) return [];
  const prospects = [];
  const lines = String(markdown).split('\n');
  for (const line of lines) {
    const cleaned = line.replace(/^[-*+\d.)\s]+/, '').trim();
    const link = cleaned.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
    const name = normalizeOrganizationName(link ? link[1] : cleaned.split(' - ')[0]);
    if (!name || isGenericName(name)) continue;
    if (name.split(' ').length > 8) continue;
    if (cleaned.length > 220) continue;
    if (!link && !/exhibitor|sponsor|booth|vendor/i.test(page.metadata?.title || '')) continue;
    prospects.push(createProspect({
      organizationName: name,
      website: link ? normalizeUrl(link[2]) : null,
      domain: link ? normalizeDomain(link[2]) : null,
      sourceUrl: page.url,
      sourceType: page.sourceType || 'directory',
      sourceEvent: page.sourceEvent || null,
      provenance: {
        provider: page.provider || null,
        sourceUrls: [page.url],
        extractionMethod: 'markdown-list'
      }
    }));
  }
  return prospects;
}

export function extractProspectsFromPage(page = {}) {
  const url = page.finalUrl || page.url || page.metadata?.sourceURL;
  const ctx = {
    url,
    provider: page.provider,
    sourceType: page.sourceType,
    sourceEvent: page.sourceEvent,
    metadata: page.metadata
  };

  const fromLd = jsonLdBlocks(page.html).map((block) => fromJsonLd(block, ctx)).filter(Boolean);
  const fromCards = cardsFromHtml(page.html, ctx);
  const fromMd = fromMarkdownList(page.markdown, ctx);

  const emails = extractEmails(`${page.markdown || ''}\n${page.text || ''}\n${page.html || ''}`);
  const phones = extractPhones(`${page.markdown || ''}\n${page.text || ''}`);

  const merged = [...fromLd, ...fromCards, ...fromMd];
  if (merged.length === 0 && page.metadata?.title) {
    const titleName = normalizeOrganizationName(
      String(page.metadata.title).split('|')[0].split('-')[0]
    );
    if (titleName && !isGenericName(titleName)) {
      merged.push(createProspect({
        organizationName: titleName,
        website: url,
        domain: normalizeDomain(url),
        description: page.metadata.description || null,
        sourceUrl: url,
        sourceType: page.sourceType || 'website',
        sourceEvent: page.sourceEvent || null,
        contact: { email: emails[0] || null, phone: phones[0] || null },
        provenance: {
          provider: page.provider || null,
          sourceUrls: [url],
          extractionMethod: 'page-title'
        }
      }));
    }
  }

  if (merged.length === 1) {
    if (!merged[0].contact.email && emails[0]) merged[0].contact.email = emails[0];
    if (!merged[0].contact.phone && phones[0]) merged[0].contact.phone = phones[0];
  }

  return merged.filter((p) => p.organizationName);
}
