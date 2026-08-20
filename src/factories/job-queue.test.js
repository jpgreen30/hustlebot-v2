/**
 * JOB QUEUE TESTS
 *
 * The durable path is exercised against a minimal in-memory stand-in for
 * ioredis implementing exactly the commands RedisJobStore uses. That lets
 * the restart-recovery test run without a Redis server while still covering
 * the real Redis code path rather than the memory fallback.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { JobQueue, JOB_STATUS } from './job-queue.js';

/** Minimal fake implementing the ioredis surface RedisJobStore touches. */
class FakeRedis {
  constructor() {
    this.strings = new Map();
    this.lists = new Map();
    this.sets = new Map();
    this.zsets = new Map();
  }

  list(k) {
    if (!this.lists.has(k)) this.lists.set(k, []);
    return this.lists.get(k);
  }

  set_(k) {
    if (!this.sets.has(k)) this.sets.set(k, new Set());
    return this.sets.get(k);
  }

  zset(k) {
    if (!this.zsets.has(k)) this.zsets.set(k, new Map());
    return this.zsets.get(k);
  }

  async ping() { return 'PONG'; }
  async set(k, v) { this.strings.set(k, v); return 'OK'; }
  async get(k) { return this.strings.get(k) ?? null; }
  async del(k) { return this.strings.delete(k) ? 1 : 0; }
  async rpush(k, v) { return this.list(k).push(v); }
  async lpop(k) { return this.list(k).shift() ?? null; }
  async llen(k) { return this.list(k).length; }
  async lrem(k, _count, v) {
    const arr = this.list(k);
    const i = arr.indexOf(v);
    if (i === -1) return 0;
    arr.splice(i, 1);
    return 1;
  }
  async sadd(k, v) { this.set_(k).add(v); return 1; }
  async srem(k, v) { return this.set_(k).delete(v) ? 1 : 0; }
  async smembers(k) { return [...this.set_(k)]; }
  async scard(k) { return this.set_(k).size; }
  async zadd(k, score, member) { this.zset(k).set(member, Number(score)); return 1; }
  async zrem(k, member) { return this.zset(k).delete(member) ? 1 : 0; }
  async zcard(k) { return this.zset(k).size; }
  async zrangebyscore(k, min, max) {
    const lo = min === '-inf' ? -Infinity : Number(min);
    const hi = max === '+inf' ? Infinity : Number(max);
    return [...this.zset(k).entries()]
      .filter(([, s]) => s >= lo && s <= hi)
      .sort((a, b) => a[1] - b[1])
      .map(([m]) => m);
  }

  multi() {
    const ops = [];
    const chain = {
      set: (...a) => (ops.push(['set', a]), chain),
      zadd: (...a) => (ops.push(['zadd', a]), chain),
      del: (...a) => (ops.push(['del', a]), chain),
      zrem: (...a) => (ops.push(['zrem', a]), chain),
      srem: (...a) => (ops.push(['srem', a]), chain),
      exec: async () => {
        for (const [cmd, args] of ops) await this[cmd](...args);
        return ops.map(() => [null, 'OK']);
      }
    };
    return chain;
  }
}

const waitFor = async (predicate, { timeout = 2000, interval = 10 } = {}) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error('Timed out waiting for condition');
};

