/**
 * CAPABILITY REGISTRY
 *
 * One place that knows what the platform can do, who provides it, what it
 * costs, and what to fall back to. Workflows ask for a capability by id
 * ("web.scrape") rather than calling a vendor directly, which is what makes
 * tools and providers replaceable.
 *
 * Each registration carries the metadata the Master Build Spec requires:
 * capability id, name, version, provider, MCP tool, permissions,
 * inputs/outputs, expected cost, latency, reliability, supported verticals,
 * failure modes, and fallback provider.
 *
 *     registry.register({
 *       capabilityId: 'web.scrape',
 *       provider: 'firecrawl',
 *       handler: async (input) => scraper.scrapePage(input.url),
 *       isAvailable: () => Boolean(process.env.FIRECRAWL_API_KEY),
 *       ...
 *     });
 *
 *     await registry.invoke('web.scrape', { url }, { vertical: 'babytobloom' });
 *
 * Several providers may register the same capability id. resolve() ranks the
 * available ones by observed reliability, cost and latency, and invoke()
 * walks that ranking so a failing provider falls through to the next.
 */

import logger from '../utils/logger.js';

const REQUIRED_FIELDS = ['capabilityId', 'name', 'provider', 'handler'];

/** Minimal schema check - enough to catch bad calls without a new dependency. */
function validateInput(schema, input) {
  if (!schema || typeof schema !== 'object') return [];

  const errors = [];
  const props = schema.properties || {};
  const required = schema.required || [];

  for (const key of required) {
    if (input?.[key] === undefined || input?.[key] === null || input?.[key] === '') {
      errors.push(`missing required field "${key}"`);
    }
  }

  for (const [key, spec] of Object.entries(props)) {
    const value = input?.[key];
    if (value === undefined || value === null) continue;

    if (spec.type) {
      const actual = Array.isArray(value) ? 'array' : typeof value;
      if (spec.type !== actual) {
        errors.push(`field "${key}" should be ${spec.type}, got ${actual}`);
      }
    }
    if (spec.enum && !spec.enum.includes(value)) {
      errors.push(`field "${key}" must be one of: ${spec.enum.join(', ')}`);
    }
  }

  return errors;
}

class CapabilityRegistry {
  constructor(config = {}) {
    // capabilityId -> array of provider implementations
    this.capabilities = new Map();
    this.weights = {
      reliability: 1,
      cost: 0.5,
      latency: 0.3,
      ...(config.weights || {})
    };
    // Optional sink for invocation records - the seam audit logging and the
    // cost optimizer will hang off.
    this.onInvocation = config.onInvocation || null;
  }

  /**
   * Register one provider's implementation of a capability.
   */
  register(descriptor) {
    for (const field of REQUIRED_FIELDS) {
      if (!descriptor[field]) {
        throw new Error(`Capability registration missing required field: ${field}`);
      }
    }
    if (typeof descriptor.handler !== 'function') {
      throw new Error(`Capability ${descriptor.capabilityId}: handler must be a function`);
    }

    const entry = {
      capabilityId: descriptor.capabilityId,
      name: descriptor.name,
      description: descriptor.description || '',
      version: descriptor.version || '1.0.0',
      provider: descriptor.provider,
      mcpTool: descriptor.mcpTool || null,
      permissions: descriptor.permissions || [],
      inputs: descriptor.inputs || null,
      outputs: descriptor.outputs || null,
      expectedCost: descriptor.expectedCost ?? 0,
      expectedLatencyMs: descriptor.expectedLatencyMs ?? 1000,
      declaredReliability: descriptor.reliability ?? 0.95,
      supportedVerticals: descriptor.supportedVerticals || ['*'],
      failureModes: descriptor.failureModes || [],
      fallbackProvider: descriptor.fallbackProvider || null,
      requiresApproval: descriptor.requiresApproval || false,
      handler: descriptor.handler,
      isAvailable: descriptor.isAvailable || (() => true),
      sideEffect: descriptor.sideEffect || null,
      tags: descriptor.tags || [],
      retryPolicy: descriptor.retryPolicy || null,
      idempotent: descriptor.idempotent ?? null,
      prerequisites: descriptor.prerequisites || [],
      costCategory: descriptor.costCategory || null,
      // Observed, as opposed to declared. Routing prefers observed once
      // there is enough evidence to trust it.
      stats: {
        invocations: 0,
        successes: 0,
        failures: 0,
        totalLatencyMs: 0,
        totalCost: 0,
        lastError: null,
        lastInvokedAt: null
      }
    };

    const existing = this.capabilities.get(entry.capabilityId) || [];
    const duplicate = existing.findIndex((e) => e.provider === entry.provider);
    if (duplicate >= 0) {
      existing[duplicate] = entry;
      logger.info(`🔧 Capability re-registered: ${entry.capabilityId} (${entry.provider})`);
    } else {
      existing.push(entry);
      logger.info(`🔧 Capability registered: ${entry.capabilityId} (${entry.provider})`);
    }
    this.capabilities.set(entry.capabilityId, existing);

    return entry;
  }

