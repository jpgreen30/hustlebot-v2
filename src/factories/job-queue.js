/**
 * DURABLE JOB QUEUE
 *
 * Redis-backed when REDIS_URL is present. File-backed when a dataDir is
 * provided (survives process death without Redis). In-memory only as a last
 * resort for unit tests that pass neither.
 */

import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { join } from 'node:path';
import logger from '../utils/logger.js';
import { FileJobStore } from '../runtime/file-store.js';
import { classifyFailure, shouldRetry, retryDelayMs } from '../runtime/retry.js';

const JOB_STATUS = {
  QUEUED: 'queued',
  PLANNING: 'planning',
  RUNNING: 'running',
  AWAITING_DEPENDENCY: 'awaiting_dependency',
  AWAITING_APPROVAL: 'awaiting_approval',
  RETRYING: 'retrying',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  PAUSED: 'paused',
  DEAD_LETTER: 'dead_letter'
};

const TERMINAL_STATUSES = new Set([
  JOB_STATUS.COMPLETED,
  JOB_STATUS.FAILED,
  JOB_STATUS.CANCELLED,
  JOB_STATUS.DEAD_LETTER
]);

class RedisJobStore {
  constructor(redis, namespace) {
    this.redis = redis;
    this.ns = namespace;
  }

  key(...parts) {
    return [this.ns, ...parts].join(':');
  }

  async save(job) {
    await this.redis
      .multi()
      .set(this.key('record', job.id), JSON.stringify(job))
      .zadd(this.key('index'), job.createdAt, job.id)
      .exec();
  }

  async load(id) {
    const raw = await this.redis.get(this.key('record', id));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (error) {
      logger.error(`Job record ${id} is corrupt: ${error.message}`);
      return null;
    }
  }

  async pushPending(id) {
    await this.redis.rpush(this.key('pending'), id);
  }

  async popPending() {
    return this.redis.lpop(this.key('pending'));
  }

  async removePending(id) {
    return this.redis.lrem(this.key('pending'), 1, id);
  }

  async pushDelayed(id, availableAt) {
    await this.redis.zadd(this.key('delayed'), availableAt, id);
  }

  async popDueDelayed(now) {
    const ids = await this.redis.zrangebyscore(this.key('delayed'), '-inf', now);
    if (!ids?.length) return [];
    const multi = this.redis.multi();
    for (const id of ids) multi.zrem(this.key('delayed'), id);
    await multi.exec();
    return ids;
  }

  async markActive(id) {
    await this.redis.sadd(this.key('active'), id);
  }

  async clearActive(id) {
    await this.redis.srem(this.key('active'), id);
  }

  async listActive() {
    return this.redis.smembers(this.key('active'));
  }

  async listIds() {
    return this.redis.zrangebyscore(this.key('index'), '-inf', '+inf');
  }

  async remove(id) {
    await this.redis
      .multi()
      .del(this.key('record', id))
      .zrem(this.key('index'), id)
      .srem(this.key('active'), id)
      .zrem(this.key('delayed'), id)
      .exec();
  }

  async idsOlderThan(cutoff) {
    return this.redis.zrangebyscore(this.key('index'), '-inf', cutoff);
  }

  async counts() {
    const [pending, active, total] = await Promise.all([
      this.redis.llen(this.key('pending')),
      this.redis.scard(this.key('active')),
      this.redis.zcard(this.key('index'))
    ]);
    return { pending, active, total };
  }

  async putIdempotency(key, id) {
    await this.redis.set(this.key('idemp', key), id);
  }

  async getIdempotency(key) {
    return this.redis.get(this.key('idemp', key));
  }
}

class MemoryJobStore {
  constructor() {
    this.records = new Map();
    this.pending = [];
    this.active = new Set();
    this.delayed = [];
    this.idempotency = new Map();
  }

  async save(job) {
    this.records.set(job.id, job);
  }

  async load(id) {
    const job = this.records.get(id);
    return job ? { ...job } : null;
  }

  async pushPending(id) {
    this.pending.push(id);
  }

  async popPending() {
    return this.pending.shift() ?? null;
  }

  async removePending(id) {
    const i = this.pending.indexOf(id);
    if (i === -1) return 0;
    this.pending.splice(i, 1);
    return 1;
  }

  async pushDelayed(id, availableAt) {
    this.delayed = this.delayed.filter((row) => row.id !== id);
    this.delayed.push({ id, availableAt });
  }

