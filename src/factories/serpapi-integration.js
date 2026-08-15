/**
 * SERPAPI INTEGRATION
 *
 * Real Google data via SerpAPI:
 * - Google Trends (trending topics)
 * - Google Search (SERP analysis, competitor research)
 * - Shopping (product data)
 * - News (current events in niche)
 */

import logger from '../utils/logger.js';

class SerpAPIIntegration {
  constructor(config = {}) {
    this.apiKey = process.env.SERPAPI_API_KEY;
    this.enabled = !!this.apiKey;
    this.baseUrl = 'https://serpapi.com/search';
    this.trendsUrl = 'https://serpapi.com/search';
    this.callTimeout = config.callTimeout || 30000;
  }

  /**
   * Check if SerpAPI is configured
   */
  isEnabled() {
    if (!this.enabled) {
      logger.warn('⚠️  SerpAPI not configured. Set SERPAPI_API_KEY to enable.');
    }
    return this.enabled;
  }

  /**
   * Helper: Execute with timeout
   */
  async withTimeout(promise, timeoutMs = this.callTimeout) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`SerpAPI timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }

  /**
   * Get Google Trends data
   */
  async getTrends(topic, options = {}) {
    if (!this.isEnabled()) {
      return this.getPlaceholderTrends(topic);
    }

    try {
      logger.info(`📈 Fetching Google Trends for: ${topic}`);

      const params = new URLSearchParams({
        api_key: this.apiKey,
        engine: 'google_trends',
        q: topic,
        data_type: 'TIMESERIES',
        tz: options.timezone || '0'
      });

      const fetchPromise = fetch(`${this.baseUrl}?${params}`);
      const response = await this.withTimeout(fetchPromise);

      if (!response.ok) {
        throw new Error(`SerpAPI error: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(`SerpAPI error: ${data.error}`);
      }

      return {
        topic,
        searchVolume: this.estimateSearchVolume(data),
        trend: this.analyzeTrend(data),
        keywords: this.extractKeywords(data),
        relatedQueries: data.related_queries || [],
        lastUpdated: new Date(),
        source: 'serpapi_trends'
      };
    } catch (error) {
      logger.error(`Google Trends fetch failed: ${error.message}`);
      return this.getPlaceholderTrends(topic);
    }
  }

  /**
   * Get Google Search results for SERP analysis
   */
  async getSearchResults(topic, options = {}) {
    if (!this.isEnabled()) {
      return this.getPlaceholderSearchResults(topic);
    }

    try {
      logger.info(`🔍 Fetching Google Search results for: ${topic}`);

      const params = new URLSearchParams({
        api_key: this.apiKey,
        engine: 'google',
        q: topic,
        num: options.resultCount || 20,
        gl: options.country || 'us',
        hl: options.language || 'en'
      });

      const fetchPromise = fetch(`${this.baseUrl}?${params}`);
      const response = await this.withTimeout(fetchPromise);

      if (!response.ok) {
        throw new Error(`SerpAPI error: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(`SerpAPI error: ${data.error}`);
      }

      return {
        topic,
        totalResults: data.search_information?.total_results || 0,
        searchTime: data.search_information?.time || 0,
        results: (data.organic_results || []).map(r => ({
          position: r.position,
          title: r.title,
          url: r.link,
          snippet: r.snippet,
          domain: new URL(r.link).hostname
        })),
        competitionLevel: this.analyzeCompetition(data),
        topDomains: this.extractTopDomains(data),
        source: 'serpapi_search'
      };
    } catch (error) {
      logger.error(`Google Search fetch failed: ${error.message}`);
      return this.getPlaceholderSearchResults(topic);
    }
  }

  /**
   * Get news results for current events
   */
  async getNews(topic, options = {}) {
    if (!this.isEnabled()) {
      return this.getPlaceholderNews(topic);
    }

    try {
      logger.info(`📰 Fetching news for: ${topic}`);

      const params = new URLSearchParams({
        api_key: this.apiKey,
        engine: 'google_news',
        q: topic,
        gl: options.country || 'us',
        hl: options.language || 'en',
        num: options.resultCount || 10
      });

      const fetchPromise = fetch(`${this.baseUrl}?${params}`);
      const response = await this.withTimeout(fetchPromise);

      if (!response.ok) {
        throw new Error(`SerpAPI error: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(`SerpAPI error: ${data.error}`);
      }

      return {
        topic,
        articles: (data.news_results || []).map(a => ({
          title: a.title,
          link: a.link,
          source: a.source,
          date: a.date,
          snippet: a.snippet
        })),
        stories: data.top_stories || [],
        source: 'serpapi_news'
      };
    } catch (error) {
      logger.error(`News fetch failed: ${error.message}`);
      return this.getPlaceholderNews(topic);
    }
  }

  /**
   * Analyze SERP competition level
   */
  analyzeCompetition(data) {
    if (!data.organic_results || data.organic_results.length === 0) {
      return 'low';
    }

    const snippets = data.organic_results
      .filter(r => r.snippet)
      .length;

    const avgSnippetLength = data.organic_results
      .filter(r => r.snippet)
      .reduce((sum, r) => sum + r.snippet.length, 0) / Math.max(snippets, 1);

    if (avgSnippetLength > 200 && snippets > 15) {
      return 'high';
    }
    if (avgSnippetLength > 100 && snippets > 10) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Extract top domains from SERP
   */
  extractTopDomains(data) {
    const domains = {};
    (data.organic_results || []).slice(0, 10).forEach(result => {
      const domain = new URL(result.link).hostname;
      domains[domain] = (domains[domain] || 0) + 1;
    });

    return Object.entries(domains)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([domain, count]) => ({ domain, appearances: count }));
  }

  /**
   * Estimate search volume from trend data
   */
  estimateSearchVolume(data) {
    if (!data.interest_over_time) return 5000;

    const values = data.interest_over_time.map(d => d.value || 0);
    const maxValue = Math.max(...values);

    // Rough estimate: 100k searches for value 100, scales proportionally
    return Math.round((maxValue / 100) * 100000);
  }

  /**
   * Analyze if trend is rising or falling
   */
  analyzeTrend(data) {
    if (!data.interest_over_time || data.interest_over_time.length < 2) {
      return 'stable';
    }

    const timeseries = data.interest_over_time;
    const recent = timeseries.slice(-5);
    const older = timeseries.slice(-10, -5);

    const recentAvg = recent.reduce((sum, d) => sum + d.value, 0) / recent.length;
    const olderAvg = older.reduce((sum, d) => sum + d.value, 0) / older.length;

    if (recentAvg > olderAvg * 1.2) return 'rising';
    if (recentAvg < olderAvg * 0.8) return 'falling';
    return 'stable';
  }

  /**
   * Extract keywords from trend data
   */
  extractKeywords(data) {
    const keywords = [];

    // Add related queries
    if (data.related_queries) {
      keywords.push(...data.related_queries.map(q => q.query).slice(0, 10));
    }

    // Add related topics
    if (data.related_topics) {
      keywords.push(...data.related_topics.map(t => t.topic.title).slice(0, 5));
    }

    return [...new Set(keywords)]; // Deduplicate
  }

  /**
   * Placeholder data when SerpAPI not available
   */
  getPlaceholderTrends(topic) {
    logger.warn(`Using placeholder trends for: ${topic}`);
    return {
      topic,
      searchVolume: Math.floor(Math.random() * 50000) + 5000,
      trend: Math.random() > 0.5 ? 'rising' : 'stable',
      keywords: [
        topic,
        `${topic} guide`,
        `best ${topic}`,
        `${topic} tips`,
        `${topic} reviews`
      ],
      relatedQueries: [],
      source: 'placeholder'
    };
  }

  /**
   * Placeholder search results
   */
  getPlaceholderSearchResults(topic) {
    logger.warn(`Using placeholder search results for: ${topic}`);
    return {
      topic,
      totalResults: Math.floor(Math.random() * 1000000),
      results: Array(10).fill(null).map((_, i) => ({
        position: i + 1,
        title: `${topic} - Result ${i + 1}`,
        url: `https://example-${i}.com/${topic.replace(/\s+/g, '-')}`,
        snippet: `This is a sample snippet for ${topic} result ${i + 1}.`,
        domain: `example-${i}.com`
      })),
      competitionLevel: 'medium',
      topDomains: [
        { domain: 'example-1.com', appearances: 3 },
        { domain: 'example-2.com', appearances: 2 }
      ],
      source: 'placeholder'
    };
  }

  /**
   * Placeholder news
   */
  getPlaceholderNews(topic) {
    logger.warn(`Using placeholder news for: ${topic}`);
    return {
      topic,
      articles: [
        {
          title: `Latest news about ${topic}`,
          link: 'https://example.com/news',
          source: 'Example News',
          date: new Date().toISOString(),
          snippet: `Recent developments in ${topic}...`
        }
      ],
      source: 'placeholder'
    };
  }
}

export { SerpAPIIntegration };