describe('JobQueue', () => {
  test('runs a job through its registered handler and stores the result', async () => {
    const queue = new JobQueue({ redis: new FakeRedis(), pollIntervalMs: 20 });
    queue.registerHandler('greet', async ({ name }) => `hello ${name}`);
    await queue.start();

    const id = await queue.createJob('greet', { name: 'world' });
    await waitFor(async () => (await queue.getJob(id))?.status === JOB_STATUS.COMPLETED);

    const job = await queue.getJob(id);
    assert.strictEqual(job.result, 'hello world');
    assert.strictEqual(job.progress, 100);
    assert.strictEqual(job.attempts, 1);
    await queue.shutdown();
  });

  test('requeues jobs left running by a crashed process', async () => {
    const redis = new FakeRedis();

    const crashed = new JobQueue({ redis, pollIntervalMs: 20, leaseMs: 80, retryDelay: 10 });
    crashed.registerHandler('slow', () => new Promise(() => {}));
    await crashed.start();
    const id = await crashed.createJob('slow', { n: 1 });
    await waitFor(async () => (await crashed.getJob(id))?.status === JOB_STATUS.RUNNING);
    clearInterval(crashed.pollTimer);
    crashed.started = false;
    crashed.abandonInFlightForTest(id);

    const recovered = new JobQueue({ redis, pollIntervalMs: 20, leaseMs: 80, retryDelay: 10 });
    const seen = [];
    recovered.registerHandler('slow', async (payload) => {
      seen.push(payload);
      return 'finished after restart';
    });
    await recovered.start();

    await waitFor(async () => (await recovered.getJob(id))?.status === JOB_STATUS.COMPLETED, { timeout: 4000 });
    const job = await recovered.getJob(id);
    assert.strictEqual(job.result, 'finished after restart');
    assert.deepStrictEqual(seen, [{ n: 1 }]);
    await recovered.shutdown();
  });

  test('retries a failing job up to maxAttempts, then fails permanently', async () => {
    const queue = new JobQueue({ redis: new FakeRedis(), pollIntervalMs: 20, retryDelay: 10 });
    let calls = 0;
    queue.registerHandler('flaky', async () => {
      calls++;
      throw new Error('boom');
    });
    await queue.start();

    const id = await queue.createJob('flaky', {}, { maxAttempts: 3 });
    await waitFor(async () => {
      const s = (await queue.getJob(id))?.status;
      return s === JOB_STATUS.FAILED || s === JOB_STATUS.DEAD_LETTER;
    }, { timeout: 4000 });

    const job = await queue.getJob(id);
    assert.strictEqual(calls, 3);
    assert.strictEqual(job.attempts, 3);
    assert.match(job.error, /boom/);
    assert.ok(job.status === JOB_STATUS.DEAD_LETTER || job.status === JOB_STATUS.FAILED);
    await queue.shutdown();
  });

  test('succeeds on a retry after a transient failure', async () => {
    const queue = new JobQueue({ redis: new FakeRedis(), pollIntervalMs: 20, retryDelay: 10 });
    let calls = 0;
    queue.registerHandler('transient', async () => {
      if (++calls === 1) throw new Error('first attempt fails');
      return 'ok on retry';
    });
    await queue.start();

    const id = await queue.createJob('transient', {});
    await waitFor(async () => (await queue.getJob(id))?.status === JOB_STATUS.COMPLETED, { timeout: 4000 });

    const job = await queue.getJob(id);
    assert.strictEqual(job.result, 'ok on retry');
    assert.strictEqual(job.attempts, 2);
    await queue.shutdown();
  });

  test('times out a handler that hangs', async () => {
    const queue = new JobQueue({
      redis: new FakeRedis(), pollIntervalMs: 20, jobTimeout: 50, retryDelay: 5
    });
    queue.registerHandler('hang', () => new Promise(() => {}));
    await queue.start();

    const id = await queue.createJob('hang', {}, { maxAttempts: 1 });
    await waitFor(async () => {
      const s = (await queue.getJob(id))?.status;
      return s === JOB_STATUS.FAILED || s === JOB_STATUS.DEAD_LETTER;
    }, { timeout: 4000 });

    assert.match((await queue.getJob(id)).error, /timed out/i);
    await queue.shutdown();
  });

  test('fails a job whose type has no handler', async () => {
    const queue = new JobQueue({ redis: new FakeRedis(), pollIntervalMs: 20 });
    queue.registerHandler('known', async () => 'x');
    await queue.start();

    const id = await queue.createJob('unknown-type', {}, { maxAttempts: 1 });
    await waitFor(async () => (await queue.getJob(id))?.status === JOB_STATUS.FAILED);

    assert.match((await queue.getJob(id)).error, /No handler registered/);
    await queue.shutdown();
  });

  test('cancels a queued job so it never runs', async () => {
    const queue = new JobQueue({ redis: new FakeRedis(), maxConcurrent: 1, pollIntervalMs: 10000 });
    let ran = false;
    queue.registerHandler('later', async () => { ran = true; });
    await queue.initialize();
    // Not started, so the job stays queued and cancellation can win the race.
    const id = await queue.createJob('later', {});

    assert.strictEqual(await queue.cancel(id), true);
    assert.strictEqual((await queue.getJob(id)).status, JOB_STATUS.CANCELLED);

    await queue.start();
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(ran, false, 'cancelled job must not execute');
    await queue.shutdown();
  });

  test('exposes the spec statuses and tracks progress', async () => {
    const queue = new JobQueue({ redis: new FakeRedis(), pollIntervalMs: 10000 });
    await queue.initialize();
    const id = await queue.createJob('x', {});

    await queue.setStatus(id, JOB_STATUS.AWAITING_APPROVAL);
    assert.strictEqual((await queue.getJob(id)).status, 'awaiting_approval');

    await queue.updateProgress(id, 42, 'drafting');
    const job = await queue.getJob(id);
    assert.strictEqual(job.progress, 42);
    assert.strictEqual(job.stage, 'drafting');

    await assert.rejects(() => queue.setStatus(id, 'not-a-status'));

    const statuses = Object.values(JOB_STATUS);
    for (const s of ['queued', 'planning', 'running', 'awaiting_dependency',
      'awaiting_approval', 'retrying', 'completed', 'failed', 'cancelled']) {
      assert.ok(statuses.includes(s), `missing spec status: ${s}`);
    }
    await queue.shutdown();
  });

  test('cleanup removes finished jobs but keeps unfinished ones', async () => {
    const queue = new JobQueue({ redis: new FakeRedis(), pollIntervalMs: 10000, retentionMs: 0 });
    await queue.initialize();

    const done = await queue.createJob('a', {});
    const pending = await queue.createJob('b', {});
    await queue.setStatus(done, JOB_STATUS.COMPLETED);
    await new Promise((r) => setTimeout(r, 5));

    const cleaned = await queue.cleanup();
    assert.strictEqual(cleaned, 1);
    assert.strictEqual(await queue.getJob(done), null);
    assert.ok(await queue.getJob(pending), 'unfinished job must survive cleanup');
    await queue.shutdown();
  });

  test('falls back to in-memory storage when Redis is absent', async () => {
    const queue = new JobQueue({ redisUrl: null, dataDir: null, pollIntervalMs: 20 });
    queue.registerHandler('mem', async () => 'ran');
    await queue.start();

    assert.strictEqual(queue.durable, false);
    const id = await queue.createJob('mem', {});
    await waitFor(async () => (await queue.getJob(id))?.status === JOB_STATUS.COMPLETED);
    assert.strictEqual((await queue.getJob(id)).result, 'ran');

    const stats = await queue.getStats();
    assert.strictEqual(stats.durable, false);
    assert.ok(stats.handlers.includes('mem'));
    await queue.shutdown();
  });

  test('delayed jobs wait until availableAt', async () => {
    const queue = new JobQueue({ redis: new FakeRedis(), pollIntervalMs: 20, retryDelay: 10 });
    const ran = [];
    queue.registerHandler('later', async (p) => { ran.push(p.n); return 'ok'; });
    await queue.start();
    const id = await queue.createJob('later', { n: 1 }, { delayMs: 200 });
    await new Promise((r) => setTimeout(r, 50));
    assert.notEqual((await queue.getJob(id)).status, JOB_STATUS.COMPLETED);
    await waitFor(async () => (await queue.getJob(id))?.status === JOB_STATUS.COMPLETED, { timeout: 4000 });
    assert.deepStrictEqual(ran, [1]);
    await queue.shutdown();
  });

  test('idempotency key returns the existing job', async () => {
    const queue = new JobQueue({ redis: new FakeRedis(), pollIntervalMs: 10000 });
    await queue.initialize();
    const a = await queue.createJob('x', { n: 1 }, { idempotencyKey: 'same' });
    const b = await queue.createJob('x', { n: 2 }, { idempotencyKey: 'same' });
    assert.strictEqual(a, b);
    await queue.shutdown();
  });

  test('auth failures are not retried', async () => {
    const queue = new JobQueue({ redis: new FakeRedis(), pollIntervalMs: 20, retryDelay: 10 });
    let calls = 0;
    queue.registerHandler('auth', async () => {
      calls++;
      const err = new Error('unauthorized invalid api key');
      err.status = 401;
      throw err;
    });
    await queue.start();
    const id = await queue.createJob('auth', {}, { maxAttempts: 5 });
    await waitFor(async () => {
      const s = (await queue.getJob(id))?.status;
      return s === JOB_STATUS.FAILED || s === JOB_STATUS.DEAD_LETTER;
    }, { timeout: 4000 });
    assert.strictEqual(calls, 1);
    await queue.shutdown();
  });

  test('pause keeps a queued job from running until resume', async () => {
    const queue = new JobQueue({ redis: new FakeRedis(), maxConcurrent: 1, pollIntervalMs: 10000 });
    let ran = 0;
    queue.registerHandler('p', async () => { ran++; return 'go'; });
    await queue.initialize();
    const id = await queue.createJob('p', {});
    assert.strictEqual(await queue.pause(id), true);
    assert.strictEqual((await queue.getJob(id)).status, JOB_STATUS.PAUSED);
    await queue.start();
    await new Promise((r) => setTimeout(r, 40));
    assert.strictEqual(ran, 0);
    await queue.resume(id);
    await waitFor(async () => (await queue.getJob(id))?.status === JOB_STATUS.COMPLETED);
    assert.strictEqual(ran, 1);
    await queue.shutdown();
  });
});