  async popDueDelayed(now) {
    const due = [];
    const rest = [];
    for (const row of this.delayed) {
      if (row.availableAt <= now) due.push(row.id);
      else rest.push(row);
    }
    this.delayed = rest;
    return due;
  }

  async markActive(id) {
    this.active.add(id);
  }

  async clearActive(id) {
    this.active.delete(id);
  }

  async listActive() {
    return [...this.active];
  }

  async listIds() {
    return [...this.records.keys()];
  }

  async remove(id) {
    this.records.delete(id);
    this.active.delete(id);
    await this.removePending(id);
    this.delayed = this.delayed.filter((row) => row.id !== id);
  }

  async idsOlderThan(cutoff) {
    return [...this.records.values()]
      .filter((job) => job.createdAt <= cutoff)
      .map((job) => job.id);
  }

  async counts() {
    return {
      pending: this.pending.length,
      active: this.active.size,
      total: this.records.size
    };
  }

  async putIdempotency(key, id) {
    this.idempotency.set(key, id);
  }

  async getIdempotency(key) {
    return this.idempotency.get(key) || null;
  }
}

class JobQueue {
  constructor(config = {}) {
    this.maxConcurrent = config.maxConcurrent || 3;
    this.jobTimeout = config.jobTimeout || 120000;
    this.maxAttempts = config.maxAttempts || 3;
    this.retryDelay = config.retryDelay ?? 5000;
    this.namespace = config.namespace || 'jobs';
    this.retentionMs = config.retentionMs ?? 3600000;
    this.pollIntervalMs = config.pollIntervalMs || 1000;
    this.connectTimeoutMs = config.connectTimeoutMs || 5000;
    this.leaseMs = config.leaseMs || Number(process.env.HUSTLEBOT_JOB_LEASE_MS || 30000);
    this.workerId = config.workerId || `w_${process.pid}_${randomUUID().slice(0, 8)}`;
    this.dataDir = Object.prototype.hasOwnProperty.call(config, 'dataDir')
      ? config.dataDir
      : (process.env.HUSTLEBOT_DATA_DIR || null);

    this.redis = config.redis || null;
    this.redisUrl = config.redisUrl || process.env.REDIS_URL || null;
    this.ownsRedis = false;

    this.store = null;
    this.handlers = new Map();
    this.activeCount = 0;
    this.started = false;
    this.durable = false;
    this.backend = 'uninitialized';
    this.pollTimer = null;
    this.retryTimers = new Set();
    this.inFlight = new Set();
    this.stopClaims = false;
    this.recoveredJobs = 0;
    this.recoveredLeases = 0;
  }