  registerAll(descriptors = []) {
    return descriptors.map((d) => this.register(d));
  }

  has(capabilityId) {
    return this.capabilities.has(capabilityId);
  }

  /**
   * Observed reliability once there is enough evidence, otherwise the
   * declared figure. Blended in between so one early failure does not
   * permanently sideline a provider.
   */
  reliabilityOf(entry) {
    const { invocations, successes } = entry.stats;
    if (invocations === 0) return entry.declaredReliability;

    const observed = successes / invocations;
    const confidence = Math.min(1, invocations / 10);
    return entry.declaredReliability * (1 - confidence) + observed * confidence;
  }

  averageLatency(entry) {
    const { invocations, totalLatencyMs } = entry.stats;
    return invocations > 0 ? totalLatencyMs / invocations : entry.expectedLatencyMs;
  }

  /**
   * Rank providers for a capability. Availability and vertical support are
   * hard filters; cost, latency and reliability are scored.
   */
  resolve(capabilityId, options = {}) {
    const entries = this.capabilities.get(capabilityId);
    if (!entries || entries.length === 0) return [];

    const vertical = options.vertical || '*';
    const maxCost = options.maxCost ?? Infinity;

    const eligible = entries.filter((entry) => {
      if (options.provider && entry.provider !== options.provider) return false;
      if (entry.expectedCost > maxCost) return false;

      const supports =
        entry.supportedVerticals.includes('*') ||
        entry.supportedVerticals.includes(vertical);
      if (!supports) return false;

      try {
        return entry.isAvailable() !== false;
      } catch (error) {
        logger.warn(`Availability check failed for ${capabilityId}/${entry.provider}: ${error.message}`);
        return false;
      }
    });

    const costs = eligible.map((e) => e.expectedCost);
    const latencies = eligible.map((e) => this.averageLatency(e));
    const maxSeenCost = Math.max(...costs, 0.0001);
    const maxSeenLatency = Math.max(...latencies, 1);

    return eligible
      .map((entry) => {
        const reliability = this.reliabilityOf(entry);
        const score =
          this.weights.reliability * reliability -
          this.weights.cost * (entry.expectedCost / maxSeenCost) -
          this.weights.latency * (this.averageLatency(entry) / maxSeenLatency);
        return { entry, score, reliability };
      })
      .sort((a, b) => b.score - a.score)
      .map((ranked) => ranked.entry);
  }

  /**
   * Run a capability, falling through the ranked providers on failure.
   *
   * context: { vertical, permissions, jobId, projectId, actor, provider,
   *            maxCost, allowFallback }
   */
  async invoke(capabilityId, input = {}, context = {}) {
    const candidates = this.resolve(capabilityId, {
      vertical: context.vertical,
      provider: context.provider,
      maxCost: context.maxCost
    });

    if (candidates.length === 0) {
      const known = this.capabilities.has(capabilityId);
      throw new Error(
        known
          ? `No available provider for capability "${capabilityId}" (all unavailable or filtered out)`
          : `Unknown capability: "${capabilityId}"`
      );
    }

    const attempts = [];
    const allowFallback = context.allowFallback !== false;
    const providers = allowFallback ? candidates : [candidates[0]];

    for (const entry of providers) {
      // Permissions are enforced per provider, since two providers of the
      // same capability may need different grants.
      const missing = entry.permissions.filter(
        (p) => !(context.permissions || []).includes(p)
      );
      if (missing.length > 0 && !context.bypassPermissions) {
        attempts.push({
          provider: entry.provider,
          error: `missing permission(s): ${missing.join(', ')}`
        });
        continue;
      }

      const inputErrors = validateInput(entry.inputs, input);
      if (inputErrors.length > 0) {
        // A bad input is the caller's fault, so don't burn other providers.
        throw new Error(`Invalid input for ${capabilityId}: ${inputErrors.join('; ')}`);
      }

      const startedAt = Date.now();
      try {
        const result = await entry.handler(input, context);
        const latencyMs = Date.now() - startedAt;

        entry.stats.invocations++;
        entry.stats.successes++;
        entry.stats.totalLatencyMs += latencyMs;
        entry.stats.totalCost += entry.expectedCost;
        entry.stats.lastInvokedAt = Date.now();

        const record = {
          capabilityId,
          provider: entry.provider,
          success: true,
          latencyMs,
          cost: entry.expectedCost,
          jobId: context.jobId || null,
          projectId: context.projectId || null,
          actor: context.actor || 'system',
          attempts: attempts.length,
          at: Date.now()
        };
        this.emit(record);

        return { ...record, result };
      } catch (error) {
        const latencyMs = Date.now() - startedAt;
        entry.stats.invocations++;
        entry.stats.failures++;
        entry.stats.totalLatencyMs += latencyMs;
        entry.stats.lastError = error.message;
        entry.stats.lastInvokedAt = Date.now();

        attempts.push({ provider: entry.provider, error: error.message });
        logger.warn(
          `Capability ${capabilityId} failed via ${entry.provider}: ${error.message}` +
          (allowFallback ? ' - trying next provider' : '')
        );

        this.emit({
          capabilityId,
          provider: entry.provider,
          success: false,
          latencyMs,
          cost: 0,
          error: error.message,
          jobId: context.jobId || null,
          projectId: context.projectId || null,
          actor: context.actor || 'system',
          at: Date.now()
        });
      }
    }

    const detail = attempts.map((a) => `${a.provider}: ${a.error}`).join('; ');
    throw new Error(`Capability "${capabilityId}" failed on every provider (${detail})`);
  }

