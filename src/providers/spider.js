/**
 * Custom same-domain spider.
 *
 * Public-web only. Respects robots.txt. Does not bypass auth, CAPTCHAs,
 * paywalls, or access controls. Never fabricates page content.
 */

import * as cheerio from 'cheerio';
import logger from '../utils/logger.js';

const DEFAULT_UA = 'HustleBot/2.0 (+https://hustlebot-v2.onrender.com; acquisition-spider)';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function canonicalizeUrl(raw, base) {
  if (!raw) return null;
  let parsed;
  try {
    parsed = new URL(raw, base);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  parsed.hash = '';
  if (parsed.pathname.length > 1) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  }
  return parsed.toString();
}

export function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function matchesAny(url, patterns = []) {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((pattern) => {
    try {
      return new RegExp(pattern, 'i').test(url);
    } catch {
      return url.includes(pattern);
    }
  });
}

export class CustomSpider {
  constructor(config = {}) {
    this.fetchImpl = config.fetchImpl || fetch;
    this.userAgent = config.userAgent || process.env.SPIDER_USER_AGENT || DEFAULT_UA;
    this.defaultDelayMs = config.crawlDelayMs ?? 400;
    this.defaultTimeoutMs = config.timeoutMs ?? 15000;
    this.maxRetries = config.maxRetries ?? 1;
    this.robotsCache = new Map();
    this.lastError = null;
  }

  isAvailable() {
    return true;
  }

  isReady() {
    return true;
  }