  async initialize() {
    if (this.store) return this.durable;

    if (!this.redis && this.redisUrl) {
      try {
        this.redis = new Redis(this.redisUrl, {
          maxRetriesPerRequest: 3,
          connectTimeout: this.connectTimeoutMs,
          retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000))
        });
        this.ownsRedis = true;

        await Promise.race([
          this.redis.ping(),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error(`Redis did not respond within ${this.connectTimeoutMs}ms`)),
              this.connectTimeoutMs
            ).unref?.()
          )
        ]);
      } catch (error) {
        logger.warn(`⚠️  Job queue could not reach Redis (${error.message}), falling back`);
        if (this.ownsRedis && this.redis) {
          this.redis.disconnect();
          this.redis = null;
          this.ownsRedis = false;
        }
      }
    }

    if (this.redis) {
      this.store = new RedisJobStore(this.redis, this.namespace);
      this.durable = true;
      this.backend = 'redis';
      logger.info('📋 Job queue using Redis storage (durable across restarts)');
    } else if (this.dataDir) {
      this.store = new FileJobStore(join(this.dataDir, 'jobs', this.namespace.replace(/:/g, '_')));
      this.durable = true;
      this.backend = 'file';
      logger.info(`📋 Job queue using file storage at ${this.dataDir} (durable across process death)`);
    } else {
      this.store = new MemoryJobStore();
      this.durable = false;
      this.backend = 'memory';
      logger.warn('⚠️  Job queue using in-memory storage - jobs will NOT survive a restart');
    }

    await this.recoverInterruptedJobs();
    return this.durable;
  }

  async recoverInterruptedJobs() {
    const ids = await this.store.listActive();
    if (!ids.length) return;

    let requeued = 0;
    let abandoned = 0;
    const now = Date.now();

    for (const id of ids) {
      const job = await this.store.load(id);
      if (this.inFlight.has(id)) continue;
      if (job?.leaseExpiresAt && job.leaseExpiresAt > now && job.leaseOwner && job.leaseOwner !== this.workerId) {
        continue;
      }
      await this.store.clearActive(id);

      if (!job || TERMINAL_STATUSES.has(job.status) || job.status === JOB_STATUS.PAUSED) continue;

      if (job.attempts < job.maxAttempts) {
        job.status = JOB_STATUS.RETRYING;
        job.error = 'Interrupted by a service restart, requeued';
        job.leaseOwner = null;
        job.leaseExpiresAt = null;
        job.updatedAt = Date.now();
        await this.store.save(job);
        await this.store.pushPending(id);
        requeued++;
      } else {
        job.status = JOB_STATUS.DEAD_LETTER;
        job.error = 'Interrupted by a service restart, no attempts remaining';
        job.completedAt = Date.now();
        job.updatedAt = job.completedAt;
        await this.store.save(job);
        abandoned++;
      }
    }

    this.recoveredJobs += requeued;
    if (requeued || abandoned) {
      logger.info(`♻️  Recovered interrupted jobs: ${requeued} requeued, ${abandoned} dead-lettered`);
    }
  }

  async recoverExpiredLeases() {
    const ids = await this.store.listActive();
    const now = Date.now();
    let recovered = 0;
    for (const id of ids) {
      if (this.inFlight.has(id)) continue;
      const job = await this.store.load(id);
      if (!job || TERMINAL_STATUSES.has(job.status) || job.status === JOB_STATUS.PAUSED) continue;
      if (job.leaseExpiresAt && job.leaseExpiresAt > now) continue;
      await this.store.clearActive(id);
      job.leaseOwner = null;
      job.leaseExpiresAt = null;
      job.updatedAt = now;
      if (job.attempts >= job.maxAttempts) {
        job.status = JOB_STATUS.DEAD_LETTER;
        job.error = job.error || 'Lease expired; no attempts remaining';
        job.completedAt = now;
        await this.store.save(job);
      } else {
        job.status = JOB_STATUS.RETRYING;
        job.error = 'Lease expired; recovered';
        await this.store.save(job);
        await this.store.pushPending(id);
        recovered++;
      }
    }
    this.recoveredLeases += recovered;
    return recovered;
  }

  async promoteDelayed() {
    if (!this.store.popDueDelayed) return 0;
    const ids = await this.store.popDueDelayed(Date.now());
    for (const id of ids) await this.store.pushPending(id);
    return ids.length;
  }

  registerHandler(type, handler) {
    if (typeof handler !== 'function') {
      throw new Error(`Handler for job type "${type}" must be a function`);
    }
    this.handlers.set(type, handler);
    logger.info(`📋 Job handler registered: ${type}`);
  }

  async start() {
    if (!this.store) await this.initialize();
    if (this.started) return;

    this.started = true;
    this.stopClaims = false;

    this.pollTimer = setInterval(() => {
      this.processQueue().catch((error) =>
        logger.error(`Job queue poll failed: ${error.message}`)
      );
    }, this.pollIntervalMs);
    if (this.pollTimer.unref) this.pollTimer.unref();

    logger.info(`📋 Job queue started (max ${this.maxConcurrent} concurrent, backend=${this.backend})`);
    await this.processQueue();
  }

  async createJob(type, payload = {}, options = {}) {
    if (!this.store) await this.initialize();

    if (options.idempotencyKey && this.store.getIdempotency) {
      const existingId = await this.store.getIdempotency(options.idempotencyKey);
      if (existingId) {
        const existing = await this.store.load(existingId);
        if (existing && !TERMINAL_STATUSES.has(existing.status)) return existing.id;
        if (existing && existing.status === JOB_STATUS.COMPLETED) return existing.id;
      }
    }

    const now = Date.now();
    const availableAt = options.availableAt
      || (options.delayMs ? now + Number(options.delayMs) : now);
    const job = {
      id: options.id || `job-${now}-${randomUUID().slice(0, 8)}`,
      type,
      payload,
      status: JOB_STATUS.QUEUED,
      progress: 0,
      stage: null,
      attempts: 0,
      maxAttempts: options.maxAttempts || this.maxAttempts,
      result: null,
      error: null,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
      availableAt,
      leaseOwner: null,
      leaseExpiresAt: null,
      leaseMs: options.leaseMs || this.leaseMs,
      idempotencyKey: options.idempotencyKey || null,
      lastErrorKind: null,
      projectId: options.projectId || null,
      jobGroupId: options.jobGroupId || null,
      objectiveId: options.objectiveId || payload.objectiveId || null,
      createdBy: options.createdBy || 'system'
    };

    await this.store.save(job);
    if (job.idempotencyKey && this.store.putIdempotency) {
      await this.store.putIdempotency(job.idempotencyKey, job.id);
    }
    if (availableAt > now && this.store.pushDelayed) {
      await this.store.pushDelayed(job.id, availableAt);
    } else {
      await this.store.pushPending(job.id);
    }
    logger.info(`📋 Job created: ${job.id} (${type})${availableAt > now ? ` delayed until ${new Date(availableAt).toISOString()}` : ''}`);

    if (this.started) {
      this.processQueue().catch((error) =>
        logger.error(`Job queue processing failed: ${error.message}`)
      );
    }

    return job.id;
  }

  async processQueue() {
    if (!this.started || !this.store || this.stopClaims) return;

    await this.promoteDelayed();
    await this.recoverExpiredLeases();

    while (this.activeCount < this.maxConcurrent && !this.stopClaims) {
      const jobId = await this.store.popPending();
      if (!jobId) return;

      const job = await this.store.load(jobId);
      if (!job) {
        logger.warn(`Job ${jobId} was queued but has no record, skipping`);
        continue;
      }

      if (job.status === JOB_STATUS.CANCELLED || job.status === JOB_STATUS.PAUSED) {
        logger.info(`⏭️  Job ${jobId} was ${job.status} before it started`);
        continue;
      }

      if (job.availableAt && job.availableAt > Date.now()) {
        if (this.store.pushDelayed) await this.store.pushDelayed(jobId, job.availableAt);
        else await this.store.pushPending(jobId);
        continue;
      }

      this.activeCount++;
      this.inFlight.add(jobId);
      await this.store.markActive(jobId);

      this.runJob(job).catch((error) =>
        logger.error(`Unexpected job runner error for ${jobId}: ${error.message}`)
      );
    }
  }

  async heartbeat(jobId) {
    const job = await this.store.load(jobId);
    if (!job || job.leaseOwner !== this.workerId) return null;
    job.leaseExpiresAt = Date.now() + (job.leaseMs || this.leaseMs);
    job.updatedAt = Date.now();
    await this.store.save(job);
    return job;
  }

  async runJob(job) {
    const handler = this.handlers.get(job.type);

    if (!handler) {
      await this.finishJob(job, {
        status: JOB_STATUS.FAILED,
        error: `No handler registered for job type "${job.type}"`
      });
      return;
    }

    job.status = JOB_STATUS.RUNNING;
    job.attempts += 1;
    job.startedAt = Date.now();
    job.updatedAt = job.startedAt;
    job.error = null;
    job.leaseOwner = this.workerId;
    job.leaseExpiresAt = Date.now() + (job.leaseMs || this.leaseMs);
    await this.store.save(job);
    logger.info(`⚙️  Job started: ${job.id} (attempt ${job.attempts}/${job.maxAttempts})`);

    let timeoutHandle;
    const beat = setInterval(() => {
      this.heartbeat(job.id).catch(() => {});
    }, Math.max(200, Math.floor((job.leaseMs || this.leaseMs) / 3)));
    if (beat.unref) beat.unref();

    try {
      const timeout = new Promise((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error(`Job timed out after ${this.jobTimeout}ms`)),
          this.jobTimeout
        );
        if (timeoutHandle.unref) timeoutHandle.unref();
      });

      const result = await Promise.race([
        Promise.resolve(handler(job.payload, job)),
        timeout
      ]);

      const stored = await this.store.load(job.id);
      if (stored?.status === JOB_STATUS.CANCELLED || stored?.status === JOB_STATUS.PAUSED) {
        logger.info(`Job ${job.id} finished after ${stored.status}; result discarded`);
        return;
      }
      const finalResult = result !== undefined ? result : stored?.result ?? null;

      await this.finishJob(job, {
        status: JOB_STATUS.COMPLETED,
        result: finalResult,
        progress: 100
      });
      logger.info(`✅ Job completed: ${job.id}`);
    } catch (error) {
      await this.handleFailure(job, error);
    } finally {
      clearTimeout(timeoutHandle);
      clearInterval(beat);
      this.activeCount = Math.max(0, this.activeCount - 1);
      this.inFlight.delete(job.id);
      await this.store.clearActive(job.id);
      this.processQueue().catch((err) =>
        logger.error(`Job queue processing failed: ${err.message}`)
      );
    }
  }

  async handleFailure(job, error) {
    const current = (await this.store.load(job.id)) || job;

    if (current.status === JOB_STATUS.CANCELLED || current.status === JOB_STATUS.PAUSED) {
      logger.info(`🚫 Job ${job.id} was ${current.status} during execution`);
      return;
    }

    const kind = classifyFailure(error);
    current.lastErrorKind = kind;
    current.error = error.message;

    if (!shouldRetry(kind) || current.attempts >= current.maxAttempts) {
      const status = current.attempts >= current.maxAttempts || !shouldRetry(kind)
        ? (shouldRetry(kind) ? JOB_STATUS.DEAD_LETTER : JOB_STATUS.FAILED)
        : JOB_STATUS.FAILED;
      const terminal = current.attempts >= current.maxAttempts ? JOB_STATUS.DEAD_LETTER : JOB_STATUS.FAILED;
      await this.finishJob(current, { status: terminal, error: error.message, lastErrorKind: kind });
      logger.error(`❌ Job ${terminal}: ${job.id} - ${error.message} (${kind})`);
      return;
    }

    current.status = JOB_STATUS.RETRYING;
    current.updatedAt = Date.now();
    current.leaseOwner = null;
    current.leaseExpiresAt = null;
    await this.store.save(current);

    const delay = retryDelayMs(kind, current.attempts, this.retryDelay);
    logger.warn(
      `🔁 Job ${job.id} failed (${error.message} / ${kind}), retrying in ${delay}ms ` +
      `(attempt ${current.attempts}/${current.maxAttempts})`
    );

    const timer = setTimeout(() => {
      this.retryTimers.delete(timer);
      this.store
        .pushPending(job.id)
        .then(() => this.processQueue())
        .catch((err) => logger.error(`Failed to requeue job ${job.id}: ${err.message}`));
    }, delay);
    if (timer.unref) timer.unref();
    this.retryTimers.add(timer);
  }

  async finishJob(job, patch) {
    const current = (await this.store.load(job.id)) || job;
    Object.assign(current, patch);
    current.completedAt = Date.now();
    current.updatedAt = current.completedAt;
    current.leaseOwner = null;
    current.leaseExpiresAt = null;
    await this.store.save(current);
    await this.store.clearActive(job.id);
  }

  async getJob(jobId) {
    if (!this.store) await this.initialize();
    return this.store.load(jobId);
  }

  async setStatus(jobId, status, detail = {}) {
    if (!Object.values(JOB_STATUS).includes(status)) {
      throw new Error(`Unknown job status: ${status}`);
    }
    const job = await this.store.load(jobId);
    if (!job) return null;

    Object.assign(job, detail, { status, updatedAt: Date.now() });
    if (TERMINAL_STATUSES.has(status)) job.completedAt = job.updatedAt;
    await this.store.save(job);
    return job;
  }

  async updateProgress(jobId, progress, stage) {
    const job = await this.store.load(jobId);
    if (!job) return null;

    job.progress = Math.max(0, Math.min(100, progress));
    if (stage) job.stage = stage;
    job.updatedAt = Date.now();
    await this.store.save(job);
    return job;
  }

  async setResult(jobId, result) {
    const job = await this.store.load(jobId);
    if (!job) return null;

    job.result = result;
    job.updatedAt = Date.now();
    await this.store.save(job);
    return job;
  }

  async pause(jobId) {
    const job = await this.store.load(jobId);
    if (!job || TERMINAL_STATUSES.has(job.status)) return false;
    await this.store.removePending(jobId);
    job.status = JOB_STATUS.PAUSED;
    job.updatedAt = Date.now();
    job.leaseOwner = null;
    await this.store.save(job);
    return true;
  }

  async resume(jobId) {
    const job = await this.store.load(jobId);
    if (!job || job.status !== JOB_STATUS.PAUSED) return false;
    job.status = JOB_STATUS.QUEUED;
    job.updatedAt = Date.now();
    await this.store.save(job);
    await this.store.pushPending(jobId);
    if (this.started) await this.processQueue();
    return true;
  }

  async cancel(jobId) {
    const job = await this.store.load(jobId);
    if (!job || TERMINAL_STATUSES.has(job.status)) return false;

    await this.store.removePending(jobId);
    job.status = JOB_STATUS.CANCELLED;
    job.completedAt = Date.now();
    job.updatedAt = job.completedAt;
    await this.store.save(job);
    logger.info(`🚫 Job cancelled: ${jobId}`);
    return true;
  }

  async retryDeadLetter(jobId) {
    const job = await this.store.load(jobId);
    if (!job || (job.status !== JOB_STATUS.DEAD_LETTER && job.status !== JOB_STATUS.FAILED)) return false;
    job.status = JOB_STATUS.QUEUED;
    job.attempts = 0;
    job.error = null;
    job.completedAt = null;
    job.updatedAt = Date.now();
    await this.store.save(job);
    await this.store.pushPending(jobId);
    if (this.started) await this.processQueue();
    return true;
  }

  summarize(job) {
    if (!job) return null;
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      availableAt: job.availableAt,
      leaseExpiresAt: job.leaseExpiresAt,
      leaseOwner: job.leaseOwner,
      idempotencyKey: job.idempotencyKey,
      objectiveId: job.objectiveId,
      error: job.error,
      lastErrorKind: job.lastErrorKind,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    };
  }

  async listJobs({ status, limit = 50 } = {}) {
    if (!this.store) await this.initialize();
    const ids = this.store.listIds ? await this.store.listIds() : await this.store.idsOlderThan(Date.now() + 1e15);
    const out = [];
    for (const id of [...ids].reverse()) {
      const job = await this.store.load(id);
      if (!job) continue;
      if (status && job.status !== status) continue;
      out.push(this.summarize(job));
      if (out.length >= limit) break;
    }
    return out;
  }

  async getStats() {
    if (!this.store) await this.initialize();
    const { pending, active, total } = await this.store.counts();
    const jobs = await this.listJobs({ limit: 500 });
    const deadLetter = jobs.filter((j) => j.status === JOB_STATUS.DEAD_LETTER).length;
    const paused = jobs.filter((j) => j.status === JOB_STATUS.PAUSED).length;
    const retrying = jobs.filter((j) => j.status === JOB_STATUS.RETRYING).length;
    return {
      queueLength: pending,
      activeJobs: active,
      runningHere: this.activeCount,
      totalJobs: total,
      deadLetter,
      paused,
      retrying,
      recoveredJobs: this.recoveredJobs,
      recoveredLeases: this.recoveredLeases,
      maxConcurrent: this.maxConcurrent,
      durable: this.durable,
      backend: this.backend,
      workerId: this.workerId,
      handlers: [...this.handlers.keys()]
    };
  }

  async cleanup() {
    if (!this.store) return 0;

    const cutoff = Date.now() - this.retentionMs;
    const ids = await this.store.idsOlderThan(cutoff);
    let cleaned = 0;

    for (const id of ids) {
      const job = await this.store.load(id);
      if (!job) continue;
      if (!TERMINAL_STATUSES.has(job.status)) continue;
      if (!job.completedAt || job.completedAt > cutoff) continue;

      await this.store.remove(id);
      cleaned++;
    }

    if (cleaned > 0) logger.info(`🧹 Cleaned up ${cleaned} finished jobs`);
    return cleaned;
  }

  stopClaiming() {
    this.stopClaims = true;
  }

  abandonInFlightForTest(jobId) {
    this.inFlight.delete(jobId);
    this.activeCount = Math.max(0, this.activeCount - 1);
  }

  async shutdown() {
    this.stopClaims = true;
    this.started = false;
    if (this.pollTimer) clearInterval(this.pollTimer);
    for (const timer of this.retryTimers) clearTimeout(timer);
    this.retryTimers.clear();

    for (const id of [...this.inFlight]) {
      const job = await this.store.load(id);
      if (job && job.leaseOwner === this.workerId) {
        job.leaseExpiresAt = Date.now();
        job.error = job.error || 'Worker shutting down; lease released';
        await this.store.save(job);
      }
    }

    if (this.ownsRedis && this.redis) {
      await this.redis.quit().catch(() => this.redis.disconnect());
    }
  }
}

export { JobQueue, JOB_STATUS, TERMINAL_STATUSES };
