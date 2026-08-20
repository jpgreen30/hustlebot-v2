/**
 * Provider-independent web search.
 * SerpAPI when configured; otherwise DuckDuckGo HTML → DDG Lite → Bing HTML.
 * Never invents result URLs. Empty/challenge responses are failures, not hits.
 */

import * as cheerio from 'cheerio';
import logger from '../utils/logger.js';

const UA = 'HustleBot/2.0 (+https://hustlebot-v2.onrender.com)';

function decodeHref(href) {
  return String(href || '').replace(/&/g, '&').trim();
}

function unwrapDuckHref(href) {
  const raw = decodeHref(href);
  if (!raw) return null;
  try {
    const absolute = raw.startsWith('//') ? `https:${raw}` : raw;
    const parsed = new URL(absolute, 'https://duckduckgo.com');
    const uddg = parsed.searchParams.get('uddg');
    if (uddg) return decodeURIComponent(uddg);
    if (/^https?:/i.test(raw)) return raw;
  } catch {
    if (/^https?:/i.test(raw)) return raw;
  }
  return null;
}

function isSearchHost(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    return /(^|\.)(duckduckgo|bing|google|yahoo|ecosia)\.com$/.test(host);
  } catch {
    return true;
  }
}

function citeToUrl(cite) {
  if (!cite) return null;
  const original = String(cite);
  if (original.includes('...')) return null;
  const text = original
    .replace(/\s*[›»]\s*/g, '/')
    .replace(/\s+/g, '');
  if (!text || text.includes('...')) return null;
  if (/^https?:\/\//i.test(text)) return text;
  if (/^[a-z0-9.-]+\.[a-z]{2,}\//i.test(text) || /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(text)) {
    return `https://${text}`;
  }
  return null;
}

function pack(provider, query, results, extra = {}) {
  const clean = results.filter((item) => item.url && !isSearchHost(item.url));
  return {
    status: clean.length ? 'ok' : 'failed',
    provider,
    query,
    results: extra.limit ? clean.slice(0, extra.limit) : clean,
    error: clean.length ? null : (extra.error || 'no search results parsed'),
    fabricated: false
  };
}

export class WebSearchProvider {
  constructor(config = {}) {
    this.serpApiKey = config.serpApiKey || process.env.SERPAPI_API_KEY || null;
    this.fetchImpl = config.fetchImpl || fetch;
  }

  isAvailable() {
    return true;
  }

  preferredProvider() {
    return this.serpApiKey ? 'serpapi' : 'duckduckgo';
  }

  async fetchText(url, options = {}) {
    const response = await this.fetchImpl(url, {
      method: options.method || 'GET',
      headers: {
        'User-Agent': options.userAgent || UA,
        Accept: options.accept || 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  }

  async search(query, options = {}) {
    const limit = Math.max(1, Math.min(options.limit || 8, 15));
    if (!query) {
      return { status: 'failed', provider: this.preferredProvider(), error: 'query is required', results: [] };
    }
    if (this.serpApiKey) {
      const serp = await this.searchSerp(query, limit);
      if (serp.status === 'ok') return serp;
      logger.warn(`SerpAPI search failed (${serp.error}), falling back to DuckDuckGo`);
    }
    const html = await this.searchDuckDuckGo(query, limit);
    if (html.status === 'ok') return html;
    const lite = await this.searchDuckDuckGoLite(query, limit);
    if (lite.status === 'ok') return lite;
    const bing = await this.searchBing(query, limit);
    if (bing.status === 'ok') return bing;
    return pack(html.provider || 'duckduckgo', query, [], {
      error: [html.error, lite.error, bing.error].filter(Boolean).join('; ') || 'no search results parsed',
      limit
    });
  }

  async searchSerp(query, limit) {
    try {
      const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&num=${limit}&api_key=${encodeURIComponent(this.serpApiKey)}`;
      const response = await this.fetchImpl(url);
      if (!response.ok) {
        return { status: 'failed', provider: 'serpapi', error: `HTTP ${response.status}`, results: [] };
      }
      const body = await response.json();
      const organic = Array.isArray(body.organic_results) ? body.organic_results : [];
      const results = organic.slice(0, limit).map((item) => ({
        title: item.title || null,
        url: item.link || null,
        snippet: item.snippet || null
      })).filter((item) => item.url);
      return pack('serpapi', query, results, { limit });
    } catch (error) {
      return { status: 'failed', provider: 'serpapi', error: error.message, results: [] };
    }
  }

  async searchDuckDuckGo(query, limit) {
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await this.fetchText(url);
      if (!response.ok || response.status === 202) {
        return {
          status: 'failed',
          provider: 'duckduckgo',
          error: `HTTP ${response.status}`,
          results: []
        };
      }
      if (/anomaly|challenge|detecting unusual/i.test(response.text) && !/result__a|result-link/.test(response.text)) {
        return { status: 'failed', provider: 'duckduckgo', error: 'challenge page', results: [] };
      }
      const $ = cheerio.load(response.text);
      const results = [];
      $('a.result__a, a.result-link').each((_, el) => {
        if (results.length >= limit) return;
        const title = $(el).text().replace(/\s+/g, ' ').trim();
        const href = unwrapDuckHref($(el).attr('href'));
        const snippet = $(el).closest('.result').find('.result__snippet, .result-snippet').text().trim() || null;
        if (href && /^https?:/i.test(href)) {
          results.push({ title: title || null, url: href, snippet });
        }
      });
      return pack('duckduckgo', query, results, { limit });
    } catch (error) {
      return { status: 'failed', provider: 'duckduckgo', error: error.message, results: [] };
    }
  }

  async searchDuckDuckGoLite(query, limit) {
    try {
      const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
      const response = await this.fetchText(url);
      if (!response.ok) {
        return { status: 'failed', provider: 'duckduckgo-lite', error: `HTTP ${response.status}`, results: [] };
      }
      const $ = cheerio.load(response.text);
      const results = [];
      $('a.result-link').each((_, el) => {
        if (results.length >= limit) return;
        const node = $(el);
        if (node.closest('tr.result-sponsored').length) return;
        const title = node.text().replace(/\s+/g, ' ').trim();
        if (/sponsored link|more info/i.test(title)) return;
        const href = unwrapDuckHref(node.attr('href'));
        const snippet = node.closest('tr').next().find('.result-snippet').text().trim() || null;
        if (href && /^https?:/i.test(href)) {
          results.push({ title: title || null, url: href, snippet });
        }
      });
      return pack('duckduckgo-lite', query, results, { limit });
    } catch (error) {
      return { status: 'failed', provider: 'duckduckgo-lite', error: error.message, results: [] };
    }
  }

  async searchBing(query, limit) {
    try {
      const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
      const response = await this.fetchText(url, {
        userAgent: 'Mozilla/5.0 (compatible; HustleBot/2.0; +https://hustlebot-v2.onrender.com)'
      });
      if (!response.ok) {
        return { status: 'failed', provider: 'bing', error: `HTTP ${response.status}`, results: [] };
      }
      const $ = cheerio.load(response.text);
      const results = [];
      $('li.b_algo').each((_, el) => {
        if (results.length >= limit) return;
        const node = $(el);
        const title = node.find('h2').first().text().replace(/\s+/g, ' ').trim();
        const cite = node.find('cite').first().text();
        const href = citeToUrl(cite);
        const snippet = node.find('.b_caption p, p').first().text().replace(/\s+/g, ' ').trim() || null;
        if (href) results.push({ title: title || null, url: href, snippet });
      });
      return pack('bing', query, results, { limit });
    } catch (error) {
      return { status: 'failed', provider: 'bing', error: error.message, results: [] };
    }
  }
}