  async fetchPage(url, options = {}) {
    const timeoutMs = options.timeoutMs || this.defaultTimeoutMs;
    let lastError = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await this.fetchImpl(url, {
          method: 'GET',
          redirect: 'follow',
          headers: {
            'User-Agent': this.userAgent,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          },
          signal: controller.signal
        });
        clearTimeout(timer);
        const html = await response.text();
        return {
          status: response.ok ? 'ok' : 'failed',
          provider: 'custom-spider',
          url,
          finalUrl: response.url || url,
          httpStatus: response.status,
          html: response.ok ? html : null,
          error: response.ok ? null : `HTTP ${response.status}`,
          contentType: response.headers?.get?.('content-type') || null
        };
      } catch (error) {
        clearTimeout(timer);
        lastError = error.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : error.message;
        if (attempt < this.maxRetries) await sleep(250 * (attempt + 1));
      }
    }

    this.lastError = lastError;
    return {
      status: 'failed',
      provider: 'custom-spider',
      url,
      error: lastError
    };
  }

  async loadRobots(origin) {
    if (this.robotsCache.has(origin)) return this.robotsCache.get(origin);
    const robotsUrl = `${origin}/robots.txt`;
    try {
      const response = await this.fetchImpl(robotsUrl, {
        headers: { 'User-Agent': this.userAgent }
      });
      const text = response.ok ? await response.text() : '';
      const parsed = this.parseRobots(text);
      this.robotsCache.set(origin, parsed);
      return parsed;
    } catch {
      const empty = { disallow: [], crawlDelayMs: this.defaultDelayMs };
      this.robotsCache.set(origin, empty);
      return empty;
    }
  }

  parseRobots(text) {
    const disallow = [];
    let crawlDelayMs = this.defaultDelayMs;
    let applies = false;
    for (const rawLine of String(text || '').split(/\r?\n/)) {
      const line = rawLine.replace(/#.*$/, '').trim();
      if (!line) continue;
      const [key, ...rest] = line.split(':');
      const value = rest.join(':').trim();
      const field = key.toLowerCase();
      if (field === 'user-agent') {
        applies = value === '*' || value.toLowerCase().includes('hustlebot');
      } else if (applies && field === 'disallow' && value) {
        disallow.push(value);
      } else if (applies && field === 'crawl-delay' && value) {
        const seconds = Number(value);
        if (Number.isFinite(seconds) && seconds >= 0) {
          crawlDelayMs = Math.max(crawlDelayMs, seconds * 1000);
        }
      }
    }
    return { disallow, crawlDelayMs };
  }

  allowedByRobots(url, robots) {
    let path;
    try {
      path = new URL(url).pathname || '/';
    } catch {
      return false;
    }
    return !robots.disallow.some((rule) => rule !== '' && path.startsWith(rule));
  }

  extractPage(url, html) {
    const $ = cheerio.load(html || '');
    $('script, style, noscript').remove();
    const title = $('title').first().text().trim() || null;
    const description =
      $('meta[name="description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content') ||
      null;
    const siteName = $('meta[property="og:site_name"]').attr('content') || null;
    const canonical = $('link[rel="canonical"]').attr('href') || null;
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    const markdown = [
      title ? `# ${title}` : '',
      description || '',
      text.slice(0, 8000)
    ].filter(Boolean).join('\n\n');

    const links = [];
    $('a[href]').each((_, el) => {
      const href = canonicalizeUrl($(el).attr('href'), url);
      if (!href) return;
      links.push({
        url: href,
        text: $(el).text().replace(/\s+/g, ' ').trim().slice(0, 200) || null
      });
    });

    return {
      title,
      description,
      siteName,
      canonical: canonicalizeUrl(canonical, url),
      text,
      markdown,
      links,
      html
    };
  }

  isListingLike(url, linkText = '') {
    const hay = `${url} ${linkText}`.toLowerCase();
    return /(exhibitor|sponsor|vendor|directory|gallery|booth|partner|attendee|company|companies)/i.test(hay);
  }

  async scrape(url, options = {}) {
    if (!url) {
      return { status: 'failed', provider: 'custom-spider', error: 'url is required' };
    }
    const page = await this.fetchPage(url, options);
    if (page.status !== 'ok') return page;
    const extracted = this.extractPage(page.finalUrl || url, page.html);
    return {
      status: 'ok',
      provider: 'custom-spider',
      url,
      finalUrl: page.finalUrl,
      httpStatus: page.httpStatus,
      markdown: extracted.markdown,
      html: extracted.html,
      text: extracted.text,
      links: extracted.links.map((l) => l.url),
      linkDetails: extracted.links,
      metadata: {
        title: extracted.title,
        description: extracted.description,
        siteName: extracted.siteName,
        canonical: extracted.canonical,
        statusCode: page.httpStatus,
        sourceURL: page.finalUrl || url
      },
      fabricated: false
    };
  }

  async crawl(seedUrl, options = {}) {
    const maxPages = Math.max(1, Math.min(options.maxPages || options.limit || 12, 40));
    const maxDepth = options.maxDepth ?? 2;
    const allowedDomains = new Set(
      (options.allowedDomains || [hostnameOf(seedUrl)]).filter(Boolean).map((d) => d.replace(/^www\./, '').toLowerCase())
    );
    const includePatterns = options.includePatterns || options.urlPatterns || [];
    const excludePatterns = options.excludePatterns || [];
    const concurrency = Math.max(1, Math.min(options.concurrency || 2, 4));

    const origin = (() => {
      try { return new URL(seedUrl).origin; } catch { return null; }
    })();
    const robots = origin && options.respectRobots !== false
      ? await this.loadRobots(origin)
      : { disallow: [], crawlDelayMs: this.defaultDelayMs };
    const delayMs = options.crawlDelayMs ?? robots.crawlDelayMs ?? this.defaultDelayMs;

    const queue = [{ url: canonicalizeUrl(seedUrl), depth: 0 }];
    const seen = new Set();
    const pages = [];
    const errors = [];
    const skipped = [];

    const take = () => {
      const batch = [];
      while (batch.length < concurrency && queue.length > 0 && pages.length + batch.length < maxPages) {
        const item = queue.shift();
        if (!item?.url || seen.has(item.url)) continue;
        seen.add(item.url);
        batch.push(item);
      }
      return batch;
    };

    while (queue.length > 0 && pages.length < maxPages) {
      const batch = take();
      if (batch.length === 0) break;

      const results = [];
      for (const item of batch) {
        const host = hostnameOf(item.url);
        if (!host || !allowedDomains.has(host)) {
          skipped.push({ url: item.url, reason: 'domain-not-allowed' });
          continue;
        }
        if (matchesAny(item.url, excludePatterns)) {
          skipped.push({ url: item.url, reason: 'excluded-pattern' });
          continue;
        }
        if (includePatterns.length && item.depth > 0 && !matchesAny(item.url, includePatterns) && !this.isListingLike(item.url)) {
          skipped.push({ url: item.url, reason: 'include-pattern-miss' });
          continue;
        }
        if (!this.allowedByRobots(item.url, robots)) {
          skipped.push({ url: item.url, reason: 'robots.txt' });
          continue;
        }
        if (delayMs) await sleep(delayMs);
        const scraped = await this.scrape(item.url, options);
        results.push({ item, scraped });
      }

      for (const { item, scraped } of results) {
        if (scraped.status !== 'ok') {
          errors.push({ url: item.url, error: scraped.error, httpStatus: scraped.httpStatus || null });
          continue;
        }
        pages.push({ ...scraped, depth: item.depth });
        if (item.depth >= maxDepth) continue;
        for (const link of scraped.linkDetails || []) {
          const next = canonicalizeUrl(link.url);
          if (!next || seen.has(next)) continue;
          const nextHost = hostnameOf(next);
          if (!allowedDomains.has(nextHost)) continue;
          queue.push({ url: next, depth: item.depth + 1, via: link.text });
        }
      }
    }

    if (pages.length === 0 && errors.length > 0) {
      return {
        status: 'failed',
        provider: 'custom-spider',
        url: seedUrl,
        error: errors[0].error || 'no pages crawled',
        pages: [],
        errors,
        skipped
      };
    }

    return {
      status: 'ok',
      provider: 'custom-spider',
      url: seedUrl,
      pages,
      total: pages.length + errors.length,
      completed: pages.length,
      errors,
      skipped,
      fabricated: false
    };
  }

  async getHealth() {
    try {
      const probe = await this.scrape('https://example.com');
      if (probe.status === 'ok' && (probe.markdown || probe.html)) {
        return { state: 'HEALTHY', detail: 'example.com fetch ok' };
      }
      return { state: 'DEGRADED', detail: probe.error || 'empty page' };
    } catch (error) {
      return { state: 'UNAVAILABLE', detail: error.message };
    }
  }
}
