/**
 * Firecrawl provider — official v2 API with v1 fallback.
 *
 * Never fabricates page content, emails, or scrape metrics.
 * Missing key / HTTP failure remains a failure.
 *
 * Official contract (2026):
 *   POST https://api.firecrawl.dev/v2/scrape
 *   POST https://api.firecrawl.dev/v2/crawl
 *   GET  https://api.firecrawl.dev/v2/crawl/:id
 *   Authorization: Bearer <FIRECRAWL_API_KEY>
 */

import logger from '../utils/logger.js';

const V2 = 'https://api.firecrawl.dev/v2';
const V1 = 'https://api.firecrawl.dev/v1';

function envKey() {
  const key = process.env.FIRECRAWL_API_KEY;
  return key && String(key).trim() ? String(key).trim() : null;
}

export class FirecrawlProvider {
  constructor(config = {}) {
    this.apiKey = config.apiKey || envKey();
    this.fetchImpl = config.fetchImpl || fetch;
    this.pollIntervalMs = config.pollIntervalMs || 1500;
    this.pollTimeoutMs = config.pollTimeoutMs || 90_000;
    this.lastError = null;
    this.lastEvidence = null;
  }

  isAvailable() {
    return Boolean(this.apiKey);
  }

  isReady() {
    return this.isAvailable();
  }

  headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  unavailable(operation, extra = {}) {
    return {
      status: 'unavailable',
      provider: 'firecrawl',
      operation,
      reason: 'FIRECRAWL_API_KEY not configured',
      ...extra
    };
  }

  async request(path, { method = 'POST', body, apiBase = V2 } = {}) {
    if (!this.apiKey) {
      const result = this.unavailable(path);
      this.lastError = result.reason;
      return { ok: false, status: 0, result };
    }

    const url = `${apiBase}${path}`;
    const started = Date.now();
    const response = await this.fetchImpl(url, {
      method,
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined
    });
    const latencyMs = Date.now() - started;
    let parsed = null;
    const rawText = await response.text();
    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch {
      parsed = null;
    }

    this.lastEvidence = {
      provider: 'firecrawl',
      url,
      httpStatus: response.status,
      latencyMs,
      successFlag: parsed?.success === true,
      id: parsed?.id || parsed?.data?.id || null
    };

    return {
      ok: response.ok,
      status: response.status,
      parsed,
      rawText,
      latencyMs,
      url
    };
  }

  async requestWithFallback(v2Path, v1Path, options = {}) {
    const primary = await this.request(v2Path, { ...options, apiBase: V2 });
    if (primary.status === 404 && v1Path) {
      logger.warn('Firecrawl v2 returned 404, trying v1');
      return this.request(v1Path, { ...options, apiBase: V1 });
    }
    return primary;
  }

  normalizeScrape(url, parsed, httpStatus, latencyMs) {
    const data = parsed?.data || parsed || {};
    const metadata = data.metadata || {};
    const markdown = data.markdown || null;
    const html = data.html || data.rawHtml || null;
    const links = Array.isArray(data.links) ? data.links : [];
    const json = data.json || data.extract || null;

    return {
      status: 'ok',
      provider: 'firecrawl',
      url,
      finalUrl: metadata.sourceURL || metadata.url || url,
      markdown,
      html,
      links,
      json,
      metadata: {
        title: metadata.title || null,
        description: metadata.description || null,
        language: metadata.language || null,
        statusCode: metadata.statusCode || httpStatus,
        sourceURL: metadata.sourceURL || url
      },
      creditsUsed: parsed?.creditsUsed ?? null,
      latencyMs,
      evidence: this.lastEvidence
    };
  }

  async scrape(url, options = {}) {
    if (!url) {
      return { status: 'failed', provider: 'firecrawl', error: 'url is required' };
    }
    if (!this.apiKey) return this.unavailable('scrape', { url });

    const formats = options.formats || ['markdown', 'links'];
    if (options.schema) {
      formats.push({ type: 'json', schema: options.schema });
    }

    try {
      const response = await this.requestWithFallback('/scrape', '/scrape', {
        method: 'POST',
        body: {
          url,
          formats,
          onlyMainContent: options.onlyMainContent !== false,
          timeout: options.timeout || 60000
        }
      });

      if (!response.ok || response.parsed?.success === false) {
        const message =
          response.parsed?.error ||
          response.parsed?.message ||
          `Firecrawl scrape HTTP ${response.status}`;
        this.lastError = message;
        return {
          status: 'failed',
          provider: 'firecrawl',
          url,
          error: message,
          httpStatus: response.status,
          evidence: this.lastEvidence
        };
      }

      return this.normalizeScrape(url, response.parsed, response.status, response.latencyMs);
    } catch (error) {
      this.lastError = error.message;
      logger.error(`Firecrawl scrape failed: ${error.message}`);
      return {
        status: 'failed',
        provider: 'firecrawl',
        url,
        error: error.message
      };
    }
  }

