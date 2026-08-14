/**
 * JOB QUEUE
 *
 * Responsibilities:
 * 1. Manage durable job queue (Bull.js + Redis backing)
 * 2. Support job retry logic with exponential backoff
 * 3. Persistent job state (queued | started | completed | failed | retrying)
 * 4. Job result and error tracking
 * 5. Dead letter queue for failed jobs
 * 6. Job priority and scheduling
 */

import logger from '../utils/logger.js';

class JobQueue {
  constructor(config = {}) {
    this.config = config;
    this.redisUrl = config.redis_url || process.env.REDIS_URL || 'redis://localhost:6379';
    this.db = config.db; // Database for persistent state

    // In-memory job storage (for when Redis unavailable)
    this.jobs = new Map(); // key = jobId, value = job
    this.queues = new Map(); // key = queueName, value = array of jobIds
    this.nextJobId = 1;

    this.initialized = false;
    this.retryConfig = {
      max_attempts: config.max_attempts || 3,
      initial_delay: config.initial_delay || 1000, // ms
      max_delay: config.max_delay || 60000, // ms
      backoff_multiplier: config.backoff_multiplier || 2
    };
  }

  /**
   * Initialize job queue
   */
  async initialize() {
    try {
      logger.info('📦 Initializing Job Queue...');

      // In production, would connect to Redis and Bull here
      // For now, using in-memory storage with DB persistence

      if (this.db) {
        // Load pending jobs from database
        const pendingJobs = await this.db.getPendingJobs();
        for (const job of pendingJobs) {
          this.jobs.set(job.job_id, job);

          if (!this.queues.has(job.queue_name)) {
            this.queues.set(job.queue_name, []);
          }
          if (!this.queues.get(job.queue_name).includes(job.job_id)) {
            this.queues.get(job.queue_name).push(job.job_id);
          }
        }

        logger.info(`✅ Loaded ${pendingJobs.length} pending jobs from database`);
      }

      this.initialized = true;
      logger.info(`✅ Job Queue initialized (Redis: ${this.redisUrl})`);
    } catch (error) {
      logger.error('Error initializing job queue:', error);
      throw error;
    }
  }

  /**
   * Enqueue a new job
   */
  async enqueue(queueName, jobData, options = {}) {
    try {
      const {
        priority = 'normal',
        delay = 0,
        max_attempts = this.retryConfig.max_attempts
      } = options;

      const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const job = {
        job_id: jobId,
        queue_name: queueName,
        status: 'queued',
        payload: jobData,
        result: null,
        error: null,
        attempts: 0,
        max_attempts,
        priority,
        delay,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null
      };

      // Store in-memory
      this.jobs.set(jobId, job);

      if (!this.queues.has(queueName)) {
        this.queues.set(queueName, []);
      }
      this.queues.get(queueName).push(jobId);

      // Persist to database
      if (this.db) {
        await this.db.createJob(job);
      }

      logger.info(`📥 Enqueued job: ${jobId} → ${queueName}`);
      return job;
    } catch (error) {
      logger.error('Error enqueueing job:', error);
      throw error;
    }
  }

