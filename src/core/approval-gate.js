/**
 * HUMAN APPROVAL LAYER
 *
 * Decides which actions a human must sign off on, holds those requests
 * durably while it waits, and records who decided what.
 *
 * The spec names the categories that need approval: destructive production
 * deletion, large spend, new paid vendors, domain purchases, large outbound
 * campaigns, pricing changes, sensitive data exports, and uncertain
 * compliance workflows. Those ship as policies here; more can be added with
 * addPolicy().
 *
 *     const decision = await gate.evaluate({ capabilityId, input, estimatedCost });
 *     if (decision.required) {
 *       const req = await gate.request({ capabilityId, input, reasons: decision.reasons });
 *       // ... graph pauses until someone approves, rejects, or modifies req.id
 *     }
 *
 * Requests persist to Redis so a pending approval survives a restart, and
 * every decision is stored with who made it and when - the first durable
 * audit trail in the platform.
 */

import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import logger from '../utils/logger.js';

const APPROVAL_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled'
};

const TERMINAL = new Set([
  APPROVAL_STATUS.APPROVED,
  APPROVAL_STATUS.REJECTED,
  APPROVAL_STATUS.EXPIRED,
  APPROVAL_STATUS.CANCELLED
]);

/**
 * The spec's consequential-action categories, as policies. Each returns a
 * reason string when it wants approval, or null when it does not care.
 */
function defaultPolicies({ spendThreshold, campaignThreshold }) {
  return [
    {
      name: 'capability-flagged',
      check: ({ capability }) =>
        capability?.requiresApproval
          ? `${capability.capabilityId} is flagged as requiring approval`
          : null
    },
    {
      name: 'large-spend',
      check: ({ estimatedCost }) =>
        estimatedCost > spendThreshold
          ? `Estimated spend $${estimatedCost} is over the $${spendThreshold} threshold`
          : null
    },
    {
      name: 'destructive',
      check: ({ capabilityId, input }) =>
        input?.destructive === true || /\b(delete|destroy|purge|drop|wipe)\b/i.test(capabilityId)
          ? 'Destructive action against production data'
          : null
    },
    {
      name: 'large-campaign',
      check: ({ input }) => {
        const size =
          (Array.isArray(input?.recipients) && input.recipients.length) ||
          (Array.isArray(input?.leads) && input.leads.length) ||
          input?.audienceSize ||
          0;
        return size > campaignThreshold
          ? `Outbound campaign to ${size} recipients is over the ${campaignThreshold} threshold`
          : null;
      }
    },
    {
      name: 'domain-purchase',
      check: ({ capabilityId, input }) =>
        /domain/i.test(capabilityId) || input?.purchaseDomain
          ? 'Domain purchase'
          : null
    },
    {
      name: 'new-paid-vendor',
      check: ({ input }) => (input?.newVendor ? `New paid vendor: ${input.newVendor}` : null)
    },
    {
      name: 'pricing-change',
      check: ({ capabilityId, input }) =>
        /pricing|price/i.test(capabilityId) || input?.priceChange
          ? 'Pricing change'
          : null
    },
    {
      name: 'sensitive-export',
      check: ({ capabilityId, input }) =>
        /export/i.test(capabilityId) || input?.exportsSensitiveData
          ? 'Sensitive data export'
          : null
    },
    {
      name: 'compliance-uncertain',
      check: ({ input, context }) =>
        input?.complianceUncertain || context?.complianceUncertain
          ? 'Compliance position is uncertain'
          : null
    }
  ];
}

class RedisApprovalStore {
  constructor(redis, ns) {
    this.redis = redis;
    this.ns = ns;
  }
  key(...p) { return [this.ns, ...p].join(':'); }

  async save(req) {
    const multi = this.redis
      .multi()
      .set(this.key('record', req.id), JSON.stringify(req))
      .zadd(this.key('index'), req.createdAt, req.id);
    if (req.status === APPROVAL_STATUS.PENDING) multi.sadd(this.key('pending'), req.id);
    else multi.srem(this.key('pending'), req.id);
    await multi.exec();
  }
  async load(id) {
    const raw = await this.redis.get(this.key('record', id));
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }
  async pendingIds() { return this.redis.smembers(this.key('pending')); }
  async allIds() { return this.redis.zrange(this.key('index'), 0, -1); }
}

class MemoryApprovalStore {
  constructor() { this.records = new Map(); }
  async save(req) { this.records.set(req.id, { ...req }); }
  async load(id) { const r = this.records.get(id); return r ? { ...r } : null; }
  async pendingIds() {
    return [...this.records.values()]
      .filter((r) => r.status === APPROVAL_STATUS.PENDING)
      .map((r) => r.id);
  }
  async allIds() {
    return [...this.records.values()].sort((a, b) => a.createdAt - b.createdAt).map((r) => r.id);
  }
}