  async extract(url, schema, options = {}) {
    const scraped = await this.scrape(url, { ...options, schema });
    if (scraped.status !== 'ok') return scraped;
    return {
      ...scraped,
      operation: 'extract',
      data: scraped.json,
      fabricated: false
    };
  }

  async crawl(url, options = {}) {
    if (!url) {
      return { status: 'failed', provider: 'firecrawl', error: 'url is required' };
    }
    if (!this.apiKey) return this.unavailable('crawl', { url });

    try {
      const started = await this.requestWithFallback('/crawl', '/crawl', {
        method: 'POST',
        body: {
          url,
          limit: options.limit || options.maxPages || 15,
          maxDiscoveryDepth: options.maxDepth ?? 2,
          excludePaths: options.excludePaths,
          includePaths: options.includePaths,
          scrapeOptions: {
            formats: options.formats || ['markdown', 'links'],
            onlyMainContent: options.onlyMainContent !== false
          }
        }
      });

      if (!started.ok || !started.parsed?.id) {
        const message =
          started.parsed?.error ||
          started.parsed?.message ||
          `Firecrawl crawl start HTTP ${started.status}`;
        this.lastError = message;
        return {
          status: 'failed',
          provider: 'firecrawl',
          url,
          error: message,
          httpStatus: started.status,
          evidence: this.lastEvidence
        };
      }

      const jobId = started.parsed.id;
      const deadline = Date.now() + this.pollTimeoutMs;
      let last = null;

      while (Date.now() < deadline) {
        last = await this.requestWithFallback(`/crawl/${jobId}`, `/crawl/${jobId}`, {
          method: 'GET'
        });
        const state = last.parsed?.status;
        if (state === 'completed') break;
        if (state === 'failed' || state === 'cancelled') {
          return {
            status: 'failed',
            provider: 'firecrawl',
            url,
            jobId,
            error: last.parsed?.error || `crawl ${state}`,
            evidence: this.lastEvidence
          };
        }
        await new Promise((r) => setTimeout(r, this.pollIntervalMs));
      }

      if (!last?.parsed || last.parsed.status !== 'completed') {
        return {
          status: 'failed',
          provider: 'firecrawl',
          url,
          jobId,
          error: 'crawl poll timed out',
          evidence: this.lastEvidence
        };
      }

      const pages = (last.parsed.data || []).map((page) =>
        this.normalizeScrape(
          page.metadata?.sourceURL || page.metadata?.url || url,
          { data: page, creditsUsed: last.parsed.creditsUsed },
          page.metadata?.statusCode || 200,
          null
        )
      );

      return {
        status: 'ok',
        provider: 'firecrawl',
        url,
        jobId,
        pages,
        total: last.parsed.total ?? pages.length,
        completed: last.parsed.completed ?? pages.length,
        creditsUsed: last.parsed.creditsUsed ?? null,
        evidence: this.lastEvidence
      };
    } catch (error) {
      this.lastError = error.message;
      logger.error(`Firecrawl crawl failed: ${error.message}`);
      return {
        status: 'failed',
        provider: 'firecrawl',
        url,
        error: error.message
      };
    }
  }

  async getHealth() {
    if (!this.apiKey) {
      return { state: 'MISCONFIGURED', detail: 'FIRECRAWL_API_KEY not set' };
    }
    try {
      const probe = await this.scrape('https://example.com', { timeout: 20000 });
      if (probe.status === 'ok' && (probe.markdown || probe.html)) {
        return { state: 'HEALTHY', detail: 'scrape ok' };
      }
      if (probe.status === 'unavailable') {
        return { state: 'MISCONFIGURED', detail: probe.reason };
      }
      return { state: 'DEGRADED', detail: probe.error || 'scrape returned no content' };
    } catch (error) {
      return { state: 'UNAVAILABLE', detail: error.message };
    }
  }
}

export { envKey as firecrawlEnvKey };
