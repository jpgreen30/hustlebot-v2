/**
 * Child-process harness for real process-death tests.
 * Spawned by runtime.test.js. Never used in production.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { JobQueue } from '../factories/job-queue.js';
import { DurableScheduler } from './scheduler.js';
import { OperationalMemory } from './memory.js';
import { EventJournal } from './journal.js';

const dir = process.env.HB_DATA_DIR;
const mode = process.env.HB_HARNESS;
if (!dir || !mode) {
  console.error('HB_DATA_DIR and HB_HARNESS required');
  process.exit(2);
}
mkdirSync(dir, { recursive: true });

if (mode === 'hang') {
  const queue = new JobQueue({
    dataDir: dir,
    namespace: 'day8',
    pollIntervalMs: 40,
    leaseMs: Number(process.env.HB_LEASE_MS || 500),
    retryDelay: 20,
    jobTimeout: 30000,
    maxAttempts: 5
  });
  queue.registerHandler('work', async (_payload, job) => {
    writeFileSync(join(dir, 'leased.json'), JSON.stringify({ jobId: job.id, pid: process.pid, attempts: job.attempts }));
    await new Promise(() => {});
  });
  await queue.start();
  await queue.createJob('work', { n: 1 }, { maxAttempts: 5 });
  await new Promise(() => {});
}

if (mode === 'delayed-enqueue') {
  const queue = new JobQueue({
    dataDir: dir,
    namespace: 'day8',
    pollIntervalMs: 50,
    leaseMs: 2000
  });
  await queue.initialize();
  const id = await queue.createJob('work', { n: 1 }, {
    delayMs: Number(process.env.HB_DELAY_MS || 1500),
    maxAttempts: 2
  });
  writeFileSync(join(dir, 'enqueued.json'), JSON.stringify({ jobId: id }));
  await queue.shutdown();
  process.exit(0);
}

if (mode === 'schedule-enqueue') {
  const journal = new EventJournal({ dir: join(dir, 'journal') });
  const scheduler = new DurableScheduler({
    dir: join(dir, 'schedules'),
    journal,
    pollMs: 200
  });
  const rec = scheduler.create({
    kind: 'delayed',
    delayMs: Number(process.env.HB_DELAY_MS || 1500),
    timezone: 'America/Los_Angeles',
    nextRunAt: new Date(Date.now() + Number(process.env.HB_DELAY_MS || 1500)).toISOString(),
    objectiveTemplate: 'Research 3 Los Angeles roofing companies and rank them. Do not contact anyone.',
    overlapPolicy: 'SKIP',
    missedRunPolicy: 'RUN_ONCE',
    owner: 'acceptance'
  });
  writeFileSync(join(dir, 'scheduled.json'), JSON.stringify({ scheduleId: rec.scheduleId, nextRunAt: rec.nextRunAt }));
  process.exit(0);
}

if (mode === 'memory-write') {
  const memory = new OperationalMemory({ dir: join(dir, 'memory') });
  const rec = memory.remember({
    type: 'pattern',
    subject: 'provider.yellowpages',
    content: 'Yellow Pages frequently 403s from Render; prefer public-web search then Firecrawl.',
    sourceRefs: ['obj_test'],
    confidence: 0.7,
    tags: ['provider', 'yellowpages', '403'],
    actor: 'macgyver',
    objectiveId: 'obj_test'
  });
  writeFileSync(join(dir, 'remembered.json'), JSON.stringify({ memoryId: rec.memoryId }));
  process.exit(0);
}

console.error(`unknown harness mode ${mode}`);
process.exit(2);