class FileApprovalStore {
  constructor(dir) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
  }
  pathFor(id) { return join(this.dir, `${id}.json`); }
  async save(req) {
    writeFileSync(this.pathFor(req.id), JSON.stringify(req, null, 2));
  }
  async load(id) {
    const path = this.pathFor(id);
    if (!existsSync(path)) return null;
    try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
  }
  async pendingIds() {
    const all = await this.allIds();
    const pending = [];
    for (const id of all) {
      const rec = await this.load(id);
      if (rec?.status === APPROVAL_STATUS.PENDING) pending.push(id);
    }
    return pending;
  }
  async allIds() {
    return readdirSync(this.dir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
  }
}

class ApprovalGate {
  constructor(config = {}) {
    this.registry = config.registry || null;
    this.namespace = config.namespace || 'approvals';
    this.ttlMs = config.ttlMs ?? 24 * 60 * 60 * 1000; // pending requests expire after a day
    this.spendThreshold = config.spendThreshold ?? 5;
    this.campaignThreshold = config.campaignThreshold ?? 100;

    // Escape hatch for non-production environments. Off by default.
    this.autoApprove = config.autoApprove === true;

    this.redis = config.redis || null;
    this.redisUrl = config.redisUrl || process.env.REDIS_URL || null;
    this.ownsRedis = false;
    this.store = null;
    this.dataDir = config.dataDir || process.env.HUSTLEBOT_DATA_DIR || null;

    this.policies = [
      ...defaultPolicies({
        spendThreshold: this.spendThreshold,
        campaignThreshold: this.campaignThreshold
      }),
      ...(config.policies || [])
    ];

    // Called when a request is raised - how Telegram learns to ask.
    this.onRequest = config.onRequest || null;
    // Called on every decision - the audit sink.
    this.onDecision = config.onDecision || null;
  }

  async initialize() {
    if (this.store) return this.durable;

    if (!this.redis && this.redisUrl) {
      try {
        this.redis = new Redis(this.redisUrl, {
          maxRetriesPerRequest: 3,
          connectTimeout: 5000,
          retryStrategy: (t) => (t > 3 ? null : Math.min(t * 200, 1000))
        });
        this.ownsRedis = true;
        await this.redis.ping();
      } catch (error) {
        logger.warn(`⚠️  Approval gate could not reach Redis (${error.message}), using memory`);
        if (this.ownsRedis && this.redis) this.redis.disconnect();
        this.redis = null;
        this.ownsRedis = false;
      }
    }

    if (this.redis) {
      this.store = new RedisApprovalStore(this.redis, this.namespace);
      this.durable = true;
      logger.info('🔐 Approval gate using Redis storage (pending approvals survive restarts)');
    } else if (this.dataDir) {
      this.store = new FileApprovalStore(join(this.dataDir, 'approvals'));
      this.durable = true;
      logger.info('🔐 Approval gate using file storage (pending approvals survive process death)');
    } else {
      this.store = new MemoryApprovalStore();
      this.durable = false;
      logger.warn('⚠️  Approval gate using in-memory storage - pending approvals will NOT survive a restart');
    }

    return this.durable;
  }

  addPolicy(name, check) {
    if (typeof check !== 'function') throw new Error('A policy check must be a function');
    this.policies.push({ name, check });
  }

  /**
   * Does this action need a human? Returns every reason, not just the first,
   * so the request explains itself properly.
   */
  evaluate({ capabilityId, input = {}, context = {}, estimatedCost = 0 }) {
    const described = this.registry?.describe(capabilityId);
    const capability = described
      ? {
          capabilityId,
          requiresApproval: described.providers.some((p) => p.requiresApproval)
        }
      : null;

    const cost =
      estimatedCost ||
      described?.providers?.[0]?.expectedCost ||
      0;

    const reasons = [];
    for (const policy of this.policies) {
      try {
        const reason = policy.check({ capabilityId, capability, input, context, estimatedCost: cost });
        if (reason) reasons.push({ policy: policy.name, reason });
      } catch (error) {
        logger.error(`Approval policy "${policy.name}" threw: ${error.message}`);
      }
    }

    return { required: reasons.length > 0, reasons, estimatedCost: cost };
  }

  /**
   * Raise a request and hold it. Returns the stored record; the caller is
   * expected to pause until it reaches a terminal status.
   */
  async request({
    capabilityId,
    input = {},
    reasons = [],
    estimatedCost = 0,
    graphId = null,
    nodeId = null,
    jobId = null,
    projectId = null,
    requestedBy = 'system',
    description = null
  }) {
    if (!this.store) await this.initialize();

    const now = Date.now();
    const record = {
      id: `apr-${now}-${randomUUID().slice(0, 8)}`,
      capabilityId,
      description: description || capabilityId,
      input,
      reasons,
      estimatedCost,
      graphId,
      nodeId,
      jobId,
      projectId,
      requestedBy,
      status: APPROVAL_STATUS.PENDING,
      decidedBy: null,
      decidedAt: null,
      notes: null,
      modifiedInputs: null,
      createdAt: now,
      expiresAt: now + this.ttlMs
    };

    if (this.autoApprove) {
      record.status = APPROVAL_STATUS.APPROVED;
      record.decidedBy = 'auto-approve';
      record.decidedAt = now;
      record.notes = 'Auto-approved (APPROVAL_AUTO_APPROVE enabled)';
      await this.store.save(record);
      logger.warn(`🔓 Auto-approved ${capabilityId} - approval enforcement is disabled`);
      return record;
    }

    await this.store.save(record);
    logger.info(
      `🔐 Approval requested: ${record.id} for ${capabilityId} ` +
      `(${reasons.map((r) => r.policy).join(', ') || 'unspecified'})`
    );

    if (this.onRequest) {
      try {
        await this.onRequest(record);
      } catch (error) {
        logger.error(`Approval notification failed: ${error.message}`);
      }
    }

    return record;
  }

