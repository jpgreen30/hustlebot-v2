/**
 * Objective-driven public + provider contact discovery.
 * Does not guess names or invent emails.
 */

import * as cheerio from 'cheerio';
import { normalizeEmail, normalizeUrl } from '../acquisition/normalize.js';
import { validateEmail } from './validation.js';
import { createContact } from './contact-schema.js';
import { resolveContacts } from './identity.js';
import { getQualificationProfile, profileTargetRoles } from './profiles.js';
import { roleMatchesTitle } from './contact-score.js';

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

function apolloTitles(roles) {
  return [...new Set((roles || []).flatMap((role) => {
    const text = String(role);
    const alts = text.split('/');
    if (alts.length > 1 && /\s/.test(text)) {
      const rest = text.slice(text.indexOf(' ') + 1);
      return alts.map((part) => `${part.trim()} ${rest}`.replace(/\s+/g, ' ').trim());
    }
    return [text];
  }))].slice(0, 12);
}

export class ContactDiscovery {
  constructor({ scraper, search, apollo, defaultProfileId = 'qentrax-buyer' } = {}) {
    this.scraper = scraper;
    this.search = search;
    this.apollo = apollo || null;
    this.defaultProfileId = defaultProfileId;
  }

  isAvailable() {
    return Boolean(this.scraper?.scrape || this.apollo?.isAvailable?.());
  }

  resolveRoles(input = {}) {
    if (Array.isArray(input.targetRoles) && input.targetRoles.length) {
      return input.targetRoles.filter(Boolean);
    }
    const profileId = input.qualificationProfile || input.profileId || this.defaultProfileId;
    return profileTargetRoles(profileId);
  }

  async discover(input = {}) {
    const organization = input.organization || input.organizationName || null;
    const website = normalizeUrl(input.website || input.domain);
    const objective = input.objective || null;
    const profileId = input.qualificationProfile || input.profileId || this.defaultProfileId;
    const targetRoles = this.resolveRoles(input);
    const pages = [];
    if (website) pages.push(website);
    if (input.contactPage) pages.push(normalizeUrl(input.contactPage));
    else if (website) pages.push(new URL('/about', website).toString());

    const found = [];
    const errors = [];
    const providers = [];

    for (const url of [...new Set(pages.filter(Boolean))].slice(0, 2)) {
      if (!this.scraper?.scrape) break;
      const page = await this.scraper.scrape(url, { timeout: 12000 });
      if (page.status !== 'ok') {
        errors.push({ url, error: page.error || page.status, provider: 'public-web' });
        continue;
      }
      providers.push('public-web');
      for (const person of this.extractFromPage(page, organization)) {
        found.push(person);
      }
    }

    if (this.apollo?.isAvailable?.() && !input.skipApollo) {
      try {
        const search = await this.apollo.searchPeople({
          domain: website,
          organizationName: organization,
          organizationDomain: website,
          titles: apolloTitles(targetRoles)
        });
        providers.push('apollo');
        if (search.status === 'ok') {
          for (const person of search.people || []) {
            found.push(createContact({
              ...person,
              organization: person.organization || organization,
              organizationDomain: person.organizationDomain || website,
              provider: 'apollo',
              source: person.source || 'apollo:mixed_people/api_search',
              email: null,
              phone: null,
              emailStatus: 'UNKNOWN',
              phoneStatus: 'UNKNOWN'
            }));
          }
        } else if (search.status !== 'unavailable') {
          errors.push({ provider: 'apollo', error: search.error || search.status });
        }

        if (input.enrichPeople && search.status === 'ok') {
          const top = (search.people || []).slice(0, Math.min(Number(input.enrichPeople) || 1, 2));
          for (const person of top) {
            const match = await this.apollo.enrichPerson({
              personId: person.personId || person.providerPersonId,
              fullName: person.fullName,
              domain: website,
              organizationName: organization,
              linkedinUrl: person.linkedinUrl
            });
            if (match.status === 'ok' && match.person) {
              found.push(createContact({
                ...match.person,
                organization: match.person.organization || organization,
                provider: 'apollo',
                source: 'apollo:people/match',
                emailStatus: match.person.email
                  ? (match.person.providerVerifiedEmail ? 'VALIDATED' : 'DISCOVERED')
                  : 'UNKNOWN',
                phoneStatus: match.person.phone ? 'DISCOVERED' : 'UNKNOWN',
                verificationStatus: match.person.providerVerifiedEmail ? 'VALIDATED' : 'UNKNOWN'
              }));
            }
          }
        }
      } catch (error) {
        errors.push({ provider: 'apollo', error: error.message });
      }
    }

    const resolved = resolveContacts(found);
    const profile = getQualificationProfile(profileId);
    const contacts = resolved.contacts
      .map((contact) => this.decorateRole(contact, targetRoles, profile))
      .sort((a, b) => (a.roleRank ?? 99) - (b.roleRank ?? 99));

    return {
      status: 'ok',
      organizationName: organization,
      organization,
      objective,
      targetRoles,
      contacts,
      identity: {
        inputCount: resolved.inputCount,
        uniqueCount: resolved.uniqueCount,
        mergedCount: resolved.mergedCount
      },
      providers: [...new Set(providers)],
      errors,
      fabricated: false
    };
  }

  decorateRole(contact, targetRoles, profile) {
    const roles = targetRoles.length ? targetRoles : (profile.targetRoles || []);
    const roleRank = roles.findIndex((role) => roleMatchesTitle(contact.title, role));
    return {
      ...contact,
      roleRank: roleRank === -1 ? 99 : roleRank,
      roleMatch: roleRank === -1 ? null : roles[roleRank]
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
    return createContact({
      fullName: raw.fullName,
      title: raw.title,
      organization: organization || null,
      publicProfileUrl: raw.publicProfileUrl || null,
      email: email.value,
      phone: null,
      emailStatus: email.status,
      phoneStatus: 'UNKNOWN',
      source: raw.source || null,
      provider: 'public-web',
      confidence: raw.email ? 0.7 : 0.45,
      verificationStatus: email.status
    });
  }
}
