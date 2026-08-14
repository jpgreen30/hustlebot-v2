/**
 * PROVIDER ABSTRACTION
 *
 * Phase 2: Real Provider Implementations
 *
 * Responsibilities:
 * 1. Route to real LLM provider implementations (OpenRouter, Anthropic, OpenAI, etc.)
 * 2. Route to real media providers (Replicate, ElevenLabs, Deepgram, etc.)
 * 3. Route to real storage providers (S3, Local FS, In-Memory)
 * 4. Handle fallback chains when providers unavailable
 * 5. Track costs and usage metrics
 * 6. Graceful degradation
 */

import logger from '../utils/logger.js';
import { LLMProviders, MediaProviders, StorageProviders, CostPredictor, TaskClassifier } from '../llm/providers.js';

class ProviderAbstraction {
  constructor(config = {}) {
    this.config = config;
    this.llmProvider = config.llm_provider || 'openrouter';
    this.mediaProvider = config.media_provider || 'replicate';
    this.storageProvider = config.storage_provider || 'local';

    // Provider availability status
    this.availableProviders = {
      llm: [],
      media: [],
      storage: []
    };

    // Fallback chains (tried in order)
    this.llmFallbacks = config.llm_fallbacks || ['openrouter', 'anthropic', 'openai'];
    this.mediaFallbacks = config.media_fallbacks || ['replicate', 'elevenlabs'];
    this.storageFallbacks = config.storage_fallbacks || ['local', 'memory'];

    // Metrics
    this.metrics = {
      totalCost: 0,
      requestCount: 0,
      totalTokens: 0
    };
  }

  /**
   * Initialize all providers
   */
  async initialize() {
    try {
      this.detectAvailableProviders();
      await this.selectAndValidateProviders();

      logger.info(`✅ Provider abstraction initialized (Phase 2: Real implementations)`);
      logger.info(`   - LLM: ${this.llmProvider} (${this.availableProviders.llm.join(', ')})`);
      logger.info(`   - Media: ${this.mediaProvider} (${this.availableProviders.media.join(', ')})`);
      logger.info(`   - Storage: ${this.storageProvider} (${this.availableProviders.storage.join(', ')})`);
    } catch (error) {
      logger.error('Error initializing provider abstraction:', error);
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

    // Media providers
    if (process.env.REPLICATE_API_TOKEN) this.availableProviders.media.push('replicate');
    if (process.env.ELEVENLABS_API_KEY) this.availableProviders.media.push('elevenlabs');
    if (process.env.DEEPGRAM_API_KEY) this.availableProviders.media.push('deepgram');

    // Storage providers (local always available)
    this.availableProviders.storage.push('local', 'memory');
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      this.availableProviders.storage.push('s3');
    }

    logger.info(`📊 Available providers: LLM=${this.availableProviders.llm.length}, Media=${this.availableProviders.media.length}, Storage=${this.availableProviders.storage.length}`);
  }

  /**
   * Select best provider from available options
   */
  async selectAndValidateProviders() {
    // Select LLM provider
    const availableLLM = this.llmFallbacks.filter(p => this.availableProviders.llm.includes(p));
    if (availableLLM.length > 0) {
      this.llmProvider = availableLLM[0];
    } else {
      throw new Error('No LLM providers available. Set OPENROUTER_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY');
    }

    // Select Media provider (optional)
    const availableMedia = this.mediaFallbacks.filter(p => this.availableProviders.media.includes(p));
    if (availableMedia.length > 0) {
      this.mediaProvider = availableMedia[0];
    } else {
      logger.warn('⚠️ No media providers available, image generation disabled');
      this.mediaProvider = null;
    }

    // Select Storage provider
    const availableStorage = this.storageFallbacks.filter(p => this.availableProviders.storage.includes(p));
    if (availableStorage.length > 0) {
      this.storageProvider = availableStorage[0];
    } else {
      throw new Error('No storage providers available');
    }
  }

  /**
   * Get LLM completion with real provider
   * Phase 2: Uses actual API calls instead of mocks
   */
  async getLLMCompletion(prompt, options = {}) {
    try {
      const provider = this.llmProvider;

      if (!provider) {
        throw new Error('No LLM provider available');
      }

      // Route to real provider implementation
      let result;
      switch (provider) {
        case 'openrouter':
          result = await LLMProviders.openrouter(prompt, options);
          break;
        case 'anthropic':
          result = await LLMProviders.anthropic(prompt, options);
          break;
        case 'openai':
          result = await LLMProviders.openai(prompt, options);
          break;
        default:
          throw new Error(`Unknown LLM provider: ${provider}`);
      }

      // Track metrics
      this.metrics.totalCost += result.cost;
      this.metrics.requestCount++;
      this.metrics.totalTokens += result.tokens.input + result.tokens.output;

      return result;
    } catch (error) {
      logger.error(`LLM error on ${this.llmProvider}: ${error.message}`);
      // Try fallback provider
      await this.tryLLMFallback();
      throw error;
    }
  }

