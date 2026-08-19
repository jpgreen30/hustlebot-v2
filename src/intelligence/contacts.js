/**
 * Public decision-maker discovery.
 * Does not guess names or invent emails.
 */

import * as cheerio from 'cheerio';
import { normalizeEmail, normalizeUrl } from '../acquisition/normalize.js';
import { validateEmail } from './validation.js';

const TITLE_RE = /\b(ceo|founder|co-founder|cmo|cro|cto|vp(?:\s+\w+)?|head of [\w\s]+|director of [\w\s]+|affiliate manager|partnerships|business development|media buyer|lead buyer|chief (?:executive|marketing|revenue|technology|information) officer)\b/i;
const NAME_TITLE_RE = /([A-Z][a-z]+(?:\s[A-Z][a-z'.-]+){1,2})\s*[,–|\-]\s*([^,|]{3,60})/;
const NAME_TITLE_RE_G = new RegExp(NAME_TITLE_RE.source, 'g');
const TITLE_AS_NAME = /\b(chief|officer|founder|director|president|manager|head of|vice president|read bio|team|company)\b/i;

function looksLikePersonName(name) {
  const text = String(name || '').trim();
  if (!text || TITLE_AS_NAME.test(text)) return false;
  const parts = text.split(/\s+/);
  if (parts.length < 2 || parts.length > 3) return false;
  return parts.every((part) => /^[A-Z][a-z'.-]+$/.test(part));
}

function cleanTitle(title) {
  const text = String(title || '').replace(/\s+/g, ' ').replace(/read bio/ig, '').trim();
  if (!text || text.length > 80) return null;
  return text;
}

export class ContactDiscovery {
  constructor({ scraper, search } = {}) {
    this.scraper = scraper;
    this.search = search;
  }

  isAvailable() {
    return Boolean(this.scraper?.scrape);
  }

  async discover(input = {}) {
    const website = normalizeUrl(input.website || input.domain);
    const pages = [];
    if (website) pages.push(website);
    if (input.contactPage) pages.push(normalizeUrl(input.contactPage));
    else if (website) pages.push(new URL('/about', website).toString());

    const contacts = [];
    const errors = [];
    const seen = new Set();

    for (const url of [...new Set(pages.filter(Boolean))].slice(0, 2)) {
      if (!this.scraper?.scrape) break;
      const page = await this.scraper.scrape(url, { timeout: 12000 });
      if (page.status !== 'ok') {
        errors.push({ url, error: page.error || page.status });
        continue;
      }
      for (const person of this.extractFromPage(page, input.organizationName)) {
        const key = `${person.fullName}|${person.title}|${person.email || ''}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        contacts.push(person);
      }
    }

    return {
      status: 'ok',
      organizationName: input.organizationName || null,
      contacts,
      errors,
      fabricated: false
    };
  }

  extractFromPage(page, organization) {
    const people = [];
    const html = page.html || '';
    const $ = html ? cheerio.load(html) : null;
    if ($) {
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const parsed = JSON.parse($(el).contents().text());
          const nodes = Array.isArray(parsed) ? parsed : parsed['@graph'] || [parsed];
          for (const node of nodes) {
            if (node?.['@type'] === 'Person' && looksLikePersonName(node.name)) {
              people.push(this.toContact({
                fullName: node.name,
                title: cleanTitle(node.jobTitle) || node.jobTitle || null,
                email: node.email || null,
                publicProfileUrl: node.url || node.sameAs || null,
                source: page.finalUrl || page.url,
                method: 'json-ld-person'
              }, organization));
            }
          }
        } catch {
          // ignore
        }
      });

      $('[class*="team"], [class*="leadership"], [class*="people"], article, li').each((_, el) => {
        const node = $(el);
        const blob = node.text().replace(/\s+/g, ' ').trim();
        if (blob.length < 8 || blob.length > 180) return;
        const match = blob.match(NAME_TITLE_RE);
        if (!match) return;
        const title = cleanTitle(match[2]);
        if (!title || !TITLE_RE.test(title)) return;
        if (!looksLikePersonName(match[1])) return;
        people.push(this.toContact({
          fullName: match[1].trim(),
          title,
          email: normalizeEmail(blob.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || null),
          source: page.finalUrl || page.url,
          method: 'visible-team-text'
        }, organization));
      });
    }

    const text = page.markdown || ($ ? $.text() : '');
    for (const match of text.matchAll(NAME_TITLE_RE_G)) {
      const title = cleanTitle(match[2]);
      if (!title || !TITLE_RE.test(title)) continue;
      if (!looksLikePersonName(match[1])) continue;
      people.push(this.toContact({
        fullName: match[1].trim(),
        title,
        source: page.finalUrl || page.url,
        method: 'text-pattern'
      }, organization));
    }

    return people.filter((p) => looksLikePersonName(p.fullName) && p.title);
  }

  toContact(raw, organization) {
    const email = raw.email ? validateEmail(raw.email) : validateEmail(null);
    return {
      fullName: raw.fullName,
      title: raw.title,
      organization: organization || null,
      publicProfileUrl: raw.publicProfileUrl || null,
      email: email.value,
      phone: null,
      source: raw.source || null,
      confidence: raw.email ? 0.7 : 0.45,
      verificationStatus: email.status
    };
  }
}
