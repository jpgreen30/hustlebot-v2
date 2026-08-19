/**
 * FIRECRAWL WEB SCRAPING INTEGRATION
 *
 * Facade over the real Firecrawl provider. Production never returns
 * generated page content, fake emails, or random scrape metrics.
 */

import logger from '../utils/logger.js';
import { FirecrawlProvider } from '../providers/firecrawl.js';
import { extractEmails } from '../acquisition/extract.js';

class ScrapingIntegration {
  constructor(config = {}) {
    this.provider = config.provider || new FirecrawlProvider(config);
    this.firecrawlApiKey = this.provider.apiKey || process.env.FIRECRAWL_API_KEY || null;
    this.firecrawlEnabled = !!this.firecrawlApiKey;
    this.scrapes = new Map();
    this.extractedData = new Map();
  }

  isReady() {
    return this.provider.isAvailable();
  }

  async initialize() {
    logger.info('🕷️  Firecrawl Scraping Integration initialized');
    if (!this.firecrawlEnabled) {
      logger.warn('⚠️  FIRECRAWL_API_KEY not set — scrape calls will return unavailable');
    }
    return true;
  }

  async scrapePage(url, options = {}) {
    try {
      logger.info(`🌐 Scraping page: ${String(url || '').substring(0, 80)}`);
      const result = await this.provider.scrape(url, options);
      if (result.status === 'ok') {
        this.scrapes.set(result.evidence?.id || `scrape_${Date.now()}`, result);
      }
      return result;
    } catch (error) {
      logger.error(`Web scraping failed: ${error.message}`);
      return { url, status: 'failed', error: error.message, provider: 'firecrawl' };
    }
  }

  async extractStructuredData(url, schema) {
    try {
      logger.info(`📋 Extracting structured data from: ${url}`);
      const result = await this.provider.extract(url, schema);
      if (result.status === 'ok') {
        this.extractedData.set(`extract_${Date.now()}`, result);
      }
      return result;
    } catch (error) {
      logger.error(`Data extraction failed: ${error.message}`);
      return { url, status: 'failed', error: error.message, provider: 'firecrawl' };
    }
  }

  async searchAndScrape(query, maxPages = 5) {
    return {
      query,
      status: 'unavailable',
      reason: 'searchAndScrape is not a Firecrawl endpoint; use web.search + web.scrape',
      results: [],
      maxPages
    };
  }

  async batchScrape(urls = []) {
    const results = [];
    for (const url of urls) {
      results.push(await this.scrapePage(url));
    }
    return {
      totalRequested: urls.length,
      totalCompleted: results.filter((r) => r.status === 'ok').length,
      results
    };
  }

  async getScrapeResults(scrapeId) {
    if (!this.scrapes.has(scrapeId)) {
      return { scrapeId, status: 'failed', error: `Scrape ${scrapeId} not found` };
    }
    return this.scrapes.get(scrapeId);
  }

  async extractEmails(url) {
    const page = await this.scrapePage(url);
    if (page.status !== 'ok') {
      return { url, status: page.status, error: page.error || page.reason, emails: [] };
    }
    const emails = extractEmails(`${page.markdown || ''}\n${page.html || ''}`);
    return {
      url,
      status: 'ok',
      emailsFound: emails.length,
      emails,
      fabricated: false
    };
  }

  async monitorPage(url) {
    return {
      url,
      status: 'unavailable',
      reason: 'Page monitoring is not implemented as a real Firecrawl subscription'
    };
  }

  async crawlSite(url, options = {}) {
    return this.provider.crawl(url, options);
  }

  getStatus() {
    return {
      initialized: true,
      firecrawlEnabled: this.firecrawlEnabled,
      provider: 'firecrawl',
      totalScrapes: this.scrapes.size,
      totalExtractions: this.extractedData.size,
      lastError: this.provider.lastError,
      timestamp: new Date()
    };
  }

  async getHealth() {
    return this.provider.getHealth();
  }
}

export { ScrapingIntegration };
