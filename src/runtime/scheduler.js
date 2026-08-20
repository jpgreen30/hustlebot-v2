import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import logger from '../utils/logger.js';
import { atomicWrite } from './journal.js';
import { nextRunAt } from './tz.js';
import { parseSchedule } from './nl-schedule.js';

export const SCHEDULE_STATUS = {
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  ERROR: 'ERROR'
};

export const OVERLAP = { SKIP: 'SKIP', QUEUE: 'QUEUE', ALLOW_BOUNDED: 'ALLOW_BOUNDED' };
export const MISSED = { RUN_ONCE: 'RUN_ONCE', SKIP: 'SKIP', CATCH_UP_BOUNDED: 'CATCH_UP_BOUNDED' };

export class DurableScheduler {
  constructor({ dir, onFire, journal, redis, workerId, pollMs } = {}) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
    this.onFire = onFire || null;
    this.journal = journal || null;
    this.redis = redis || null;
    this.workerId = workerId || `sched_${process.pid}`;
    this.pollMs = pollMs || 1000;
    this.timer = null;
    this.started = false;
    this.activeRuns = new Map();
  }

  pathFor(id) {
    return join(this.dir, `${id}.json`);
  }

  save(record) {
    record.updatedAt = new Date().toISOString();
    atomicWrite(this.pathFor(record.scheduleId), record);
    if (this.redis?.set) {
      this.redis.set(`hustlebot:schedule:${record.scheduleId}`, JSON.stringify(record), 'EX', 30 * 24 * 3600).catch?.(() => {});
      this.redis.sadd?.('hustlebot:schedules', record.scheduleId)?.catch?.(() => {});
    }
    return record;
  }

  async hydrateFromRedis() {
    if (!this.redis?.smembers) return 0;
    let ids = [];
    try { ids = await this.redis.smembers('hustlebot:schedules'); } catch { return 0; }
    let n = 0;
    for (const id of ids || []) {
      if (this.get(id)) continue;
      try {
        const raw = await this.redis.get(`hustlebot:schedule:${id}`);
        if (!raw) continue;
        const rec = JSON.parse(raw);
        atomicWrite(this.pathFor(rec.scheduleId), rec);
        n++;
      } catch { /* skip */ }
    }
    return n;
  }

  get(id) {
    const path = this.pathFor(id);
    if (!existsSync(path)) return null;
    try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
  }

  list({ status, limit = 50 } = {}) {
    return readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try { return JSON.parse(readFileSync(join(this.dir, f), 'utf8')); } catch { return null; }
      })
      .filter(Boolean)
      .filter((s) => !status || s.status === status)
      .sort((a, b) => String(a.nextRunAt || '').localeCompare(String(b.nextRunAt || '')))
      .slice(0, limit);
  }

  create(input = {}) {
    if (input.blocked) {
      return { status: 'blocked', reason: input.reason, blocked: true };
    }
    const parsed = input.kind ? input : parseSchedule(input.raw || input.text || '');
    if (!parsed || parsed.blocked) {
      return parsed || { status: 'error', error: 'Could not parse schedule' };
    }
    const template = String(parsed.objectiveTemplate || input.objectiveTemplate || '').trim();
    if (!template) return { status: 'error', error: 'Schedule is missing an objective template' };
    if (/(email|call|sms|dial|outreach)/i.test(template) && !/do not contact|don't contact/i.test(template)) {
      return { status: 'blocked', blocked: true, reason: 'Scheduled outreach is not authorized' };
    }
    const now = input.now ? new Date(input.now) : new Date();
    const next = parsed.nextRunAt ? new Date(parsed.nextRunAt) : nextRunAt(parsed, now);
    const record = {
      scheduleId: input.scheduleId || `sch_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      owner: input.owner || 'telegram',
      name: input.name || template.slice(0, 80),
      objectiveTemplate: template,
      timezone: parsed.timezone || 'America/Los_Angeles',
      recurrence: parsed,
      nextRunAt: next.toISOString(),
      lastRunAt: null,
      lastObjectiveId: null,
      status: SCHEDULE_STATUS.ACTIVE,
      constraints: { doNotContact: true, ...(input.constraints || {}) },
      approvalPolicy: parsed.approvalPolicy || 'side-effect',
      overlapPolicy: parsed.overlapPolicy || OVERLAP.SKIP,
      missedRunPolicy: parsed.missedRunPolicy || MISSED.RUN_ONCE,
      maxConcurrentRuns: Number(input.maxConcurrentRuns || 1),
      runCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.save(record);
    this.journal?.append({
      type: 'schedule.created',
      scheduleId: record.scheduleId,
      actor: record.owner,
      metadata: { nextRunAt: record.nextRunAt, recurrence: record.recurrence?.recurrence, template: record.objectiveTemplate }
    });
    return record;
  }

  pause(id) {
    const rec = this.get(id);
    if (!rec) return null;
    rec.status = SCHEDULE_STATUS.PAUSED;
    this.save(rec);
    this.journal?.append({ type: 'schedule.paused', scheduleId: id, actor: 'operator' });
    return rec;
  }

  resume(id) {
    const rec = this.get(id);
    if (!rec) return null;
    rec.status = SCHEDULE_STATUS.ACTIVE;
    if (new Date(rec.nextRunAt).getTime() < Date.now()) {
      rec.nextRunAt = nextRunAt(rec.recurrence, new Date()).toISOString();
    }
    this.save(rec);
    this.journal?.append({ type: 'schedule.resumed', scheduleId: id, actor: 'operator' });
    return rec;
  }

  cancel(id) {
    const rec = this.get(id);
    if (!rec) return null;
    rec.status = SCHEDULE_STATUS.CANCELLED;
    this.save(rec);
    this.journal?.append({ type: 'schedule.cancelled', scheduleId: id, actor: 'operator' });
    return rec;
  }

  remove(id) {
    const path = this.pathFor(id);
    if (existsSync(path)) unlinkSync(path);
    this.activeRuns.delete(id);
    return true;
  }

  async acquireLock() {
    if (!this.redis?.set) return true;
    const ok = await this.redis.set('hustlebot:scheduler:leader', this.workerId, 'EX', 15, 'NX');
    if (ok === 'OK' || ok === true) return true;
    const owner = await this.redis.get('hustlebot:scheduler:leader');
    if (owner === this.workerId) {
      await this.redis.expire?.('hustlebot:scheduler:leader', 15);
      return true;
    }
    return false;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.timer = setInterval(() => {
      this.tick().catch((error) => logger.error(`Scheduler tick failed: ${error.message}`));
    }, this.pollMs);
    if (this.timer.unref) this.timer.unref();
  }

  stop() {
    this.started = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(now = new Date()) {
    if (!this.started) return [];
    const leader = await this.acquireLock();
    if (!leader) return [];
    const fired = [];
    for (const rec of this.list({ status: SCHEDULE_STATUS.ACTIVE, limit: 100 })) {
      if (!rec.nextRunAt) continue;
      const due = new Date(rec.nextRunAt).getTime() <= now.getTime();
      if (!due) continue;
      const result = await this.fire(rec, now);
      if (result) fired.push(result);
    }
    return fired;
  }

  async fire(rec, now = new Date()) {
    const running = this.activeRuns.get(rec.scheduleId) || 0;
    if (running >= (rec.maxConcurrentRuns || 1) && rec.overlapPolicy === OVERLAP.SKIP) {
      rec.nextRunAt = this.advance(rec, now).toISOString();
      this.save(rec);
      this.journal?.append({
        type: 'schedule.skipped-overlap',
        scheduleId: rec.scheduleId,
        metadata: { policy: rec.overlapPolicy }
      });
      return { scheduleId: rec.scheduleId, skipped: true, reason: 'overlap-SKIP' };
    }

    const missedMs = now.getTime() - new Date(rec.nextRunAt).getTime();
    if (missedMs > 2 * 60 * 1000) {
      if (rec.missedRunPolicy === MISSED.SKIP) {
        rec.nextRunAt = this.advance(rec, now).toISOString();
        rec.lastRunAt = now.toISOString();
        this.save(rec);
        return { scheduleId: rec.scheduleId, skipped: true, reason: 'missed-SKIP' };
      }
      if (rec.missedRunPolicy === MISSED.CATCH_UP_BOUNDED) {
        // one catch-up only, then jump to next future occurrence
      }
    }

    this.activeRuns.set(rec.scheduleId, running + 1);
    rec.lastRunAt = now.toISOString();
    rec.runCount = (rec.runCount || 0) + 1;
    rec.nextRunAt = rec.recurrence?.kind === 'once' || rec.recurrence?.kind === 'delayed'
      ? null
      : this.advance(rec, now).toISOString();
    if (!rec.nextRunAt) rec.status = SCHEDULE_STATUS.COMPLETED;
    this.save(rec);

    let created = null;
    try {
      if (this.onFire) {
        created = await this.onFire(rec);
      }
    } catch (error) {
      rec.status = SCHEDULE_STATUS.ERROR;
      rec.lastError = error.message;
      this.save(rec);
      this.journal?.append({ type: 'schedule.error', scheduleId: rec.scheduleId, metadata: { error: error.message } });
      this.activeRuns.set(rec.scheduleId, Math.max(0, (this.activeRuns.get(rec.scheduleId) || 1) - 1));
      return { scheduleId: rec.scheduleId, error: error.message };
    }

    const objectiveId = created?.objectiveId || created?.objective?.objectiveId || null;
    rec.lastObjectiveId = objectiveId;
    this.save(rec);
    this.journal?.append({
      type: 'schedule.fired',
      scheduleId: rec.scheduleId,
      objectiveId,
      metadata: { template: rec.objectiveTemplate, contacted: false }
    });
    this.activeRuns.set(rec.scheduleId, Math.max(0, (this.activeRuns.get(rec.scheduleId) || 1) - 1));
    return { scheduleId: rec.scheduleId, objectiveId, created, firedAt: now.toISOString() };
  }

  advance(rec, from = new Date()) {
    const rule = rec.recurrence || {};
    if (rule.kind === 'once' || rule.kind === 'delayed') return from;
    return nextRunAt(rule, from);
  }

  markRunFinished(scheduleId) {
    const n = this.activeRuns.get(scheduleId) || 0;
    this.activeRuns.set(scheduleId, Math.max(0, n - 1));
  }

  inspect() {
    const items = this.list({ limit: 40 });
    return {
      active: items.filter((s) => s.status === SCHEDULE_STATUS.ACTIVE).length,
      paused: items.filter((s) => s.status === SCHEDULE_STATUS.PAUSED).length,
      schedules: items.map((s) => ({
        scheduleId: s.scheduleId,
        status: s.status,
        nextRunAt: s.nextRunAt,
        timezone: s.timezone,
        recurrence: s.recurrence?.recurrence || s.recurrence?.kind,
        template: s.objectiveTemplate,
        lastObjectiveId: s.lastObjectiveId,
        overlapPolicy: s.overlapPolicy,
        missedRunPolicy: s.missedRunPolicy
      }))
    };
  }
}
