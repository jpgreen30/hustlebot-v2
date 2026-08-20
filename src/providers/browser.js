/**
 * Browser / JS-rendered public page extraction.
 *
 * Provider-independent: discover public structured endpoints the page
 * itself uses, then fall back to Firecrawl JS render. Never bypasses
 * auth, CAPTCHAs, or paywalls. Never fabricates records.
 */

import * as cheerio from 'cheerio';
import logger from '../utils/logger.js';

const DEFAULT_UA = 'HustleBot/3.0 (+https://hustlebot-v2.onrender.com)';

function clip(value, n = 400) {
  if (value == null) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, n) : null;
}

export class BrowserRenderProvider {
  constructor(config = {}) {
    this.firecrawl = config.firecrawl || null;
    this.fetchImpl = config.fetchImpl || fetch;
    this.userAgent = config.userAgent || DEFAULT_UA;
    this.timeoutMs = config.timeoutMs || 20000;
    this.lastEvidence = null;
  }

  isAvailable() {
    return true;
  }

  isReady() {
    return this.isAvailable();
  }

  async fetchJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        headers: {
          Accept: 'application/json, text/html;q=0.8',
          'User-Agent': this.userAgent
        },
        signal: controller.signal
      });
      const text = await response.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      return { ok: response.ok, status: response.status, json, text, url };
    } finally {
      clearTimeout(timer);
    }
  }

  parseLivebuzzWidget(html) {
    if (!html) return null;
    const $ = cheerio.load(html);
    const node = $('livebuzz-widget').first();
    if (!node.length) {
      const match = String(html).match(
        /organisation=["']([^"']+)["'][^>]*campaign=["']([^"']+)["'][^>]*moduleId=["']([^"']+)["']/i
      );
      if (!match) return null;
      return {
        organisation: match[1],
        campaign: match[2],
        moduleId: match[3],
        apiDomain: 'control.buzz',
        apiProtocol: 'https'
      };
    }
    return {
      organisation: node.attr('organisation') || null,
      campaign: node.attr('campaign') || null,
      moduleId: node.attr('moduleid') || node.attr('moduleId') || null,
      apiDomain: node.attr('domain') || 'control.buzz',
      apiProtocol: node.attr('protocol') || 'https'
    };
  }

  moduleBase(widget) {
    if (!widget?.organisation || !widget?.campaign || !widget?.moduleId) return null;
    return `${widget.apiProtocol}://${widget.organisation}.${widget.apiDomain}/campaign/${widget.campaign}/web-module/${widget.moduleId}`;
  }

  async discoverPublicDirectory(url, html, options = {}) {
    const widget = this.parseLivebuzzWidget(html);
    if (!widget) {
      return { status: 'unavailable', reason: 'no public directory widget on page', records: [] };
    }
    const base = this.moduleBase(widget);
    const settingsUrl = `${base}/settings`;
    const settingsRes = await this.fetchJson(settingsUrl);
    if (!settingsRes.json || !settingsRes.ok) {
      return {
        status: 'failed',
        provider: 'public-directory',
        error: `directory settings HTTP ${settingsRes.status}`,
        records: [],
        widget,
        settingsUrl
      };
    }

    const settings = settingsRes.json;
    const algolia = settings.algolia || {};
    const limit = Math.min(options.maxRecords || 25, 50);
    let hits = [];
    let searchEvidence = null;

    if (algolia.application_id && algolia.search_only_api_key && algolia.indexes) {
      const indexName = algolia.indexes.exhibitors || Object.values(algolia.indexes)[0];
      const body = {
        requests: [{ indexName, params: `query=&hitsPerPage=${limit}` }]
      };
      const searchUrl = `https://${algolia.application_id}-dsn.algolia.net/1/indexes/*/queries`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchImpl(searchUrl, {
          method: 'POST',
          headers: {
            'X-Algolia-Application-Id': algolia.application_id,
            'X-Algolia-API-Key': algolia.search_only_api_key,
            'Content-Type': 'application/json',
            'User-Agent': this.userAgent
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        const parsed = await response.json().catch(() => null);
        hits = parsed?.results?.[0]?.hits || [];
        searchEvidence = {
          provider: 'public-algolia',
          httpStatus: response.status,
          indexPresent: Boolean(indexName),
          nbHits: parsed?.results?.[0]?.nbHits ?? hits.length
        };
      } finally {
        clearTimeout(timer);
      }
    }

    const details = [];
    const toFetch = hits.slice(0, limit);
    for (const hit of toFetch) {
      const id = hit.objectID || hit.id;
      if (!id) {
        details.push({ hit, detail: null });
        continue;
      }
      const detailUrl = `${base}/exhibitors/${id}`;
      const detail = await this.fetchJson(detailUrl);
      details.push({
        hit,
        detail: detail.json && detail.ok ? detail.json : null,
        detailUrl,
        detailStatus: detail.status
      });
    }

    const records = details.map(({ hit, detail, detailUrl }) => {
      const rec = detail || hit || {};
      const socials = [];
      const rawSocials = rec.social_links;
      if (Array.isArray(rawSocials)) {
        for (const item of rawSocials) if (item?.url) socials.push({ type: item.type || null, url: item.url });
      } else if (rawSocials && typeof rawSocials === 'object') {
        for (const item of Object.values(rawSocials)) {
          if (item?.url) socials.push({ type: item.type || null, url: item.url });
        }
      }
      const address = Array.isArray(rec.addresses) ? rec.addresses[0] : null;
      return {
        name: rec.name || hit.name || null,
        identifier: rec.identifier || hit.identifier || null,
        website: rec.website || null,
        description: clip(rec.biography || rec.details || hit.biography, 800),
        booth: Array.isArray(rec.stands) ? rec.stands.join('; ') : (Array.isArray(hit.stands) ? hit.stands.join('; ') : null),
        location: address
          ? [address.city, address.county || address.region, address.country].filter(Boolean).join(', ')
          : null,
        country: rec.country_iso || hit.country_iso || address?.country || null,
        socialUrls: socials.map((s) => s.url),
        profileUrl: detailUrl || url,
        sourceUrl: settings.url || url,
        sourceType: 'exhibitor',
        sourceEvent: widget.campaign,
        rawId: rec.id || hit.objectID || null,
        provenance: {
          provider: 'public-directory',
          extractionMethod: 'livebuzz-public-settings+algolia+detail',
          sourceUrls: [url, settingsUrl, detailUrl].filter(Boolean)
        }
      };
    }).filter((r) => r.name);

    this.lastEvidence = {
      provider: 'public-directory',
      widget,
      settingsUrl,
      search: searchEvidence,
      records: records.length
    };

    return {
      status: records.length ? 'ok' : 'failed',
      provider: 'public-directory',
      url,
      widget,
      settingsUrl,
      records,
      error: records.length ? null : 'public directory returned no exhibitor records',
      evidence: this.lastEvidence
    };
  }

  async renderFirecrawl(url, options = {}) {
    if (!this.firecrawl?.isAvailable?.()) {
      return { status: 'unavailable', provider: 'firecrawl', url, error: 'Firecrawl not configured' };
    }
    const scraped = await this.firecrawl.scrape(url, {
      formats: ['markdown', 'html', 'links'],
      onlyMainContent: false,
      waitFor: options.waitFor ?? 4000,
      maxAge: 0,
      timeout: options.timeout || 60000,
      actions: options.actions || [{ type: 'wait', milliseconds: options.waitFor ?? 4000 }]
    });
    return {
      ...scraped,
      operation: 'render'
    };
  }

  async render(url, options = {}) {
    if (!url) {
      return { status: 'failed', provider: 'browser-render', error: 'url is required' };
    }

    const htmlRes = await this.fetchHtml(url);
    let directory = { status: 'unavailable', records: [] };
    if (htmlRes.html) {
      directory = await this.discoverPublicDirectory(url, htmlRes.html, options);
      if (directory.status === 'ok' && directory.records.length) {
        return {
          status: 'ok',
          provider: 'public-directory',
          url,
          html: htmlRes.html,
          records: directory.records,
          evidence: directory.evidence
        };
      }
    }

    const skipFirecrawl = (options.forceUnavailable || []).includes('firecrawl');
    const rendered = skipFirecrawl
      ? { status: 'unavailable', provider: 'firecrawl', error: 'firecrawl forced unavailable' }
      : await this.renderFirecrawl(url, options);
    if (rendered.status === 'ok') {
      const fromRendered = await this.discoverPublicDirectory(url, rendered.html || '', options);
      if (fromRendered.status === 'ok' && fromRendered.records.length) {
        return {
          status: 'ok',
          provider: 'firecrawl+public-directory',
          url,
          html: rendered.html,
          markdown: rendered.markdown,
          records: fromRendered.records,
          evidence: { firecrawl: rendered.evidence, directory: fromRendered.evidence }
        };
      }
      return {
        ...rendered,
        records: [],
        directoryAttempt: directory.error || directory.reason || null
      };
    }

    return {
      status: 'failed',
      provider: 'browser-render',
      url,
      error: [directory.error || directory.reason, rendered.error].filter(Boolean).join('; ') || 'no render provider produced content',
      records: [],
      evidence: { directory: directory.evidence || null, firecrawl: rendered.evidence || null }
    };
  }

  async fetchHtml(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        headers: { 'User-Agent': this.userAgent, Accept: 'text/html' },
        signal: controller.signal
      });
      const html = await response.text();
      return { ok: response.ok, status: response.status, html, url };
    } catch (error) {
      return { ok: false, status: 0, html: '', url, error: error.message };
    } finally {
      clearTimeout(timer);
    }
  }

  async getHealth() {
    try {
      const probe = await this.fetchHtml('https://example.com');
      if (!probe.ok) return { state: 'DEGRADED', detail: `html fetch HTTP ${probe.status}` };
      return { state: 'HEALTHY', detail: 'html fetch ok' };
    } catch (error) {
      return { state: 'UNAVAILABLE', detail: error.message };
    }
  }
}

export { clip };
