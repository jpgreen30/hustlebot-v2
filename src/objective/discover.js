import { normalizeDomain, normalizeUrl } from '../acquisition/normalize.js';
import { extractProspectsFromPage } from '../acquisition/extract.js';
import { mapLimit } from './util.js';

const AGGREGATOR_HOST = /(^|\.)(yelp|angi|thumbtack|bbb|mapquest|forbes|bing|google|duckduckgo|homeguide|ontoplist|expertise|yellowpages|superpages|manta|hotfrog)\.com$|(^|\.)(roof\.info)$/i;
const JUNK_HOST = /(^|\.)(wikipedia\.org|britannica\.com|latimes\.com|nytimes\.com|washingtonpost\.com|cnn\.com|bbc\.com|merriam-webster\.com|spanishdict\.com|dictionary\.cambridge\.org|collinsdictionary\.com|definitions\.net)$/i;
const WEAK_QUERY_TOKEN = new Set([
  'angeles', 'california', 'united', 'states', 'companies', 'company', 'business',
  'businesses', 'official', 'website', 'south', 'north', 'west', 'east', 'city',
  'area', 'county', 'region', 'service', 'services'
]);

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function isAggregator(url) {
  const host = hostOf(url);
  return !host ? false : AGGREGATOR_HOST.test(host);
}

function isJunkResult(item = {}) {
  const url = item.url || item.website || '';
  const title = item.title || item.organizationName || item.name || '';
  return JUNK_HOST.test(hostOf(url)) || /wikipedia|britannica|dictionary/i.test(title);
}

function looksLikeDirectory(item = {}) {
  if (isAggregator(item.url)) return true;
  const hay = `${item.title || ''} ${item.snippet || ''} ${item.url || ''}`.toLowerCase();
  return /(best |top \d+|directory|companylist|contractors in|list of|near me)/.test(hay);
}

function queryTokens(query) {
  return String(query || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 4);
}

function matchesQuery(item, query) {
  const tokens = queryTokens(query).filter((token) => !WEAK_QUERY_TOKEN.has(token));
  if (!tokens.length) return !isJunkResult(item);
  const hay = `${item.title || ''} ${item.url || ''} ${item.snippet || ''}`.toLowerCase();
  return tokens.some((token) => hay.includes(token));
}

