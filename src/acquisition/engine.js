/**
 * Acquisition engine.
 *
 * SECURE → DISCOVER → SCRAPE → EXTRACT → NORMALIZE → DEDUPE
 * → ENRICH → STORE → n8n WORKFLOW → REPORT
 *
 * Hybrid routing chooses Firecrawl, custom spider, and search
 * based on availability and task needs. Failures stay failures.
 * Nobody is contacted from this path.
 */

import { randomUUID } from 'node:crypto';
import logger from '../utils/logger.js';
import { FirecrawlProvider } from '../providers/firecrawl.js';
import { CustomSpider } from '../providers/spider.js';
import { WebSearchProvider } from '../providers/web-search.js';
import { createProspect } from './schema.js';
import { normalizeProspect } from './normalize.js';
import { dedupeProspects } from './dedupe.js';
import { extractProspectsFromPage } from './extract.js';
import { ProspectEnricher } from './enrich.js';
import { AcquisitionStore } from './store.js';

const DEFAULT_ASW = 'https://www.affiliatesummit.com/west/exhibitors-2026';
const FALLBACK_SEEDS = [
  'https://www.affiliatesummit.com/west',
  'https://www.affiliatesummit.com/west/exhibitors-2026'
];

export function newRunId() {
  return `acq_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function extractUrl(text) {
  const match = String(text || '').match(/https?:\/\/[^\s)]+/i);
  return match ? match[0].replace(/[.,;]+$/, '') : null;
}

export class AcquisitionEngine {
  constructor(config = {}) {
    this.firecrawl = config.firecrawl || new FirecrawlProvider();
    this.spider = config.spider || new CustomSpider();
    this.search = config.search || new WebSearchProvider();
    this.store = config.store || new AcquisitionStore();
    this.enricher = config.enricher || new ProspectEnricher({ scraper: this.spider });
    this.n8n = config.n8n || null;
    this.runs = new Map();
  }

  isAvailable() {
    return Boolean(this.spider?.isAvailable?.() || this.firecrawl?.isAvailable?.());
  }

  isReady() {
    return this.isAvailable();
  }

  providerStatus() {
    return {
      firecrawl: Boolean(this.firecrawl?.isAvailable?.()),
      spider: Boolean(this.spider?.isAvailable?.()),
      search: Boolean(this.search?.isAvailable?.())
    };
  }

  async scrapeOne(url, options = {}) {
    const prefer = options.provider || null;
    const attempts = [];

    const tryFirecrawl = prefer !== 'custom-spider' && this.firecrawl?.isAvailable?.();
    const trySpider = prefer !== 'firecrawl' && this.spider?.isAvailable?.();

    if (tryFirecrawl) {
      const result = await this.firecrawl.scrape(url, options);
      attempts.push({ provider: 'firecrawl', status: result.status, error: result.error || null });
      if (result.status === 'ok') return { ...result, attempts };
    }
    if (trySpider) {
      const result = await this.spider.scrape(url, options);
      attempts.push({ provider: 'custom-spider', status: result.status, error: result.error || null });
      if (result.status === 'ok') return { ...result, attempts };
      return { ...result, attempts };
    }
    if (attempts.length === 0) {
      return {
        status: 'unavailable',
        url,
        error: 'No scrape provider available',
        attempts
      };
    }
    return {
      status: 'failed',
      url,
      error: attempts.map((a) => `${a.provider}: ${a.error || a.status}`).join('; '),
      attempts
    };
  }

  async crawlSeed(url, options = {}) {
    const prefer = options.provider || null;
    if (prefer !== 'custom-spider' && this.firecrawl?.isAvailable?.()) {
      const crawled = await this.firecrawl.crawl(url, options);
      if (crawled.status === 'ok' && crawled.pages?.length) return crawled;
      if (prefer === 'firecrawl') return crawled;
      logger.warn(`Firecrawl crawl unavailable/failed (${crawled.error || crawled.status}), using custom spider`);
      const fallback = await this.spider.crawl(url, options);
      return {
        ...fallback,
        fallbackFrom: 'firecrawl',
        priorError: crawled.error || crawled.status
      };
    }
    if (prefer !== 'firecrawl' && this.spider?.crawl) {
      return this.spider.crawl(url, options);
    }
    return {
      status: 'unavailable',
      url,
      error: 'Requested crawl provider is not available',
      pages: []
    };
  }

  async discoverSeeds(input) {
    const seeds = [];
    const errors = [];
    if (input.sourceUrl) seeds.push(input.sourceUrl);
    const fromText = extractUrl(input.objective);
    if (fromText) seeds.push(fromText);
    if (input.seeds) seeds.push(...input.seeds);

    if (seeds.length === 0 && input.query) {
      const found = await this.search.search(input.query, { limit: 6 });
      if (found.status === 'ok') {
        for (const result of found.results) {
          if (result.url) seeds.push(result.url);
        }
      } else {
        errors.push({ stage: 'search', error: found.error, provider: found.provider });
      }
    }

    if (seeds.length === 0 && /affiliate summit/i.test(input.objective || input.query || '')) {
      seeds.push(...FALLBACK_SEEDS);
    }

    return {
      seeds: [...new Set(seeds.filter(Boolean))],
      errors
    };
  }

  summarizeForUser(run) {
    const lines = [
      'Acquisition complete.',
      `Run: ${run.runId}`,
      `Pages processed: ${run.stats.pagesSuccessful}/${run.stats.pagesAttempted}`,
      `Organizations found: ${run.stats.recordsExtracted}`,
      `Unique organizations: ${run.stats.uniqueOrganizations}`,
      `Contacts found: ${run.stats.contactsDiscovered}`,
      `Enriched: ${run.stats.recordsEnriched}`,
      `Workflow: ${run.workflow?.alias || 'none'}`,
      `Workflow execution: ${run.workflow?.executionId || 'n/a'}`,
      `Errors: ${run.errors.length}`
    ];
    if (run.errors.length) {
      lines.push(run.errors.slice(0, 3).map((e) => `- ${e.stage}: ${e.error}`).join('\n'));
    }
    return lines.filter(Boolean).join('\n');
  }

  async run(input = {}) {
    const runId = input.runId || newRunId();
    const startedAt = new Date().toISOString();
    const objective = input.objective || 'Discover public exhibitors and prepare outreach-ready prospects';
    const maxPages = Math.max(1, Math.min(input.maxPages || 12, 30));
    const maxOrganizations = Math.max(1, Math.min(input.maxOrganizations || 20, 40));
    const sourceEvent = input.sourceEvent || ( /affiliate summit/i.test(objective) ? 'Affiliate Summit West 2026' : null);
    const workflowAlias = input.workflowAlias || input.workflow || 'acquisition-test';
    const skipWorkflow = input.skipWorkflow === true;
    const skipEnrich = input.skipEnrich === true;

    const run = {
      runId,
      objective,
      source: input.sourceUrl || input.query || 'objective',
      startedAt,
      completedAt: null,
      providers: this.providerStatus(),
      stats: {
        pagesAttempted: 0,
        pagesSuccessful: 0,
        pagesFailed: 0,
        recordsExtracted: 0,
        recordsNormalized: 0,
        uniqueOrganizations: 0,
        duplicatesRemoved: 0,
        contactsDiscovered: 0,
        recordsEnriched: 0,
        recordsStored: 0
      },
      errors: [],
      workflow: null,
      durationMs: 0,
      cost: { firecrawlCredits: null },
      contacted: false
    };

    const t0 = Date.now();
    this.runs.set(runId, run);
    this.store.saveRun(run);

    try {
      const discovered = await this.discoverSeeds({
        objective,
        sourceUrl: input.sourceUrl || input.url,
        query: input.query || (input.sourceUrl ? null : objective),
        seeds: input.seeds
      });
      run.errors.push(...discovered.errors);

      let seeds = discovered.seeds;
      if (seeds.length === 0) {
        run.errors.push({ stage: 'discover', error: 'No public seed URL could be resolved' });
        run.completedAt = new Date().toISOString();
        run.durationMs = Date.now() - t0;
        this.store.saveRun(run);
        return { ...run, prospects: [], summary: this.summarizeForUser(run), status: 'failed' };
      }

      const pages = [];
      for (const seed of seeds.slice(0, 4)) {
        const crawled = await this.crawlSeed(seed, {
          maxPages: Math.ceil(maxPages / Math.min(seeds.length, 4)),
          maxDepth: input.maxDepth ?? 2,
          provider: input.provider,
          includePatterns: input.includePatterns,
          excludePatterns: input.excludePatterns || ['/login', '/cart', '/account']
        });
        if (crawled.status === 'ok' && crawled.pages?.length) {
          pages.push(...crawled.pages.map((p) => ({ ...p, sourceEvent })));
          if (crawled.creditsUsed != null) {
            run.cost.firecrawlCredits = (run.cost.firecrawlCredits || 0) + crawled.creditsUsed;
          }
        } else {
          run.stats.pagesAttempted += 1;
          run.stats.pagesFailed += 1;
          run.errors.push({
            stage: 'crawl',
            url: seed,
            provider: crawled.provider,
            error: crawled.error || crawled.reason || crawled.status,
            priorError: crawled.priorError || null
          });
          if (crawled.priorError) {
            run.errors.push({
              stage: 'crawl',
              url: seed,
              provider: crawled.fallbackFrom || 'firecrawl',
              error: crawled.priorError
            });
          }
          const single = await this.scrapeOne(seed, { provider: input.provider });
          run.stats.pagesAttempted += 1;
          if (single.status === 'ok') {
            pages.push({ ...single, sourceEvent });
            run.stats.pagesSuccessful += 1;
          } else {
            run.stats.pagesFailed += 1;
            run.errors.push({
              stage: 'scrape',
              url: seed,
              provider: single.provider,
              error: single.error || single.reason || single.status
            });
          }
        }
        if (pages.length >= maxPages) break;
      }

      const limitedPages = pages.slice(0, maxPages);
      run.stats.pagesAttempted += limitedPages.length;
      run.stats.pagesSuccessful += limitedPages.filter((p) => p.status === 'ok' || p.markdown || p.html).length;
      run.stats.pagesFailed += limitedPages.filter((p) => p.status && p.status !== 'ok' && !p.markdown && !p.html).length;

      const extracted = [];
      for (const page of limitedPages) {
        const found = extractProspectsFromPage({
          ...page,
          sourceType: input.sourceType || 'exhibitor',
          sourceEvent
        });
        extracted.push(...found);
      }
      run.stats.recordsExtracted = extracted.length;

      const normalized = extracted
        .map((row) => normalizeProspect(row))
        .filter((row) => row.organizationName);
      run.stats.recordsNormalized = normalized.length;

      const deduped = dedupeProspects(normalized);
      run.stats.uniqueOrganizations = deduped.uniqueCount;
      run.stats.duplicatesRemoved = deduped.duplicatesRemoved;
      run.mergeReasons = deduped.merges;

      let prospects = deduped.prospects.slice(0, maxOrganizations);
      if (!skipEnrich) {
        const enriched = await this.enricher.enrich(prospects, {
          objective,
          maxPages: 1,
          skipNetwork: input.skipNetwork === true
        });
        prospects = enriched.prospects;
        run.stats.recordsEnriched = enriched.enrichedCount;
      }

      run.stats.contactsDiscovered = prospects.filter(
        (p) => p.contact?.email || p.contact?.phone || p.contact?.fullName
      ).length;

      const stored = this.store.saveProspects(runId, prospects);
      run.stats.recordsStored = stored.length;
      run.prospectIds = stored.map((p) => p.prospectId);

      if (!skipWorkflow && this.n8n && typeof this.n8n.execute === 'function') {
        const sample = prospects.slice(0, Math.min(5, prospects.length)).map((p) => ({
          prospectId: p.prospectId,
          organizationName: p.organizationName,
          domain: p.domain,
          website: p.website,
          contact: p.contact,
          sourceUrl: p.sourceUrl,
          qualification: p.qualification,
          provenance: p.provenance
        }));
        const workflowResult = await this.n8n.execute(workflowAlias, {
          runId,
          objective,
          prospects: sample,
          metadata: {
            source: run.source,
            sourceEvent,
            stats: run.stats,
            contacted: false,
            safety: 'discovery-only'
          }
        });
        run.workflow = {
          alias: workflowAlias,
          status: workflowResult.status,
          executionId: workflowResult.executionId || workflowResult.providerExecutionId || null,
          error: workflowResult.error || null
        };
        if (workflowResult.status === 'failed' || workflowResult.error) {
          run.errors.push({
            stage: 'workflow',
            error: workflowResult.error || workflowResult.status
          });
        }
      } else {
        run.workflow = { alias: workflowAlias, status: skipWorkflow ? 'skipped' : 'unavailable', executionId: null };
      }

      run.completedAt = new Date().toISOString();
      run.durationMs = Date.now() - t0;
      run.status = prospects.length > 0 ? 'ok' : 'empty';
      this.store.saveRun(run);
      this.runs.set(runId, run);

      logger.info(
        `Acquisition ${runId} ${run.status}: ${run.stats.uniqueOrganizations} orgs, ` +
        `${run.stats.pagesSuccessful} pages, workflow=${run.workflow?.executionId || run.workflow?.status}`
      );

      return {
        ...run,
        prospects,
        summary: this.summarizeForUser(run)
      };
    } catch (error) {
      run.errors.push({ stage: 'engine', error: error.message });
      run.completedAt = new Date().toISOString();
      run.durationMs = Date.now() - t0;
      run.status = 'failed';
      this.store.saveRun(run);
      logger.error(`Acquisition ${runId} failed: ${error.message}`);
      return {
        ...run,
        prospects: [],
        summary: this.summarizeForUser(run),
        error: error.message
      };
    }
  }

  getRun(runId) {
    return this.runs.get(runId) || this.store.getRun(runId);
  }

  listRuns(limit = 20) {
    return this.store.listRuns(limit);
  }
}

export { DEFAULT_ASW };
