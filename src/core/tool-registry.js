/**
 * TOOL REGISTRY
 *
 * Responsibilities:
 * 1. Centralized tool definition management
 * 2. JSON Schema validation for inputs/outputs
 * 3. Tool invocation bindings and dispatch
 * 4. Tool metadata (description, category, examples)
 * 5. Support for dynamic tool loading and versioning
 */

import logger from '../utils/logger.js';

class ToolRegistry {
  constructor(db) {
    this.db = db;
    this.tools = new Map(); // key = "tool_name:version"
    this.implementations = new Map(); // key = "tool_name:version", value = function
    this.initialized = false;
  }

  /**
   * Initialize tool registry from database and filesystem
   */
  async initialize(toolImplementations = {}) {
    try {
      const rows = await this.db.getAllTools();
      this.tools.clear();

      for (const row of rows) {
        const key = `${row.name}:${row.version}`;
        this.tools.set(key, {
          id: row.id,
          name: row.name,
          version: row.version,
          description: row.description,
          category: row.category,
          input_schema: row.input_schema,
          output_schema: row.output_schema,
          examples: row.examples,
          status: row.status,
          created_at: row.created_at,
          updated_at: row.updated_at
        });

        // Register implementation if provided
        if (toolImplementations[key]) {
          this.implementations.set(key, toolImplementations[key]);
        }
      }

      this.initialized = true;
      logger.info(`✅ Tool Registry initialized with ${this.tools.size} tools`);
    } catch (error) {
      logger.error('Error initializing tool registry:', error);
      throw error;
    }
  }

  /**
   * Register a new tool definition
   */
  async registerTool(name, version, metadata) {
    try {
      const {
        description = '',
        category = 'general',
        input_schema = {},
        output_schema = {},
        examples = [],
        status = 'active'
      } = metadata;

      const result = await this.db.registerTool({
        name,
        version,
        description,
        category,
        input_schema,
        output_schema,
        examples,
        status
      });

      const key = `${name}:${version}`;
      this.tools.set(key, {
        id: result.id,
        name,
        version,
        description,
        category,
        input_schema,
        output_schema,
        examples,
        status,
        created_at: result.created_at,
        updated_at: result.updated_at
      });

      logger.info(`✅ Tool registered: ${name}@${version}`);
      return result;
    } catch (error) {
      logger.error('Error registering tool:', error);
      throw error;
    }
  }

  /**
   * Register tool implementation
   */
  registerImplementation(toolName, version, impl) {
    const key = `${toolName}:${version}`;
    if (!this.tools.has(key)) {
      logger.warn(`Tool not found for implementation: ${toolName}@${version}`);
      return false;
    }

    this.implementations.set(key, impl);
    logger.info(`✅ Implementation registered: ${toolName}@${version}`);
    return true;
  }

  /**
   * Get tool definition by name and version
   */
  getTool(toolName, version = 'latest') {
    let key = `${toolName}:${version}`;

    // If version is 'latest', find the latest active version
    if (version === 'latest') {
      let latestVersion = null;
      let latestKey = null;

      for (const [k, tool] of this.tools.entries()) {
        if (tool.name === toolName && tool.status === 'active') {
          if (!latestVersion || tool.version > latestVersion) {
            latestVersion = tool.version;
            latestKey = k;
          }
        }
      }

      key = latestKey || key;
    }

    return this.tools.get(key) || null;
  }

  /**
   * Get tool implementation
   */
  getImplementation(toolName, version = 'latest') {
    let key = `${toolName}:${version}`;

    if (version === 'latest') {
      const tool = this.getTool(toolName, 'latest');
      if (tool) {
        key = `${tool.name}:${tool.version}`;
      }
    }

    return this.implementations.get(key) || null;
  }

