/**
 * CACHE SERVICE
 *
 * In-memory cache with TTL support for API responses.
 * Used to preserve quota on expensive calls (SerpAPI, GSC, GA4).
 *
 * Cache structure: key => { data, timestamp, ttl }
 */

import logger from './logger.js';

class CacheService {
  constructor(options = {}) {
    this.cache = new Map();
    this.defaultTTL = options.defaultTTL || 3600000; // 1 hour
    this.cleanupInterval = options.cleanupInterval || 600000; // 10 minutes

    // Start periodic cleanup
    setInterval(() => this.cleanup(), this.cleanupInterval);
  }

  /**
   * Generate cache key from params
   */
  static generateKey(prefix, params = {}) {
    const paramStr = JSON.stringify(params);
    return `${prefix}:${Buffer.from(paramStr).toString('base64')}`;
  }

  /**
   * Get cached value
   */
  get(key) {
    if (!this.cache.has(key)) {
      return null;
    }

    const entry = this.cache.get(key);
    const now = Date.now();
    const age = now - entry.timestamp;

    // Check if expired
    if (age > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    logger.debug(`💾 Cache hit: ${key} (${Math.round(age / 1000)}s old)`);
    return entry.data;
  }

  /**
   * Set cached value
   */
  set(key, data, ttl = this.defaultTTL) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
    logger.debug(`💾 Cache set: ${key} (TTL: ${Math.round(ttl / 1000)}s)`);
  }

  /**
   * Get or fetch - if cached, return it; otherwise call fetcher and cache result
   */
  async getOrFetch(key, fetcher, ttl = this.defaultTTL) {
    const cached = this.get(key);
    if (cached) {
      return cached;
    }

    logger.debug(`💾 Cache miss: ${key}, fetching fresh data`);
    const data = await fetcher();
    this.set(key, data, ttl);
    return data;
  }

  /**
   * Clear specific cache entry
   */
  clear(key) {
    this.cache.delete(key);
  }

  /**
   * Clear all cache
   */
  clearAll() {
    this.cache.clear();
    logger.info('💾 Cache cleared');
  }

  /**
   * Clean expired entries
   */
  cleanup() {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug(`💾 Cache cleanup removed ${removed} expired entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      entriesCount: this.cache.size,
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        age: Date.now() - entry.timestamp,
        ttl: entry.ttl,
        expired: Date.now() - entry.timestamp > entry.ttl
      }))
    };
  }
}

export { CacheService };
