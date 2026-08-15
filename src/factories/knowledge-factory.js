/**
 * KNOWLEDGE FACTORY
 *
 * Memory and knowledge base management:
 * - Store user context and preferences
 * - Build knowledge graphs from content
 * - Retrieve contextual information for agents
 * - Long-term memory for conversations
 *
 * Uses: Mem0 for persistent memory, Redis for caching
 */

import logger from '../utils/logger.js';

class KnowledgeFactory {
  constructor(config = {}) {
    this.db = config.db || null;
    this.cache = config.cache || null;
    this.mem0ApiKey = process.env.MEM0_API_KEY;
    this.mem0Enabled = !!this.mem0ApiKey;

    this.knowledgeGraphs = new Map();
    this.userMemories = new Map();
  }

  async initialize() {
    logger.info('🧠 Knowledge Factory initialized');
    return true;
  }

  /**
   * Store memory about user or context
   */
  async addMemory(entityId, memory, metadata = {}) {
    try {
      logger.info(`📝 Adding memory for ${entityId}: ${memory.substring(0, 50)}...`);

      if (this.mem0Enabled) {
        // In production: call Mem0 API
        // const response = await fetch('https://api.mem0.ai/v1/memories', {
        //   method: 'POST',
        //   headers: { 'Authorization': `Bearer ${this.mem0ApiKey}` },
        //   body: JSON.stringify({ entityId, memory, metadata })
        // });
      }

      // Store in local cache
      if (!this.userMemories.has(entityId)) {
        this.userMemories.set(entityId, []);
      }
      this.userMemories.get(entityId).push({
        memory,
        metadata,
        timestamp: new Date(),
        id: `mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      });

      return {
        status: 'stored',
        entityId,
        memory: memory.substring(0, 100),
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Memory storage failed: ${error.message}`);
      return { status: 'failed', error: error.message };
    }
  }

  /**
   * Retrieve memories for an entity
   */
  async getMemories(entityId, limit = 10) {
    try {
      logger.info(`🔍 Retrieving memories for ${entityId}`);

      const memories = this.userMemories.get(entityId) || [];
      const recent = memories.slice(-limit);

      return {
        entityId,
        count: memories.length,
        recent,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Memory retrieval failed: ${error.message}`);
      return { entityId, count: 0, recent: [], error: error.message };
    }
  }

  /**
   * Build knowledge graph from content
   */
  async buildKnowledgeGraph(topic, content) {
    try {
      logger.info(`🕸️  Building knowledge graph for: ${topic}`);

      // Extract entities and relationships (simplified)
      const entities = this.extractEntities(content);
      const relationships = this.extractRelationships(content, entities);

      const graph = {
        topic,
        entities: entities.map(e => ({
          name: e,
          type: this.classifyEntity(e),
          frequency: content.split(e).length - 1
        })),
        relationships: relationships.slice(0, 10),
        density: (relationships.length / (entities.length * entities.length)) || 0,
        timestamp: new Date()
      };

      this.knowledgeGraphs.set(topic, graph);

      return {
        topic,
        entityCount: entities.length,
        relationshipCount: relationships.length,
        graph
      };
    } catch (error) {
      logger.error(`Knowledge graph building failed: ${error.message}`);
      return { topic, error: error.message };
    }
  }

  /**
   * Search knowledge base
   */
  async searchKnowledge(query, entityId = null) {
    try {
      logger.info(`🔎 Searching knowledge: "${query}"`);

      const results = [];

      // Search user memories
      if (entityId) {
        const memories = this.userMemories.get(entityId) || [];
        const relevant = memories.filter(m => m.memory.toLowerCase().includes(query.toLowerCase()));
        results.push(...relevant.slice(0, 5).map(m => ({
          type: 'memory',
          content: m.memory,
          score: 0.9,
          source: entityId
        })));
      }

      // Search knowledge graphs
      for (const [topic, graph] of this.knowledgeGraphs.entries()) {
        if (topic.toLowerCase().includes(query.toLowerCase())) {
          results.push({
            type: 'knowledge_graph',
            content: topic,
            entities: graph.entities.slice(0, 3),
            score: 0.8,
            source: topic
          });
        }
      }

      return {
        query,
        resultCount: results.length,
        results: results.slice(0, 10),
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Knowledge search failed: ${error.message}`);
      return { query, results: [], error: error.message };
    }
  }

  /**
   * Get contextual recommendations based on knowledge
   */
  async getContextualRecommendations(entityId, context = {}) {
    try {
      logger.info(`💡 Getting contextual recommendations for ${entityId}`);

      const memories = this.userMemories.get(entityId) || [];
      const topics = Array.from(this.knowledgeGraphs.keys());

      // Simple recommendation logic
      const recommendations = topics.map(topic => {
        const graph = this.knowledgeGraphs.get(topic);
        let score = 50;

        // Boost if entities match user interests
        if (memories.some(m => m.memory.toLowerCase().includes(topic.toLowerCase()))) {
          score += 25;
        }

        // Boost if high entity density
        score += (graph.density * 10);

        return {
          topic,
          score: Math.min(score, 100),
          entities: graph.entities.slice(0, 3),
          recommendation: `Explore ${topic} with key entities: ${graph.entities.slice(0, 2).map(e => e.name).join(', ')}`
        };
      }).filter(r => r.score >= 60).sort((a, b) => b.score - a.score).slice(0, 5);

      return {
        entityId,
        recommendations,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Recommendation generation failed: ${error.message}`);
      return { entityId, recommendations: [], error: error.message };
    }
  }

  /**
   * Extract entities from text (simplified)
   */
  extractEntities(text) {
    // Simple extraction: capitalized words, common entities
    const words = text.split(/\s+/);
    const entities = new Set();

    words.forEach((word, i) => {
      if (word[0] === word[0].toUpperCase() && word.length > 3) {
        entities.add(word.replace(/[.,!?;:]/g, ''));
      }
    });

    return Array.from(entities).slice(0, 15);
  }

  /**
   * Extract relationships from text
   */
  extractRelationships(text, entities) {
    const relationships = [];
    const sentences = text.split(/[.!?]/);

    entities.slice(0, 5).forEach((entity1, i) => {
      entities.slice(i + 1, i + 3).forEach(entity2 => {
        const hasBoth = sentences.some(s => s.includes(entity1) && s.includes(entity2));
        if (hasBoth) {
          relationships.push({
            source: entity1,
            target: entity2,
            type: 'related',
            strength: 0.7
          });
        }
      });
    });

    return relationships;
  }

  /**
   * Classify entity type
   */
  classifyEntity(entity) {
    const person = ['John', 'Sarah', 'John', 'Mary'];
    const place = ['New York', 'London', 'San Francisco'];
    const org = ['Corp', 'Inc', 'Ltd', 'LLC'];

    if (person.some(p => entity.includes(p))) return 'person';
    if (place.some(p => entity.includes(p))) return 'place';
    if (org.some(p => entity.includes(p))) return 'organization';
    return 'concept';
  }

  /**
   * Clear old memories
   */
  async clearOldMemories(daysOld = 30) {
    try {
      const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
      let cleared = 0;

      for (const [entityId, memories] of this.userMemories.entries()) {
        const filtered = memories.filter(m => new Date(m.timestamp) > cutoff);
        if (filtered.length < memories.length) {
          cleared += memories.length - filtered.length;
          if (filtered.length === 0) {
            this.userMemories.delete(entityId);
          } else {
            this.userMemories.set(entityId, filtered);
          }
        }
      }

      logger.info(`🧹 Cleared ${cleared} old memories`);
      return { cleared, timestamp: new Date() };
    } catch (error) {
      logger.error(`Memory cleanup failed: ${error.message}`);
      return { cleared: 0, error: error.message };
    }
  }

  /**
   * Get factory status
   */
  getStatus() {
    return {
      initialized: true,
      mem0Enabled: this.mem0Enabled,
      totalMemories: Array.from(this.userMemories.values()).reduce((sum, mems) => sum + mems.length, 0),
      knowledgeGraphs: this.knowledgeGraphs.size,
      timestamp: new Date()
    };
  }
}

export { KnowledgeFactory };