  async get(id) {
    if (!this.store) await this.initialize();
    const record = await this.store.load(id);
    if (!record) return null;

    // Lazily expire, so a stale request never blocks forever.
    if (record.status === APPROVAL_STATUS.PENDING && Date.now() > record.expiresAt) {
      record.status = APPROVAL_STATUS.EXPIRED;
      record.decidedAt = Date.now();
      record.notes = 'Expired before anyone decided';
      await this.store.save(record);
    }
    return record;
  }

  async decide(id, { decision, by, notes = null, modifiedInputs = null }) {
    if (!this.store) await this.initialize();

    const record = await this.get(id);
    if (!record) throw new Error(`Unknown approval request: ${id}`);
    if (TERMINAL.has(record.status)) {
      throw new Error(`Approval ${id} was already ${record.status}`);
    }
    if (!by) throw new Error('A decision must record who made it');

    if (decision === 'approve') {
      record.status = APPROVAL_STATUS.APPROVED;
    } else if (decision === 'reject') {
      record.status = APPROVAL_STATUS.REJECTED;
    } else if (decision === 'modify') {
      if (!modifiedInputs || typeof modifiedInputs !== 'object') {
        throw new Error('Modifying an approval requires the replacement inputs');
      }
      // Modify is an approval of different inputs, not a third outcome.
      record.status = APPROVAL_STATUS.APPROVED;
      record.modifiedInputs = { ...record.input, ...modifiedInputs };
    } else {
      throw new Error(`Unknown decision: ${decision}`);
    }

    record.decidedBy = by;
    record.decidedAt = Date.now();
    record.notes = notes;
    await this.store.save(record);

    logger.info(`🔐 Approval ${id} ${record.status} by ${by}${record.modifiedInputs ? ' (with modified inputs)' : ''}`);

    if (this.onDecision) {
      try {
        await this.onDecision(record);
      } catch (error) {
        logger.error(`Approval decision hook failed: ${error.message}`);
      }
    }

    return record;
  }

  approve(id, by, notes) { return this.decide(id, { decision: 'approve', by, notes }); }
  reject(id, by, notes) { return this.decide(id, { decision: 'reject', by, notes }); }
  modify(id, by, modifiedInputs, notes) {
    return this.decide(id, { decision: 'modify', by, modifiedInputs, notes });
  }

  async cancel(id, by = 'system') {
    const record = await this.get(id);
    if (!record || TERMINAL.has(record.status)) return null;
    record.status = APPROVAL_STATUS.CANCELLED;
    record.decidedBy = by;
    record.decidedAt = Date.now();
    await this.store.save(record);
    return record;
  }

  async listPending() {
    if (!this.store) await this.initialize();
    const ids = await this.store.pendingIds();
    const out = [];
    for (const id of ids) {
      const record = await this.get(id); // expires stale ones on read
      if (record?.status === APPROVAL_STATUS.PENDING) out.push(record);
    }
    return out.sort((a, b) => a.createdAt - b.createdAt);
  }

  async list({ status = null, graphId = null, limit = 100 } = {}) {
    if (!this.store) await this.initialize();
    const ids = await this.store.allIds();
    const out = [];
    for (const id of ids.slice(-limit)) {
      const record = await this.store.load(id);
      if (!record) continue;
      if (status && record.status !== status) continue;
      if (graphId && record.graphId !== graphId) continue;
      out.push(record);
    }
    return out;
  }

  /**
   * Find the decision for a specific graph node, so a resumed graph knows
   * whether it may proceed.
   */
  async findForNode(graphId, nodeId) {
    const all = await this.list({ graphId, limit: 500 });
    return all.filter((r) => r.nodeId === nodeId).sort((a, b) => b.createdAt - a.createdAt)[0] || null;
  }

  async getStats() {
    const all = await this.list({ limit: 1000 });
    const byStatus = {};
    for (const r of all) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    return {
      total: all.length,
      byStatus,
      pending: byStatus[APPROVAL_STATUS.PENDING] || 0,
      durable: this.durable === true,
      autoApprove: this.autoApprove,
      policies: this.policies.map((p) => p.name),
      spendThreshold: this.spendThreshold
    };
  }

  async shutdown() {
    if (this.ownsRedis && this.redis) {
      await this.redis.quit().catch(() => this.redis.disconnect());
    }
  }
}

export { ApprovalGate, APPROVAL_STATUS, defaultPolicies };