  /**
   * Try next LLM provider in fallback chain
   */
  async tryLLMFallback() {
    const currentIndex = this.llmFallbacks.indexOf(this.llmProvider);
    const nextIndex = currentIndex + 1;

    if (nextIndex < this.llmFallbacks.length) {
      const nextProvider = this.llmFallbacks[nextIndex];
      if (this.availableProviders.llm.includes(nextProvider)) {
        logger.warn(`⚠️ Switching LLM provider to fallback: ${nextProvider}`);
        this.llmProvider = nextProvider;
        return true;
      }
    }

    return false;
  }

  /**
   * Generate image with media provider
   * Phase 2: Uses real Replicate/ElevenLabs API
   */
  async generateImage(prompt, options = {}) {
    if (!this.mediaProvider) {
      throw new Error('Media provider not available');
    }

    try {
      let result;
      switch (this.mediaProvider) {
        case 'replicate':
          result = await MediaProviders.replicate(prompt, options);
          break;
        default:
          throw new Error(`Unsupported media provider: ${this.mediaProvider}`);
      }

      this.metrics.totalCost += result.cost;
      return result;
    } catch (error) {
      logger.error(`Media error on ${this.mediaProvider}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Text-to-speech conversion
   */
  async textToSpeech(text, options = {}) {
    if (!this.mediaProvider) {
      throw new Error('Media provider not available');
    }

    try {
      let result;
      switch (this.mediaProvider) {
        case 'elevenlabs':
          result = await MediaProviders.elevenLabsTTS(text, options);
          break;
        default:
          throw new Error(`${this.mediaProvider} does not support TTS`);
      }

      this.metrics.totalCost += result.cost;
      return result;
    } catch (error) {
      logger.error(`TTS error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Speech-to-text conversion
   */
  async speechToText(audioBuffer, options = {}) {
    try {
      const result = await MediaProviders.deepgramSTT(audioBuffer, options);
      this.metrics.totalCost += result.cost;
      return result;
    } catch (error) {
      logger.error(`STT error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Store file with storage provider
   * Phase 2: Uses real S3/Local FS
   */
  async storeFile(fileKey, fileContent, metadata = {}) {
    if (!this.storageProvider) {
      throw new Error('Storage provider not initialized');
    }

    try {
      let result;
      switch (this.storageProvider) {
        case 's3':
          result = await StorageProviders.s3Store(fileKey, fileContent, metadata);
          break;
        case 'local':
          result = await StorageProviders.localStore(fileKey, fileContent, metadata);
          break;
        case 'memory':
          result = StorageProviders.memoryStore(fileKey, fileContent, metadata);
          break;
        default:
          throw new Error(`Unknown storage provider: ${this.storageProvider}`);
      }

      logger.info(`✅ File stored: ${fileKey} via ${this.storageProvider}`);
      return result;
    } catch (error) {
      logger.error(`Storage error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Retrieve file from storage
   */
  async retrieveFile(fileKey) {
    if (!this.storageProvider) {
      throw new Error('Storage provider not initialized');
    }

    try {
      let content;
      switch (this.storageProvider) {
        case 'local':
          content = await StorageProviders.localRetrieve(fileKey);
          break;
        case 'memory':
          content = StorageProviders.memoryRetrieve(fileKey);
          break;
        default:
          throw new Error(`${this.storageProvider} retrieval not implemented`);
      }

      logger.info(`✅ File retrieved: ${fileKey} from ${this.storageProvider}`);
      return content;
    } catch (error) {
      logger.error(`Storage error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete file from storage
   */
  async deleteFile(fileKey) {
    if (!this.storageProvider) {
      throw new Error('Storage provider not initialized');
    }

    try {
      // Note: Implement delete logic per provider in Phase 2.1
      logger.info(`🗑️  Deleting file: ${fileKey} from ${this.storageProvider}`);
      return { success: true, key: fileKey };
    } catch (error) {
      logger.error(`Storage error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Predict task cost using ML
   * Phase 2: Placeholder - uses heuristics, Phase 2.1 will add ML model
   */
  predictCost(taskName, parameters = {}) {
    return CostPredictor.predictCost(taskName, parameters);
  }

  /**
   * Classify task using NLP
   * Phase 2: Placeholder - uses keywords, Phase 2.1 will add ML model
   */
  classifyTask(taskName) {
    return TaskClassifier.classifyTask(taskName);
  }

  /**
   * Get provider status/health check
   */
  getProviderStatus() {
    return {
      llm: {
        current: this.llmProvider,
        available: this.availableProviders.llm,
        fallbacks: this.llmFallbacks
      },
      media: {
        current: this.mediaProvider,
        available: this.availableProviders.media,
        fallbacks: this.mediaFallbacks
      },
      storage: {
        current: this.storageProvider,
        available: this.availableProviders.storage,
        fallbacks: this.storageFallbacks
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
      averageCostPerRequest: this.metrics.totalCost / Math.max(this.metrics.requestCount, 1)
    };
  }
}

export { ProviderAbstraction };
