/**
 * PROVIDER ABSTRACTION LAYER
 *
 * Unified interface for:
 * 1. LLM provider selection (OpenRouter, Anthropic, OpenAI)
 * 2. Storage provider selection (S3, Local FS, In-Memory)
 * 3. Streaming responses
 * 4. Cost tracking and metrics
 */

import logger from '../utils/logger.js';
import { HybridStorageProvider } from '../llm/storage.js';
import { StreamingLLMProvider, StreamingAPIResponse } from '../llm/streaming.js';

class ProviderAbstraction {
  constructor(config = {}) {
    this.config = config;
    this.llmProvider = config.llm_provider || this.detectBestLLMProvider();
    this.storageProvider = null;
    this.streaming = StreamingLLMProvider;
    this.streamingAPI = StreamingAPIResponse;

    // Fallback chains (tried in order)
    this.llmFallbacks = config.llm_fallbacks || ['openrouter', 'anthropic', 'openai'];
    this.storageFallbacks = config.storage_fallbacks || ['s3', 'local', 'memory'];

    // Metrics
    this.metrics = {
      totalCost: 0,
      requestCount: 0,
      totalTokens: 0,
      totalStreamingChunks: 0
    };

    // Available providers detected from environment
    this.availableProviders = {
      llm: [],
      storage: []
    };
  }

  /**
   * Initialize provider abstraction
   */
  async initialize() {
    try {
      this.detectAvailableProviders();

      // Initialize storage provider
      this.storageProvider = new HybridStorageProvider(this.config.storage);
      await this.storageProvider.initialize();

      logger.info(`✅ Provider abstraction initialized`);
      logger.info(`   - LLM: ${this.llmProvider} (${this.availableProviders.llm.join(', ')})`);
      logger.info(`   - Storage: ${this.storageProvider.getStatus().preferred} (${this.availableProviders.storage.join(', ')})`);

      return true;
    } catch (error) {
      logger.error('Provider initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Detect which providers have valid credentials
   */
  detectAvailableProviders() {
    // LLM providers
    if (process.env.OPENROUTER_API_KEY) this.availableProviders.llm.push('openrouter');
    if (process.env.ANTHROPIC_API_KEY) this.availableProviders.llm.push('anthropic');
    if (process.env.OPENAI_API_KEY) this.availableProviders.llm.push('openai');

    // Storage providers (local always available)
    this.availableProviders.storage.push('local');
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_S3_BUCKET) {
      this.availableProviders.storage.push('s3');
    }

    logger.info(`📊 Available providers: LLM=${this.availableProviders.llm.length}, Storage=${this.availableProviders.storage.length}`);
  }

  /**
   * Detect best LLM provider from environment variables
   */
  detectBestLLMProvider() {
    if (process.env.OPENROUTER_API_KEY) return 'openrouter';
    if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
    if (process.env.OPENAI_API_KEY) return 'openai';
    return 'openrouter'; // Default
  }

  /**
   * Store file with storage provider
   */
  async storeFile(fileKey, fileContent, metadata = {}) {
    if (!this.storageProvider) {
      throw new Error('Storage provider not initialized');
    }

    try {
      const result = await this.storageProvider.store(fileKey, fileContent, metadata);
      logger.info(`✅ File stored: ${fileKey} via ${result.storage}`);
      return result;
    } catch (error) {
      logger.error(`Storage error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Retrieve file from storage
   */
  async retrieveFile(fileKey, options = {}) {
    if (!this.storageProvider) {
      throw new Error('Storage provider not initialized');
    }

    try {
      const result = await this.storageProvider.retrieve(fileKey, options);
      logger.info(`✅ File retrieved: ${fileKey} from ${result.storage}`);
      return result;
    } catch (error) {
      logger.error(`Storage error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete file from storage
   */
  async deleteFile(fileKey, options = {}) {
    if (!this.storageProvider) {
      throw new Error('Storage provider not initialized');
    }

    try {
      const result = await this.storageProvider.delete(fileKey, options);
      logger.info(`✅ File deleted: ${fileKey}`);
      return result;
    } catch (error) {
      logger.error(`Storage error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get streaming generator for LLM response
   */
  getStreamingGenerator(prompt, options = {}) {
    const provider = options.provider || this.llmProvider;

    switch (provider) {
      case 'openrouter':
        return this.streaming.openrouterStream(prompt, options);
      case 'anthropic':
        return this.streaming.anthropicStream(prompt, options);
      case 'openai':
        return this.streaming.openaiStream(prompt, options);
      default:
        throw new Error(`Unknown LLM provider: ${provider}`);
    }
  }

  /**
   * Stream to callback functions (for WebSocket integration)
   */
  async streamToCallback(prompt, onChunk, onComplete, onError, options = {}) {
    try {
      const streamGenerator = this.getStreamingGenerator(prompt, options);
      await this.streaming.streamToCallback(streamGenerator, onChunk, onComplete, onError);
    } catch (error) {
      logger.error(`Streaming error: ${error.message}`);
      onError(error.message);
    }
  }

  /**
   * Get provider status
   */
  getProviderStatus() {
    const storageStatus = this.storageProvider ? this.storageProvider.getStatus() : { s3: 'unavailable', local: 'unavailable' };

    return {
      llm: {
        current: this.llmProvider,
        available: this.availableProviders.llm,
        fallbacks: this.llmFallbacks
      },
      storage: {
        current: storageStatus.preferred,
        available: this.availableProviders.storage,
        fallbacks: this.storageFallbacks,
        status: storageStatus
      },
      metrics: this.metrics
    };
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      totalRequests: this.metrics.requestCount,
      totalCost: this.metrics.totalCost,
      totalTokens: this.metrics.totalTokens,
      totalStreamingChunks: this.metrics.totalStreamingChunks,
      averageCostPerRequest: this.metrics.totalCost / Math.max(this.metrics.requestCount, 1)
    };
  }

  /**
   * Get Express handler for streaming endpoint
   */
  getStreamingHandler() {
    return this.streamingAPI.handler;
  }
}

export { ProviderAbstraction };
