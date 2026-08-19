/**
 * Provider-independent web search.
 * SerpAPI when configured; otherwise DuckDuckGo HTML.
 * Never invents result URLs.
 */

import * as cheerio from 'cheerio';
import logger from '../utils/logger.js';

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
    return this.searchDuckDuckGo(query, limit);
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
      return {
        status: 'ok',
        provider: 'serpapi',
        query,
        results,
        fabricated: false
      };
    } catch (error) {
      return { status: 'failed', provider: 'serpapi', error: error.message, results: [] };
    }
  }

  async searchDuckDuckGo(query, limit) {
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await this.fetchImpl(url, {
        headers: {
          'User-Agent': 'HustleBot/2.0 (+https://hustlebot-v2.onrender.com)',
          Accept: 'text/html'
        }
      });
      if (!response.ok) {
        return { status: 'failed', provider: 'duckduckgo', error: `HTTP ${response.status}`, results: [] };
      }
      const html = await response.text();
      const $ = cheerio.load(html);
      const results = [];
      $('a.result__a, a.result-link').each((_, el) => {
        if (results.length >= limit) return;
        const title = $(el).text().replace(/\s+/g, ' ').trim();
        let href = $(el).attr('href');
        if (href && href.includes('uddg=')) {
          try {
            href = decodeURIComponent(new URL(href, 'https://duckduckgo.com').searchParams.get('uddg') || href);
          } catch {
            // keep href
          }
        }
        const snippet = $(el).closest('.result').find('.result__snippet, .result-snippet').text().trim() || null;
        if (href && /^https?:/i.test(href)) {
          results.push({ title: title || null, url: href, snippet });
        }
      });
      return {
        status: results.length ? 'ok' : 'failed',
        provider: 'duckduckgo',
        query,
        results,
        error: results.length ? null : 'no search results parsed',
        fabricated: false
      };
    } catch (error) {
      return { status: 'failed', provider: 'duckduckgo', error: error.message, results: [] };
    }
  }
}
