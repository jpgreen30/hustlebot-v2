/**
 * MEMORY SYSTEM
 *
 * Persistent learning, knowledge storage, and playbook generation
 */

import logger from '../utils/logger.js';

class MemorySystem {
  constructor(config = {}) {
    this.mem0ApiKey = process.env.MEM0_API_KEY;
    this.mem0Enabled = !!this.mem0ApiKey;
    this.memories = new Map();
    this.learnings = new Map();
    this.playbooks = new Map();
    this.entities = new Map();
  }

  async initialize() {
    logger.info('🧠 Memory System initialized');
    if (!this.mem0Enabled) {
      logger.warn('⚠️  MEM0_API_KEY not set');
    }
    return true;
  }

  /**
   * Add memory
   */
  async addMemory(content, category = 'general', metadata = {}) {
    try {
      logger.info(`💾 Adding memory: ${content.substring(0, 50)}...`);

      const memory = {
        id: `mem_${Date.now()}`,
        content,
        category,
        metadata,
        createdAt: new Date(),
        accessCount: 0,
        lastAccessed: null,
        tags: metadata.tags || []
      };

      this.memories.set(memory.id, memory);

      return {
        memoryId: memory.id,
        content: content.substring(0, 50),
        category,
        stored: true,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Memory addition failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Retrieve memory
   */
  async getMemory(query, limit = 5) {
    try {
      logger.info(`🔍 Retrieving memories for: ${query}`);

      let results = Array.from(this.memories.values()).filter(m =>
        m.content.toLowerCase().includes(query.toLowerCase()) ||
        m.tags.some(t => t.toLowerCase().includes(query.toLowerCase()))
      ).slice(0, limit);

      // Update access count
      for (const mem of results) {
        mem.accessCount++;
        mem.lastAccessed = new Date();
      }

      return {
        query,
        resultsCount: results.length,
        memories: results.map(m => ({
          memoryId: m.id,
          content: m.content.substring(0, 100),
          category: m.category,
          tags: m.tags
        })),
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Memory retrieval failed: ${error.message}`);
      return { query, error: error.message };
    }
  }

  /**
   * Record learning
   */
  async recordLearning(title, description, results, context = {}) {
    try {
      logger.info(`📚 Recording learning: ${title}`);

      const learning = {
        id: `learn_${Date.now()}`,
        title,
        description,
        results,
        context,
        recordedAt: new Date(),
        successRate: results.success ? 1.0 : 0.0,
        keywords: this.extractKeywords(title, description)
      };

      this.learnings.set(learning.id, learning);

      return {
        learningId: learning.id,
        title,
        recorded: true,
        successRate: learning.successRate,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Learning recording failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Generate playbook from learnings
   */
  async generatePlaybook(topic, minSuccessRate = 0.7) {
    try {
      logger.info(`📖 Generating playbook for: ${topic}`);

      const relevantLearnings = Array.from(this.learnings.values())
        .filter(l =>
          l.keywords.some(k => topic.toLowerCase().includes(k.toLowerCase())) &&
          l.successRate >= minSuccessRate
        )
        .sort((a, b) => b.successRate - a.successRate)
        .slice(0, 10);

      const playbook = {
        id: `playbook_${Date.now()}`,
        topic,
        steps: this.extractSteps(relevantLearnings),
        successRate: relevantLearnings.length > 0
          ? (relevantLearnings.reduce((sum, l) => sum + l.successRate, 0) / relevantLearnings.length)
          : 0,
        basedOnLearnings: relevantLearnings.length,
        createdAt: new Date(),
        lastUsed: null,
        usageCount: 0
      };

      this.playbooks.set(playbook.id, playbook);

      return {
        playbookId: playbook.id,
        topic,
        steps: playbook.steps.length,
        successRate: (playbook.successRate * 100).toFixed(1),
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Playbook generation failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Get playbook
   */
  async getPlaybook(playbookId) {
    try {
      if (!this.playbooks.has(playbookId)) {
        throw new Error(`Playbook ${playbookId} not found`);
      }

      const playbook = this.playbooks.get(playbookId);
      playbook.lastUsed = new Date();
      playbook.usageCount++;

      return {
        playbookId,
        topic: playbook.topic,
        steps: playbook.steps,
        successRate: (playbook.successRate * 100).toFixed(1),
        usageCount: playbook.usageCount,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Playbook retrieval failed: ${error.message}`);
      return { playbookId, error: error.message };
    }
  }

  /**
   * Track entity relationships
   */
  async trackEntity(entityName, entityType, properties = {}) {
    try {
      logger.info(`🔗 Tracking entity: ${entityName}`);

      const entity = {
        id: `entity_${Date.now()}`,
        name: entityName,
        type: entityType,
        properties,
        relationships: [],
        createdAt: new Date(),
        lastUpdated: new Date()
      };

      this.entities.set(entity.id, entity);

      return {
        entityId: entity.id,
        name: entityName,
        type: entityType,
        tracked: true,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Entity tracking failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Link entities
   */
  async linkEntities(entityId1, entityId2, relationshipType) {
    try {
      if (!this.entities.has(entityId1) || !this.entities.has(entityId2)) {
        throw new Error('One or both entities not found');
      }

      const entity1 = this.entities.get(entityId1);
      const entity2 = this.entities.get(entityId2);

      entity1.relationships.push({
        targetId: entityId2,
        type: relationshipType,
        createdAt: new Date()
      });

      entity2.relationships.push({
        targetId: entityId1,
        type: `inverse_${relationshipType}`,
        createdAt: new Date()
      });

      logger.info(`🔗 Linked entities: ${entity1.name} → ${entity2.name}`);

      return {
        entity1Id: entityId1,
        entity2Id: entityId2,
        relationshipType,
        linked: true,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Entity linking failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Get knowledge graph
   */
  async getKnowledgeGraph(entityId, depth = 2) {
    try {
      if (!this.entities.has(entityId)) {
        throw new Error(`Entity ${entityId} not found`);
      }

      const entity = this.entities.get(entityId);
      const graph = {
        root: {
          id: entity.id,
          name: entity.name,
          type: entity.type
        },
        relationships: []
      };

      for (const rel of entity.relationships.slice(0, depth * 5)) {
        if (this.entities.has(rel.targetId)) {
          const target = this.entities.get(rel.targetId);
          graph.relationships.push({
            from: entity.id,
            to: rel.targetId,
            type: rel.relationshipType,
            targetName: target.name
          });
        }
      }

      return {
        entityId,
        graph,
        nodeCount: graph.relationships.length + 1,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Knowledge graph retrieval failed: ${error.message}`);
      return { entityId, error: error.message };
    }
  }

  /**
   * Search learnings
   */
  async searchLearnings(query) {
    try {
      logger.info(`🔍 Searching learnings for: ${query}`);

      const results = Array.from(this.learnings.values())
        .filter(l =>
          l.title.toLowerCase().includes(query.toLowerCase()) ||
          l.description.toLowerCase().includes(query.toLowerCase()) ||
          l.keywords.some(k => k.toLowerCase().includes(query.toLowerCase()))
        )
        .sort((a, b) => b.successRate - a.successRate);

      return {
        query,
        resultsCount: results.length,
        learnings: results.slice(0, 10).map(l => ({
          learningId: l.id,
          title: l.title,
          successRate: (l.successRate * 100).toFixed(1),
          recordedAt: l.recordedAt
        })),
        timestamp: new Date()
      };
    } catch (error) {
      logger.error(`Learning search failed: ${error.message}`);
      return { query, error: error.message };
    }
  }

  /**
   * Extract keywords from text
   */
  extractKeywords(title, description) {
    const text = `${title} ${description}`.toLowerCase();
    const words = text.split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 10);
    return words;
  }

  /**
   * Extract steps from learnings
   */
  extractSteps(learnings) {
    const steps = [];
    for (let i = 0; i < Math.min(learnings.length, 5); i++) {
      steps.push({
        step: i + 1,
        title: learnings[i].title,
        description: learnings[i].description,
        successRate: (learnings[i].successRate * 100).toFixed(1)
      });
    }
    return steps;
  }

  getStatus() {
    return {
      initialized: true,
      mem0Enabled: this.mem0Enabled,
      totalMemories: this.memories.size,
      totalLearnings: this.learnings.size,
      totalPlaybooks: this.playbooks.size,
      totalEntities: this.entities.size,
      timestamp: new Date()
    };
  }
}

export { MemorySystem };