  emit(record) {
    if (!this.onInvocation) return;
    try {
      this.onInvocation(record);
    } catch (error) {
      logger.error(`Capability invocation hook failed: ${error.message}`);
    }
  }

  /**
   * Public view of a capability - everything except the handler.
   */
  describe(capabilityId) {
    const entries = this.capabilities.get(capabilityId);
    if (!entries) return null;

    return {
      capabilityId,
      providers: entries.map((entry) => ({
        provider: entry.provider,
        name: entry.name,
        description: entry.description,
        version: entry.version,
        mcpTool: entry.mcpTool,
        permissions: entry.permissions,
        inputs: entry.inputs,
        outputs: entry.outputs,
        expectedCost: entry.expectedCost,
        expectedLatencyMs: entry.expectedLatencyMs,
        reliability: Number(this.reliabilityOf(entry).toFixed(4)),
        observedLatencyMs: Math.round(this.averageLatency(entry)),
        supportedVerticals: entry.supportedVerticals,
        failureModes: entry.failureModes,
        fallbackProvider: entry.fallbackProvider,
        requiresApproval: entry.requiresApproval,
        sideEffect: entry.sideEffect,
        tags: entry.tags,
        retryPolicy: entry.retryPolicy,
        idempotent: entry.idempotent,
        prerequisites: entry.prerequisites,
        costCategory: entry.costCategory,
        available: (() => {
          try { return entry.isAvailable() !== false; } catch { return false; }
        })(),
        stats: { ...entry.stats }
      }))
    };
  }

  /**
   * List capabilities, optionally narrowed by vertical, provider, or
   * whether a usable provider exists right now.
   */
  list(filter = {}) {
    const out = [];

    for (const [capabilityId, entries] of this.capabilities.entries()) {
      const matching = entries.filter((entry) => {
        if (filter.provider && entry.provider !== filter.provider) return false;
        if (filter.vertical) {
          const supports =
            entry.supportedVerticals.includes('*') ||
            entry.supportedVerticals.includes(filter.vertical);
          if (!supports) return false;
        }
        return true;
      });
      if (matching.length === 0) continue;

      const available = this.resolve(capabilityId, { vertical: filter.vertical });
      if (filter.availableOnly && available.length === 0) continue;

      out.push({
        capabilityId,
        providers: matching.map((e) => e.provider),
        available: available.length > 0,
        preferredProvider: available[0]?.provider || null,
        requiresApproval: matching.some((e) => e.requiresApproval),
        permissions: [...new Set(matching.flatMap((e) => e.permissions))],
        supportedVerticals: [...new Set(matching.flatMap((e) => e.supportedVerticals))]
      });
    }

    return out.sort((a, b) => a.capabilityId.localeCompare(b.capabilityId));
  }

  /**
   * Roll-up for the status endpoint and, later, KPI reporting.
   */
  getStats() {
    let invocations = 0;
    let successes = 0;
    let failures = 0;
    let totalCost = 0;
    let providerCount = 0;
    let availableCount = 0;

    for (const [capabilityId, entries] of this.capabilities.entries()) {
      providerCount += entries.length;
      if (this.resolve(capabilityId).length > 0) availableCount++;
      for (const entry of entries) {
        invocations += entry.stats.invocations;
        successes += entry.stats.successes;
        failures += entry.stats.failures;
        totalCost += entry.stats.totalCost;
      }
    }

    return {
      capabilities: this.capabilities.size,
      availableCapabilities: availableCount,
      providers: providerCount,
      invocations,
      successes,
      failures,
      successRate: invocations > 0 ? Number((successes / invocations).toFixed(4)) : null,
      totalCost: Number(totalCost.toFixed(4))
    };
  }

  unregister(capabilityId, provider = null) {
    if (!provider) return this.capabilities.delete(capabilityId);

    const entries = this.capabilities.get(capabilityId);
    if (!entries) return false;

    const remaining = entries.filter((e) => e.provider !== provider);
    if (remaining.length === entries.length) return false;

    if (remaining.length === 0) this.capabilities.delete(capabilityId);
    else this.capabilities.set(capabilityId, remaining);
    return true;
  }
}

export { CapabilityRegistry, validateInput };