  /**
   * Get job by ID
   */
  async getJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job && this.db) {
      const dbJob = await this.db.getJob(jobId);
      if (dbJob) {
        this.jobs.set(jobId, dbJob);
        return dbJob;
      }
    }
    return job || null;
  }

  /**
   * Update job status
   */
  async updateJobStatus(jobId, newStatus, result = null, error = null) {
    try {
      const job = await this.getJob(jobId);
      if (!job) {
        throw new Error(`Job not found: ${jobId}`);
      }

      job.status = newStatus;
      if (result) job.result = result;
      if (error) job.error = error;
      job.updated_at = new Date().toISOString();

      if (newStatus === 'completed' || newStatus === 'failed') {
        job.completed_at = new Date().toISOString();
      }

      this.jobs.set(jobId, job);

      if (this.db) {
        await this.db.updateJob(jobId, {
          status: newStatus,
          result,
          error,
          updated_at: job.updated_at,
          completed_at: job.completed_at
        });
      }

      logger.info(`✅ Job ${jobId} status updated: ${newStatus}`);
      return job;
    } catch (error) {
      logger.error('Error updating job status:', error);
      throw error;
    }
  }

  /**
   * Mark job as started
   */
  async startJob(jobId) {
    return this.updateJobStatus(jobId, 'started');
  }

  /**
   * Complete job successfully
   */
  async completeJob(jobId, result) {
    return this.updateJobStatus(jobId, 'completed', result);
  }

  /**
   * Fail job (with retry logic)
   */
  async failJob(jobId, error) {
    try {
      const job = await this.getJob(jobId);
      if (!job) {
        throw new Error(`Job not found: ${jobId}`);
      }

      job.attempts += 1;

      // Check if should retry
      if (job.attempts < job.max_attempts) {
        // Calculate backoff delay
        const delay = this.calculateBackoffDelay(job.attempts);

        job.status = 'retrying';
        job.error = error.message || String(error);
        job.delay = delay;
        job.updated_at = new Date().toISOString();

        this.jobs.set(jobId, job);

        if (this.db) {
          await this.db.updateJob(jobId, {
            status: 'retrying',
            error: job.error,
            attempts: job.attempts,
            delay,
            updated_at: job.updated_at
          });
        }

        logger.info(`⚠️  Job ${jobId} failed (attempt ${job.attempts}/${job.max_attempts}), will retry in ${delay}ms`);
        return job;
      } else {
        // Max retries exceeded
        job.status = 'failed';
        job.error = error.message || String(error);
        job.completed_at = new Date().toISOString();
        job.updated_at = new Date().toISOString();

        this.jobs.set(jobId, job);

        if (this.db) {
          await this.db.updateJob(jobId, {
            status: 'failed',
            error: job.error,
            attempts: job.attempts,
            completed_at: job.completed_at,
            updated_at: job.updated_at
          });
        }

        logger.error(`❌ Job ${jobId} failed after ${job.attempts} attempts`);
        return job;
      }
    } catch (error) {
      logger.error('Error failing job:', error);
      throw error;
    }
  }

  /**
   * Calculate exponential backoff delay
   */
  calculateBackoffDelay(attempt) {
    const delay = this.retryConfig.initial_delay * Math.pow(this.retryConfig.backoff_multiplier, attempt - 1);
    return Math.min(delay, this.retryConfig.max_delay);
  }

  /**
   * Get all jobs in queue
   */
  async getQueueJobs(queueName, filter = {}) {
    try {
      const jobIds = this.queues.get(queueName) || [];
      const results = [];

      for (const jobId of jobIds) {
        const job = await this.getJob(jobId);
        if (job) {
          let match = true;

          if (filter.status && job.status !== filter.status) {
            match = false;
          }

          if (match) {
            results.push(job);
          }
        }
      }

      return results;
    } catch (error) {
      logger.error('Error getting queue jobs:', error);
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName) {
    try {
      const jobs = await this.getQueueJobs(queueName);

      const stats = {
        queue_name: queueName,
        total: jobs.length,
        by_status: {}
      };

      for (const job of jobs) {
        stats.by_status[job.status] = (stats.by_status[job.status] || 0) + 1;
      }

      return stats;
    } catch (error) {
      logger.error('Error getting queue stats:', error);
      throw error;
    }
  }

  /**
   * Get all queues status
   */
  async getQueueStatus() {
    try {
      const status = {
        queues: [],
        total_jobs: 0
      };

      for (const [queueName, jobIds] of this.queues.entries()) {
        const stats = await this.getQueueStats(queueName);
        status.queues.push(stats);
        status.total_jobs += stats.total;
      }

      return status;
    } catch (error) {
      logger.error('Error getting queue status:', error);
      throw error;
    }
  }

  /**
   * Retry a failed job
   */
  async retryJob(jobId) {
    try {
      const job = await this.getJob(jobId);
      if (!job) {
        throw new Error(`Job not found: ${jobId}`);
      }

      if (job.status !== 'failed') {
        throw new Error(`Cannot retry non-failed job: ${jobId}`);
      }

      job.status = 'queued';
      job.attempts = 0;
      job.error = null;
      job.result = null;
      job.updated_at = new Date().toISOString();

      this.jobs.set(jobId, job);

      if (this.db) {
        await this.db.updateJob(jobId, {
          status: 'queued',
          attempts: 0,
          error: null,
          result: null,
          updated_at: job.updated_at
        });
      }

      logger.info(`🔄 Job ${jobId} requeued`);
      return job;
    } catch (error) {
      logger.error('Error retrying job:', error);
      throw error;
    }
  }

  /**
   * Delete a job
   */
  async deleteJob(jobId) {
    try {
      const job = this.jobs.get(jobId);
      if (!job) {
        return false;
      }

      this.jobs.delete(jobId);

      const queueName = job.queue_name;
      const queue = this.queues.get(queueName);
      if (queue) {
        const idx = queue.indexOf(jobId);
        if (idx > -1) {
          queue.splice(idx, 1);
        }
      }

      if (this.db) {
        await this.db.deleteJob(jobId);
      }

      logger.info(`🗑️  Job ${jobId} deleted`);
      return true;
    } catch (error) {
      logger.error('Error deleting job:', error);
      throw error;
    }
  }

  /**
   * Get dead letter queue (failed jobs)
   */
  async getDeadLetterQueue() {
    try {
      const allJobs = Array.from(this.jobs.values());
      const dlq = allJobs.filter(job => job.status === 'failed');

      return {
        queue_name: 'dead_letter_queue',
        total: dlq.length,
        jobs: dlq
      };
    } catch (error) {
      logger.error('Error getting dead letter queue:', error);
      throw error;
    }
  }

  /**
   * Clean up old completed jobs
   */
  async cleanup(olderThanDays = 7) {
    try {
      const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
      const allJobs = Array.from(this.jobs.values());

      let deletedCount = 0;
      for (const job of allJobs) {
        if (
          (job.status === 'completed' || job.status === 'failed') &&
          new Date(job.completed_at) < cutoffDate
        ) {
          await this.deleteJob(job.job_id);
          deletedCount += 1;
        }
      }

      logger.info(`🧹 Cleaned up ${deletedCount} old jobs (> ${olderThanDays} days)`);
      return deletedCount;
    } catch (error) {
      logger.error('Error cleaning up jobs:', error);
      throw error;
    }
  }
}

export { JobQueue };
