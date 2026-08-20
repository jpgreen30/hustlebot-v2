import { normalizeDomain, normalizeUrl } from '../acquisition/normalize.js';
import { mapLimit } from './util.js';

function toProspect(record, sourceUrl, provider) {
  const name = record.organizationName || record.name || record.title || null;
  const website = normalizeUrl(record.website || record.url || record.link || null);
  if (!name && !website) return null;
  return {
    organizationName: name || website,
    website,
    domain: normalizeDomain(record.domain || website),
    description: record.description || record.snippet || null,
    sourceUrl: record.sourceUrl || sourceUrl || website,
    provenance: { provider, extractionMethod: 'org.discover' }
  };
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

  async discover(input = {}, context = {}) {
    const max = Math.min(Number(input.maxOrganizations || input.limit || 10), 12);
    const sourceUrl = input.sourceUrl || input.url || null;
    const query = input.query || input.objective || null;
    const forceDown = new Set(context.forceUnavailable || input.forceUnavailable || []);
    const errors = [];
    const providers = [];

    if (sourceUrl && this.browser?.render && !forceDown.has('browser') && !forceDown.has('firecrawl')) {
      const rendered = await this.browser.render(sourceUrl, { maxRecords: max, waitFor: 4000 });
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
        const prospects = [];
        if (page.title) prospects.push(toProspect({ name: page.title, website: sourceUrl }, sourceUrl, 'custom-spider'));
        if (prospects.length) {
          return {
            status: 'ok',
            prospects: prospects.filter(Boolean).slice(0, max),
            providers,
            reasonSelected: 'Used custom spider because browser/directory extract did not return records',
            fabricated: false
          };
        }
      }
      errors.push({ provider: 'custom-spider', error: page.error || page.status });
    }

    if (query && this.search?.search && !forceDown.has('web-search') && !forceDown.has('search')) {
      const searched = await this.search.search(query, { limit: max });
      providers.push(searched.provider || 'web-search');
      if (searched.status === 'ok' && searched.results?.length) {
        const prospects = searched.results
          .map((item) => toProspect(item, item.url, searched.provider))
          .filter(Boolean)
          .slice(0, max);
        return {
          status: 'ok',
          prospects,
          providers,
          reasonSelected: `Used ${searched.provider || 'web-search'} because the objective is a search (no directory URL required)`,
          query,
          fabricated: false
        };
      }
      errors.push({ provider: searched.provider || 'web-search', error: searched.error || 'no results' });
    }

    if (this.acquisition?.run && !forceDown.has('acquisition')) {
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