  /**
   * Invoke a tool with validation
   */
  async invokeTool(toolName, version = 'latest', input = {}) {
    try {
      const tool = this.getTool(toolName, version);
      if (!tool) {
        throw new Error(`Tool not found: ${toolName}@${version}`);
      }

      if (tool.status !== 'active') {
        throw new Error(`Tool is ${tool.status}: ${toolName}@${version}`);
      }

      // Validate input against schema
      const inputValid = this.validateInput(tool.input_schema, input);
      if (!inputValid.valid) {
        throw new Error(`Input validation failed: ${inputValid.error}`);
      }

      // Get implementation
      const impl = this.getImplementation(toolName, tool.version);
      if (!impl || typeof impl !== 'function') {
        throw new Error(`No implementation found: ${toolName}@${tool.version}`);
      }

      // Execute
      logger.info(`🔧 Invoking tool: ${toolName}@${tool.version}`);
      const result = await impl(input);

      // Validate output against schema
      const outputValid = this.validateOutput(tool.output_schema, result);
      if (!outputValid.valid) {
        logger.warn(`Output validation warning: ${outputValid.error}`);
      }

      return {
        success: true,
        tool: toolName,
        version: tool.version,
        result
      };
    } catch (error) {
      logger.error(`Error invoking tool ${toolName}@${version}:`, error);
      return {
        success: false,
        tool: toolName,
        error: error.message
      };
    }
  }

  /**
   * Validate input against JSON schema
   */
  validateInput(schema, input) {
    if (!schema || Object.keys(schema).length === 0) {
      return { valid: true };
    }

    // Simplified schema validation
    // In production, use ajv or similar
    for (const [key, spec] of Object.entries(schema)) {
      if (spec.required && !(key in input)) {
        return { valid: false, error: `Missing required field: ${key}` };
      }

      if (spec.type && input[key] && typeof input[key] !== spec.type) {
        return { valid: false, error: `Type mismatch for ${key}: expected ${spec.type}` };
      }
    }

    return { valid: true };
  }

  /**
   * Validate output against JSON schema
   */
  validateOutput(schema, output) {
    if (!schema || Object.keys(schema).length === 0) {
      return { valid: true };
    }

    // Simplified validation
    for (const [key, spec] of Object.entries(schema)) {
      if (spec.required && !(key in output)) {
        return { valid: false, error: `Missing required output field: ${key}` };
      }

      if (spec.type && output[key] && typeof output[key] !== spec.type) {
        return { valid: false, error: `Type mismatch in output ${key}: expected ${spec.type}` };
      }
    }

    return { valid: true };
  }

  /**
   * Find tools by category
   */
  getToolsByCategory(category) {
    const results = [];
    for (const [key, tool] of this.tools.entries()) {
      if (tool.category === category && tool.status === 'active') {
        results.push(tool);
      }
    }
    return results;
  }

  /**
   * List all tools (with optional filter)
   */
  listTools(filter = {}) {
    const results = [];

    for (const [key, tool] of this.tools.entries()) {
      let match = true;

      if (filter.status && tool.status !== filter.status) {
        match = false;
      }
      if (filter.category && tool.category !== filter.category) {
        match = false;
      }

      if (match) {
        results.push({
          name: tool.name,
          version: tool.version,
          description: tool.description,
          category: tool.category,
          status: tool.status,
          examples: tool.examples
        });
      }
    }

    return results;
  }

  /**
   * Update tool status
   */
  async updateToolStatus(toolName, version, newStatus) {
    try {
      await this.db.updateToolStatus(toolName, version, newStatus);

      const key = `${toolName}:${version}`;
      const tool = this.tools.get(key);
      if (tool) {
        tool.status = newStatus;
        tool.updated_at = new Date().toISOString();
      }

      logger.info(`✅ Tool status updated: ${toolName}@${version} → ${newStatus}`);
    } catch (error) {
      logger.error('Error updating tool status:', error);
      throw error;
    }
  }

  /**
   * Get registry stats
   */
  getStats() {
    const stats = {
      total: this.tools.size,
      implemented: this.implementations.size,
      by_category: {},
      by_status: {}
    };

    for (const [key, tool] of this.tools.entries()) {
      // By category
      stats.by_category[tool.category] = (stats.by_category[tool.category] || 0) + 1;

      // By status
      stats.by_status[tool.status] = (stats.by_status[tool.status] || 0) + 1;
    }

    return stats;
  }
}

export { ToolRegistry };