function publicDirectoryUrls(input = {}) {
  const industry = String(input.industry || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!industry || industry.length < 3) return [];
  let city = String(input.location || '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '-')
    .replace(/^-|-$/g, '');
  const blob = `${input.location || ''} ${input.query || ''} ${input.objective || ''}`;
  if (!city && /los angeles|la-area/i.test(blob)) city = 'los-angeles';
  if (city === 'los-angeles' || city === 'la-area' || city === 'la') city = 'los-angeles-ca';
  if (!city) return [];
  return [
    `https://www.yellowpages.com/${city}/${industry}-contractors`,
    `https://www.yellowpages.com/${city}/${industry}`
  ];
}

function scrapePriority(item = {}) {
  const url = String(item.url || '');
  if (/yellowpages\.com\/.+\/.+/i.test(url)) return 100;
  if (/ontoplist\.com/i.test(url)) return 80;
  if (/\/(contractors|companylist|directory)\b/i.test(url)) return 70;
  if (/yelp\.com\/search|forbes\.com|latimes\.com/i.test(url)) return 5;
  return 40;
}

function toProspect(record, sourceUrl, provider) {
  const name = record.organizationName || record.name || record.title || null;
  const website = normalizeUrl(record.website || record.url || record.link || null);
  if (!name && !website) return null;
  if (isJunkResult({ url: website || sourceUrl, title: name })) return null;
  return {
    organizationName: name || website,
    website,
    domain: normalizeDomain(record.domain || website),
    description: record.description || record.snippet || null,
    sourceUrl: record.sourceUrl || sourceUrl || website,
    provenance: { provider, extractionMethod: record.provenance?.extractionMethod || 'org.discover' }
  };
}

function mergeProspects(list, max) {
  const out = [];
  const seen = new Set();
  for (const prospect of list) {
    if (!prospect) continue;
    const key = (prospect.domain || prospect.organizationName || '').toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(prospect);
    if (out.length >= max) break;
  }
  return out;
}

export class OrgDiscovery {
  constructor({ browser, search, spider, acquisition } = {}) {
    this.browser = browser || null;
    this.search = search || null;
    this.spider = spider || null;
    this.acquisition = acquisition || null;
  }

  isAvailable() {
    return Boolean(this.browser?.render || this.search?.search || this.spider?.scrape || this.acquisition?.run);
  }

  async extractFromUrls(urls, { max, providers, errors, forceDown }) {
    const extracted = [];
    const canSpider = this.spider?.scrape && !forceDown.has('custom-spider') && !forceDown.has('spider');
    const canBrowser = this.browser?.render && !forceDown.has('browser');
    for (const url of urls) {
      if (!url || extracted.length >= max) break;
      let page = null;
      if (canSpider) {
        page = await this.spider.scrape(url, { timeout: 15000 });
        providers.push(page.provider || 'custom-spider');
        if (page.status !== 'ok') {
          errors.push({ provider: 'custom-spider', error: page.error || page.status, url });
          page = null;
        }
      }
      if (!page && canBrowser) {
        const rendered = await this.browser.render(url, {
          waitFor: 2500,
          forceUnavailable: [...forceDown]
        });
        providers.push(rendered.provider || 'browser-render');
        if (rendered.status === 'ok' && rendered.records?.length) {
          for (const record of rendered.records) {
            const prospect = toProspect(record, url, rendered.provider);
            if (prospect) extracted.push(prospect);
          }
          continue;
        }
        if (rendered.status === 'ok' && rendered.html) {
          page = {
            status: 'ok',
            provider: rendered.provider || 'browser-render',
            url,
            finalUrl: url,
            html: rendered.html,
            markdown: rendered.markdown || '',
            metadata: { title: rendered.evidence?.title || null }
          };
        } else {
          errors.push({ provider: rendered.provider || 'browser-render', error: rendered.error || rendered.status, url });
        }
      }
      if (!page || page.status !== 'ok') continue;
      const found = extractProspectsFromPage({
        ...page,
        url: page.finalUrl || url,
        sourceType: 'directory'
      });
      for (const record of found) {
        const prospect = toProspect(record, record.sourceUrl || url, page.provider || 'custom-spider');
        if (prospect) extracted.push(prospect);
      }
    }
    return extracted;
  }

  async discover(input = {}, context = {}) {
    const max = Math.min(Number(input.maxOrganizations || input.limit || 10), 12);
    const sourceUrl = input.sourceUrl || input.url || null;
    const query = input.query || input.objective || null;
    const forceDown = new Set(context.forceUnavailable || input.forceUnavailable || []);
    const errors = [];
    const providers = [];

    if (sourceUrl && this.browser?.render && !forceDown.has('browser')) {
      const rendered = await this.browser.render(sourceUrl, {
        maxRecords: max,
        waitFor: 4000,
        forceUnavailable: [...forceDown]
      });
      providers.push(rendered.provider || 'browser-render');
      if (rendered.status === 'ok' && rendered.records?.length) {
        return {
          status: 'ok',
          prospects: rendered.records.slice(0, max).map((r) => toProspect(r, sourceUrl, rendered.provider)).filter(Boolean),
          providers,
          reasonSelected: 'Used browser/directory extract because a source URL was present',
          fabricated: false
        };
      }
      errors.push({ provider: 'browser-render', error: rendered.error || 'no records' });
    }

    if (sourceUrl && this.spider?.scrape && !forceDown.has('custom-spider') && !forceDown.has('spider')) {
      const page = await this.spider.scrape(sourceUrl, { timeout: 12000 });
      providers.push('custom-spider');
      if (page.status === 'ok') {
        const extracted = extractProspectsFromPage({
          ...page,
          url: page.finalUrl || sourceUrl,
          sourceType: 'directory'
        });
        const prospects = extracted
          .map((r) => toProspect(r, sourceUrl, 'custom-spider'))
          .filter(Boolean)
          .slice(0, max);
        if (prospects.length) {
          return {
            status: 'ok',
            prospects,
            providers,
            reasonSelected: 'Used custom spider because browser/directory extract did not return records',
            fabricated: false
          };
        }
      }
      errors.push({ provider: 'custom-spider', error: page.error || page.status });
    }

    if (query && this.search?.search && !forceDown.has('web-search') && !forceDown.has('search')) {
      const searched = await this.search.search(query, { limit: Math.max(max, 12) });
      providers.push(searched.provider || 'web-search');
      if (searched.status === 'ok' && searched.results?.length) {
        const pool = searched.results.filter((item) => matchesQuery(item, query) && !isJunkResult(item));
        const direct = [];
        const directories = [];
        for (const item of pool) {
          if (looksLikeDirectory(item)) directories.push(item);
          else {
            const prospect = toProspect(item, item.url, searched.provider);
            if (prospect && !isAggregator(prospect.website)) direct.push(prospect);
          }
        }
        directories.sort((a, b) => scrapePriority(b) - scrapePriority(a));
        const extracted = await this.extractFromUrls(
          directories.map((item) => item.url).slice(0, 3),
          { max, providers, errors, forceDown }
        );
        const prospects = mergeProspects([...extracted, ...direct], max);
        if (prospects.length) {
          return {
            status: 'ok',
            prospects,
            providers,
            reasonSelected: extracted.length
              ? `Used ${searched.provider || 'web-search'} then extracted organizations from public directory pages`
              : `Used ${searched.provider || 'web-search'} because the objective is a search (no directory URL required)`,
            query,
            fabricated: false
          };
        }
        errors.push({ provider: searched.provider || 'web-search', error: 'search results did not yield organizations' });
      } else {
        errors.push({ provider: searched.provider || 'web-search', error: searched.error || 'no results' });
      }
    }

    const seeds = publicDirectoryUrls(input);
    if (seeds.length && this.spider?.scrape && !forceDown.has('custom-spider') && !forceDown.has('spider')) {
      const extracted = await this.extractFromUrls(seeds, { max, providers, errors, forceDown });
      const prospects = mergeProspects(extracted, max);
      if (prospects.length) {
        return {
          status: 'ok',
          prospects,
          providers,
          reasonSelected: 'Used a public business directory constructed from the interpreted location and industry after search did not yield organizations',
          query,
          fabricated: false
        };
      }
    }

    if (this.acquisition?.run && sourceUrl && !forceDown.has('acquisition')) {
      const run = await this.acquisition.run({
        objective: input.objective || query,
        sourceUrl,
        maxOrganizations: max,
        skipWorkflow: true,
        skipEnrich: true
      });
      providers.push('acquisition-engine');
      if (run.prospects?.length) {
        return {
          status: 'ok',
          prospects: run.prospects.slice(0, max),
          providers,
          reasonSelected: 'Fell back to acquisition.run after directory/search returned empty',
          fabricated: false
        };
      }
      errors.push({ provider: 'acquisition-engine', error: run.error || 'empty' });
    }

    return {
      status: errors.length ? 'failed' : 'empty',
      prospects: [],
      providers,
      errors,
      error: errors.map((e) => e.error).filter(Boolean).join('; ') || 'no organizations discovered',
      reasonSelected: 'No discovery provider returned organizations',
      fabricated: false
    };
  }
}

export async function researchBatch(researcher, prospects = [], { concurrency = 3 } = {}) {
  return mapLimit(prospects, concurrency, async (prospect) => {
    if (!researcher?.research) return prospect;
    try {
      const intel = await researcher.research({
        organizationName: prospect.organizationName,
        website: prospect.website,
        domain: prospect.domain,
        description: prospect.description,
        sourceUrl: prospect.sourceUrl
      });
      if (intel.status === 'ok' && intel.intelligence) {
        return {
          ...prospect,
          intelligence: intel.intelligence,
          description: prospect.description || intel.intelligence.description?.value || null
        };
      }
      return { ...prospect, researchError: intel.error || intel.status };
    } catch (error) {
      return { ...prospect, researchError: error.message };
    }
  });
}

export async function contactsBatch(discovery, prospects = [], options = {}, { concurrency = 3 } = {}) {
  return mapLimit(prospects, concurrency, async (prospect) => {
    if (!discovery?.discover) return { ...prospect, contacts: prospect.contacts || [] };
    try {
      const found = await discovery.discover({
        organization: prospect.organizationName,
        organizationName: prospect.organizationName,
        website: prospect.website,
        domain: prospect.domain,
        objective: options.objective,
        qualificationProfile: options.qualificationProfile || options.profileId,
        skipApollo: options.skipApollo === true,
        enrichPeople: options.enrichPeople || 0
      });
      const contacts = found.contacts || [];
      const next = { ...prospect, contacts, identity: found.identity, contactProviders: found.providers };
      if (contacts[0]) {
        next.contact = {
          fullName: contacts[0].fullName,
          title: contacts[0].title,
          email: contacts[0].email || null,
          phone: contacts[0].phone || null
        };
      }
      return next;
    } catch (error) {
      return { ...prospect, contacts: prospect.contacts || [], contactError: error.message };
    }
  });
}
