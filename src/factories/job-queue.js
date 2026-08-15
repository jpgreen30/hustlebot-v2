/**
 * DURABLE JOB QUEUE
 *
 * Redis-backed queue that survives service restarts, per the Master Build
 * Spec ("Must survive service restarts").
 *
 * Design note: jobs cannot carry an execute() closure, because a function
 * cannot be serialized to Redis. Instead a job stores a type plus a
 * JSON-serializable payload, and handlers are registered per type at
 * startup:
 *
 *     queue.registerHandler('content-generation', async (payload, job) => {...});
 *     await queue.start();
 *     const jobId = await queue.createJob('content-generation', { topic });
 *
 * When REDIS_URL is absent the queue falls back to in-memory storage so
 * local development still works. In that mode jobs do not survive restarts.
 */

import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import logger from '../utils/logger.js';

/**
 * The nine statuses the spec requires.
 */
const JOB_STATUS = {
  QUEUED: 'queued',
  PLANNING: 'planning',
  RUNNING: 'running',
  AWAITING_DEPENDENCY: 'awaiting_dependency',
  AWAITING_APPROVAL: 'awaiting_approval',
  RETRYING: 'retrying',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

const TERMINAL_STATUSES = new Set([
  JOB_STATUS.COMPLETED,
  JOB_STATUS.FAILED,
  JOB_STATUS.CANCELLED
]);

/**
 * Redis-backed storage.
 *
 * Keys:
 *   <ns>:pending      LIST  job ids awaiting a worker (FIFO, atomic LPOP)
 *   <ns>:active       SET   job ids a worker claimed - used for restart recovery
 *   <ns>:record:<id>  JSON  the job record itself
 *   <ns>:index        ZSET  job id scored by createdAt, for listing and cleanup
 */
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

  async markActive(id) {
    await this.redis.sadd(this.key('active'), id);
  }

  async clearActive(id) {
    await this.redis.srem(this.key('active'), id);
  }

  async listActive() {
    return this.redis.smembers(this.key('active'));
  }

  async remove(id) {
    await this.redis
      .multi()
      .del(this.key('record', id))
      .zrem(this.key('index'), id)
      .srem(this.key('active'), id)
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
}

/**
 * In-memory storage with the same interface, used when Redis is unavailable.
 */
class MemoryJobStore {
  constructor() {
    this.records = new Map();
    this.pending = [];
    this.active = new Set();
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

  async markActive(id) {
    this.active.add(id);
  }

  async clearActive(id) {
    this.active.delete(id);
  }

  async listActive() {
    return [...this.active];
  }

  async remove(id) {
    this.records.delete(id);
    this.active.delete(id);
    await this.removePending(id);
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
}

class JobQueue {
  constructor(config = {}) {
    this.maxConcurrent = config.maxConcurrent || 3;
    this.jobTimeout = config.jobTimeout || 120000;
    this.maxAttempts = config.maxAttempts || 3;
    // ?? not ||, so an explicit 0 (retry immediately, never retain) is honored.
    this.retryDelay = config.retryDelay ?? 5000;
    this.namespace = config.namespace || 'jobs';
    this.retentionMs = config.retentionMs ?? 3600000;
    this.pollIntervalMs = config.pollIntervalMs || 1000;
    this.connectTimeoutMs = config.connectTimeoutMs || 5000;

    // Either an existing client (shared with the mailbox) or a URL to dial.
    this.redis = config.redis || null;
    this.redisUrl = config.redisUrl || process.env.REDIS_URL || null;
    this.ownsRedis = false;

    this.store = null;
    this.handlers = new Map();
    this.activeCount = 0;
    this.started = false;
    this.durable = false;
    this.pollTimer = null;
    this.retryTimers = new Set();
  }

  /**
   * Connect storage and requeue anything a previous process left running.
   * Safe to call more than once.
   */
  async initialize() {
    if (this.store) return this.durable;

    if (!this.redis && this.redisUrl) {
      try {
        this.redis = new Redis(this.redisUrl, {
          maxRetriesPerRequest: 3,
          connectTimeout: this.connectTimeoutMs,
          // Without a bounded strategy ioredis retries forever, and an
          // unreachable REDIS_URL would hang startup instead of falling back.
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
        logger.warn(`⚠️  Job queue could not reach Redis (${error.message}), using in-memory storage`);
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
      logger.info('📋 Job queue using Redis storage (durable across restarts)');
    } else {
      this.store = new MemoryJobStore();
      this.durable = false;
      logger.warn('⚠️  Job queue using in-memory storage - jobs will NOT survive a restart');
    }

    await this.recoverInterruptedJobs();
    return this.durable;
  }

  /**
   * Jobs left in the active set belong to a process that died mid-run.
   * Requeue those with attempts remaining; fail the rest with a clear reason.
   */
  async recoverInterruptedJobs() {
    const ids = await this.store.listActive();
    if (!ids.length) return;

    let requeued = 0;
    let abandoned = 0;

    for (const id of ids) {
      const job = await this.store.load(id);
      await this.store.clearActive(id);

      if (!job || TERMINAL_STATUSES.has(job.status)) continue;

      if (job.attempts < job.maxAttempts) {
        job.status = JOB_STATUS.RETRYING;
        job.error = 'Interrupted by a service restart, requeued';
        job.updatedAt = Date.now();
        await this.store.save(job);
        await this.store.pushPending(id);
        requeued++;
      } else {
        job.status = JOB_STATUS.FAILED;
        job.error = 'Interrupted by a service restart, no attempts remaining';
        job.completedAt = Date.now();
        job.updatedAt = job.completedAt;
        await this.store.save(job);
        abandoned++;
      }
    }

    logger.info(`♻️  Recovered interrupted jobs: ${requeued} requeued, ${abandoned} failed`);
  }

  /**
   * Register the function that runs a given job type. The handler receives
   * (payload, job) and its resolved value becomes the job result.
   */
  registerHandler(type, handler) {
    if (typeof handler !== 'function') {
      throw new Error(`Handler for job type "${type}" must be a function`);
    }
    this.handlers.set(type, handler);
    logger.info(`📋 Job handler registered: ${type}`);
  }

  /**
   * Begin draining the queue. Call after handlers are registered, otherwise
   * a job whose type has no handler would fail on arrival.
   */
  async start() {
    if (!this.store) await this.initialize();
    if (this.started) return;

    this.started = true;

    // Polling picks up jobs this process did not create - work recovered at
    // boot, and work queued by another instance sharing the same Redis.
    this.pollTimer = setInterval(() => {
      this.processQueue().catch((error) =>
        logger.error(`Job queue poll failed: ${error.message}`)
      );
    }, this.pollIntervalMs);
    if (this.pollTimer.unref) this.pollTimer.unref();

    logger.info(`📋 Job queue started (max ${this.maxConcurrent} concurrent)`);
    await this.processQueue();
  }

  /**
   * Queue a job. The payload must be JSON-serializable.
   */
  async createJob(type, payload = {}, options = {}) {
    if (!this.store) await this.initialize();

    const now = Date.now();
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
      // Correlation fields so jobs can later be joined to audit logs.
      projectId: options.projectId || null,
      jobGroupId: options.jobGroupId || null,
      createdBy: options.createdBy || 'system'
    };

    await this.store.save(job);
    await this.store.pushPending(job.id);
    logger.info(`📋 Job created: ${job.id} (${type})`);

    if (this.started) {
      this.processQueue().catch((error) =>
        logger.error(`Job queue processing failed: ${error.message}`)
      );
    }

    return job.id;
  }

  /**
   * Claim and run jobs until the concurrency limit is reached.
   */
  async processQueue() {
    if (!this.started || !this.store) return;

    while (this.activeCount < this.maxConcurrent) {
      const jobId = await this.store.popPending();
      if (!jobId) return;

      const job = await this.store.load(jobId);
      if (!job) {
        logger.warn(`Job ${jobId} was queued but has no record, skipping`);
        continue;
      }

      if (job.status === JOB_STATUS.CANCELLED) {
        logger.info(`⏭️  Job ${jobId} was cancelled before it started`);
        continue;
      }

      this.activeCount++;
      await this.store.markActive(jobId);

      // Deliberately not awaited: each job runs concurrently up to the limit.
      this.runJob(job).catch((error) =>
        logger.error(`Unexpected job runner error for ${jobId}: ${error.message}`)
      );
    }
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
    await this.store.save(job);
    logger.info(`⚙️  Job started: ${job.id} (attempt ${job.attempts}/${job.maxAttempts})`);

    let timeoutHandle;
    try {
      const timeout = new Promise((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error(`Job timed out after ${this.jobTimeout}ms`)),
          this.jobTimeout
        );
        // Unref'd so a handler that never settles cannot hold the process
        // open for the whole timeout window - the timer still fires while
        // the service is running.
        if (timeoutHandle.unref) timeoutHandle.unref();
      });

      const result = await Promise.race([
        Promise.resolve(handler(job.payload, job)),
        timeout
      ]);

      // The handler may have recorded a result via setResult() instead of
      // returning one; don't overwrite that with undefined.
      const stored = await this.store.load(job.id);
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
      this.activeCount--;
      await this.store.clearActive(job.id);
      this.processQueue().catch((err) =>
        logger.error(`Job queue processing failed: ${err.message}`)
      );
    }
  }

  async handleFailure(job, error) {
    const current = (await this.store.load(job.id)) || job;

    if (current.status === JOB_STATUS.CANCELLED) {
      logger.info(`🚫 Job ${job.id} was cancelled during execution`);
      return;
    }

    if (current.attempts < current.maxAttempts) {
      current.status = JOB_STATUS.RETRYING;
      current.error = error.message;
      current.updatedAt = Date.now();
      await this.store.save(current);

      const delay = this.retryDelay * current.attempts; // linear backoff
      logger.warn(
        `🔁 Job ${job.id} failed (${error.message}), retrying in ${delay}ms ` +
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
      return;
    }

    await this.finishJob(current, { status: JOB_STATUS.FAILED, error: error.message });
    logger.error(`❌ Job failed permanently: ${job.id} - ${error.message}`);
  }

  async finishJob(job, patch) {
    const current = (await this.store.load(job.id)) || job;
    Object.assign(current, patch);
    current.completedAt = Date.now();
    current.updatedAt = current.completedAt;
    await this.store.save(current);
    await this.store.clearActive(job.id);
  }

  async getJob(jobId) {
    if (!this.store) await this.initialize();
    return this.store.load(jobId);
  }

  /**
   * Move a job into one of the non-running states the spec defines
   * (planning, awaiting_dependency, awaiting_approval).
   */
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

  /**
   * Cancel a job. A queued job never starts; a running job is marked so its
   * result is discarded when the handler settles.
   */
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

  async getStats() {
    if (!this.store) await this.initialize();
    const { pending, active, total } = await this.store.counts();
    return {
      queueLength: pending,
      activeJobs: active,
      runningHere: this.activeCount,
      totalJobs: total,
      maxConcurrent: this.maxConcurrent,
      durable: this.durable,
      handlers: [...this.handlers.keys()]
    };
  }

  /**
   * Drop finished jobs past the retention window. Unfinished jobs are kept
   * regardless of age.
   */
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

  async shutdown() {
    this.started = false;
    if (this.pollTimer) clearInterval(this.pollTimer);
    for (const timer of this.retryTimers) clearTimeout(timer);
    this.retryTimers.clear();

    if (this.ownsRedis && this.redis) {
      await this.redis.quit().catch(() => this.redis.disconnect());
    }
  }
}

export { JobQueue, JOB_STATUS };
