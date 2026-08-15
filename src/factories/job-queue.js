/**
 * JOB QUEUE MANAGER
 *
 * Manages content generation jobs with:
 * - Async tracking and status updates
 * - Rate limiting (max concurrent jobs)
 * - Timeout handling
 * - Job history
 */

import logger from '../utils/logger.js';

class JobQueue {
  constructor(config = {}) {
    this.maxConcurrent = config.maxConcurrent || 3;
    this.jobTimeout = config.jobTimeout || 120000; // 2 minutes
    this.jobs = new Map();
    this.queue = [];
    this.activeCount = 0;
    this.jobId = 0;
  }

  /**
   * Create a new job
   */
  createJob(type, data) {
    const id = `job-${Date.now()}-${++this.jobId}`;
    const job = {
      id,
      type,
      data,
      status: 'queued',
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      progress: 0,
      result: null,
      error: null
    };

    this.jobs.set(id, job);
    this.queue.push(id);
    logger.info(`📋 Job created: ${id} (${type})`);

    // Auto-process queue
    this.processQueue();

    return id;
  }

  /**
   * Process queue - run next available job
   */
  async processQueue() {
    if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const jobId = this.queue.shift();
    const job = this.jobs.get(jobId);

    if (!job) return;

    this.activeCount++;
    job.status = 'running';
    job.startedAt = new Date();
    logger.info(`⚙️  Job started: ${jobId}`);

    try {
      // Execute with timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Job timeout')), this.jobTimeout)
      );

      await Promise.race([job.data.execute(), timeoutPromise]);

      job.status = 'completed';
      job.completedAt = new Date();
      logger.info(`✅ Job completed: ${jobId}`);
    } catch (error) {
      job.status = 'failed';
      job.error = error.message;
      job.completedAt = new Date();
      logger.error(`❌ Job failed: ${jobId} - ${error.message}`);
    } finally {
      this.activeCount--;
      // Process next job
      this.processQueue();
    }
  }

  /**
   * Get job status
   */
  getJob(jobId) {
    return this.jobs.get(jobId);
  }

  /**
   * Update job progress
   */
  updateProgress(jobId, progress, stage) {
    const job = this.jobs.get(jobId);
    if (job) {
      job.progress = Math.min(100, progress);
      if (stage) job.stage = stage;
    }
  }

  /**
   * Set job result
   */
  setResult(jobId, result) {
    const job = this.jobs.get(jobId);
    if (job) {
      job.result = result;
    }
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      queueLength: this.queue.length,
      activeJobs: this.activeCount,
      totalJobs: this.jobs.size,
      maxConcurrent: this.maxConcurrent
    };
  }

  /**
   * Clean up old jobs (older than 1 hour)
   */
  cleanup() {
    const oneHourAgo = Date.now() - 3600000;
    let cleaned = 0;

    for (const [id, job] of this.jobs.entries()) {
      if (job.completedAt && job.completedAt.getTime() < oneHourAgo) {
        this.jobs.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`🧹 Cleaned up ${cleaned} old jobs`);
    }
  }
}

export { JobQueue };
