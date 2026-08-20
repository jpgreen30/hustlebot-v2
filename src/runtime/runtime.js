import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import logger from '../utils/logger.js';
import { EventJournal, atomicWrite } from './journal.js';
import { OperationalMemory } from './memory.js';
import { DurableScheduler } from './scheduler.js';
import { formatMorningReport, formatQueueInspect, formatScheduleInspect } from './report.js';
import { matchScheduleIntent, parseSchedule } from './nl-schedule.js';
import { OBJECTIVE_STATUS } from '../objective/schema.js';

export class DurableRuntime {
  constructor({
    dataDir,
    jobQueue,
    engine,
    approvalGate,
    n8n,
    redis,
    telegram,
    journal,
    memory,
    scheduler
  } = {}) {
    this.dataDir = dataDir;
    mkdirSync(dataDir, { recursive: true });
    this.jobQueue = jobQueue;
    this.engine = engine;
    this.approvalGate = approvalGate;
    this.n8n = n8n;
    this.redis = redis || null;
    this.telegram = telegram || null;
    this.journal = journal || new EventJournal({ dir: join(dataDir, 'journal') });
    this.memory = memory || new OperationalMemory({ dir: join(dataDir, 'memory') });
    this.scheduler = scheduler || new DurableScheduler({
      dir: join(dataDir, 'schedules'),
      journal: this.journal,
      redis: this.redis,
      onFire: (schedule) => this.fireSchedule(schedule)
    });
    this.startupReport = null;
    this.effectsPath = join(dataDir, 'effects.json');
    this.effectLog = new Map();
    if (existsSync(this.effectsPath)) {
      try {
        const saved = JSON.parse(readFileSync(this.effectsPath, 'utf8'));
        for (const [key, value] of Object.entries(saved)) this.effectLog.set(key, value);
      } catch { /* ignore corrupt effect log */ }
    }
  }

  persistEffects() {
    atomicWrite(this.effectsPath, Object.fromEntries(this.effectLog));
  }

  async checkpointObjective(record) {
    if (!this.redis?.set || !record?.objectiveId) return;
    try {
      const safe = JSON.parse(JSON.stringify(record));
      await this.redis.set(`hustlebot:objective:${record.objectiveId}`, JSON.stringify(safe), 'EX', 14 * 24 * 3600);
      await this.redis.sadd('hustlebot:objectives:active', record.objectiveId);
    } catch (error) {
      logger.warn(`Objective redis checkpoint failed: ${error.message}`);
    }
  }

  async loadObjectivesFromRedis() {
    if (!this.redis?.smembers || !this.engine) return [];
    let ids = [];
    try { ids = await this.redis.smembers('hustlebot:objectives:active'); } catch { return []; }
    const out = [];
    for (const id of ids || []) {
      try {
        const raw = await this.redis.get(`hustlebot:objective:${id}`);
        if (!raw) continue;
        const rec = JSON.parse(raw);
        this.engine.objectives.set(rec.objectiveId, rec);
        this.engine.memory.save(rec);
        out.push(rec);
      } catch { /* skip corrupt */ }
    }
    return out;
  }

  async start() {
    this.wireEngine();
    this.registerHandlers();
    await this.loadObjectivesFromRedis();
    try { await this.scheduler.hydrateFromRedis(); } catch { /* optional */ }
    const recovered = await this.recover();
    this.scheduler.start();
    this.startupReport = recovered;
    logger.info(
      `✅ Day-8 durable runtime ready (jobs recovered=${recovered.jobs}, objectives=${recovered.objectives}, schedules=${recovered.schedules}, approvals=${recovered.approvals})`
    );
    return recovered;
  }

  wireEngine() {
    if (!this.engine) return;
    this.engine.journal = this.journal;
    this.engine.operationalMemory = this.memory;
    this.engine.runtime = this;
    this.engine.hydrate?.();
  }

  registerHandlers() {
    if (!this.jobQueue) return;
    if (!this.jobQueue.handlers.has('objective.run')) {
      this.jobQueue.registerHandler('objective.run', async (payload) => this.runObjectiveJob(payload));
    }
    if (!this.jobQueue.handlers.has('n8n.dispatch')) {
      this.jobQueue.registerHandler('n8n.dispatch', async (payload) => this.dispatchN8n(payload));
    }
    if (!this.jobQueue.handlers.has('telegram.report')) {
      this.jobQueue.registerHandler('telegram.report', async (payload) => this.sendTelegramReport(payload));
    }
  }

  async recover() {
    const objectives = this.engine?.hydrate?.() || [];
    const activeObjectives = (objectives || []).filter((o) =>
      ['running', 'paused', 'awaiting_approval', 'validated', 'planned'].includes(o.status)
    );
    let jobs = 0;
    let leases = 0;
    if (this.jobQueue) {
      await this.jobQueue.recoverInterruptedJobs();
      leases = await this.jobQueue.recoverExpiredLeases();
      jobs = this.jobQueue.recoveredJobs;
      for (const rec of activeObjectives) {
        if (rec.status === OBJECTIVE_STATUS.RUNNING || rec.status === 'running') {
          await this.jobQueue.createJob('objective.run', { objectiveId: rec.objectiveId, resume: true }, {
            idempotencyKey: `objective.run:${rec.objectiveId}`,
            objectiveId: rec.objectiveId
          });
        }
      }
    }
    const schedules = this.scheduler.list({ limit: 100 });
    let approvals = [];
    if (this.approvalGate?.list) {
      try { approvals = await this.approvalGate.list({ status: 'pending' }); } catch { approvals = []; }
    }
    const deadLetter = this.jobQueue ? (await this.jobQueue.listJobs({ status: 'dead_letter', limit: 20 })) : [];
    this.journal.append({
      type: 'runtime.recovered',
      actor: 'startup',
      metadata: {
        jobs,
        leases,
        objectives: activeObjectives.length,
        schedules: schedules.length,
        approvals: approvals.length,
        deadLetter: deadLetter.length
      }
    });
    return {
      jobs,
      leases,
      objectives: activeObjectives.length,
      schedules: schedules.filter((s) => s.status === 'ACTIVE').length,
      approvals: approvals.length,
      deadLetter: deadLetter.length,
      activeObjectiveIds: activeObjectives.map((o) => o.objectiveId)
    };
  }

  async runObjectiveJob(payload = {}) {
    const id = payload.objectiveId;
    if (!this.engine) throw new Error('MacGyver engine missing');
    const rec = this.engine.get(id);
    if (!rec) throw new Error(`Unknown objective ${id}`);
    if (rec.status === OBJECTIVE_STATUS.COMPLETED) {
      return { status: 'ok', skipped: true, reason: 'already completed', objectiveId: id };
    }
    if (rec.status === OBJECTIVE_STATUS.CANCELLED) {
      return { status: 'cancelled', objectiveId: id };
    }
    if (rec.status === OBJECTIVE_STATUS.PAUSED) {
      return { status: 'paused', objectiveId: id };
    }
    this.journal.append({ type: 'job.leased', objectiveId: id, actor: 'worker' });
    const result = await this.engine.continue(id, payload);
    this.journal.append({
      type: rec.status === OBJECTIVE_STATUS.COMPLETED || result.status === 'ok' ? 'objective.completed' : `objective.${result.status}`,
      objectiveId: id,
      actor: 'worker',
      metadata: { contacted: result.contacted === true }
    });
    if (payload.telegramReport && result.status === 'ok') {
      await this.sendTelegramReport({ objectiveId: id, text: formatMorningReport(this.engine.get(id)) });
    }
    return result;
  }

  async dispatchN8n(payload = {}) {
    const key = payload.idempotencyKey;
    if (key && this.effectLog.has(key)) {
      return { ...this.effectLog.get(key), idempotentReplay: true };
    }
    if (!this.n8n?.execute) {
      const recorded = { status: 'recorded', alias: payload.alias, idempotencyKey: key, contacted: false };
      if (key) {
        this.effectLog.set(key, recorded);
        this.persistEffects();
      }
      return recorded;
    }
    const result = await this.n8n.execute(payload.alias, { ...payload, idempotencyKey: key });
    if (key) {
      this.effectLog.set(key, { ...result, idempotencyKey: key });
      this.persistEffects();
    }
    this.journal.append({
      type: 'tool.invoked',
      jobId: payload.jobId,
      metadata: { alias: payload.alias, idempotencyKey: key, status: result.status }
    });
    return result;
  }

  async sendTelegramReport(payload = {}) {
    const text = payload.text || formatMorningReport(this.engine?.get(payload.objectiveId) || {});
    if (this.telegram?.telegram?.sendMessage && payload.chatId) {
      await this.telegram.telegram.sendMessage(payload.chatId, text);
      return { status: 'sent', via: 'telegram' };
    }
    this.journal.append({ type: 'report.recorded', metadata: { preview: text.slice(0, 240) } });
    return { status: 'recorded', report: text, via: 'journal' };
  }

  async enqueueObjective(objective, options = {}) {
    if (!this.jobQueue) return null;
    return this.jobQueue.createJob('objective.run', {
      objectiveId: objective.objectiveId,
      telegramReport: options.telegramReport === true
    }, {
      idempotencyKey: `objective.run:${objective.objectiveId}`,
      objectiveId: objective.objectiveId,
      delayMs: options.delayMs
    });
  }

  async fireSchedule(schedule) {
    const template = schedule.objectiveTemplate;
    if (/(email|call|sms|dial|outreach)/i.test(template) && !/do not contact/i.test(template)) {
      this.journal.append({ type: 'schedule.blocked', scheduleId: schedule.scheduleId, metadata: { reason: 'outreach' } });
      return { blocked: true, reason: 'Scheduled outreach is not authorized' };
    }
    const raw = /do not contact/i.test(template) ? template : `${template} Do not contact anyone.`;
    const started = this.engine.begin({ rawRequest: raw, actor: `schedule:${schedule.scheduleId}` });
    started.promise.catch((error) => logger.error(`Scheduled objective failed: ${error.message}`));
    await this.enqueueObjective(started.objective, { telegramReport: true });
    return { objectiveId: started.objective.objectiveId, status: 'accepted' };
  }

  async handleNaturalLanguage(text, { userId } = {}) {
    const matched = matchScheduleIntent(text);
    if (!matched) return null;
    if (matched.action === 'inspect-schedule') {
      return { reply: formatScheduleInspect(this.scheduler.inspect()), kind: 'schedule.inspect' };
    }
    if (matched.action === 'pause-schedule') {
      const latest = this.scheduler.list({ status: 'ACTIVE', limit: 1 })[0];
      if (!latest) return { reply: 'No active schedule to pause.', kind: 'schedule.pause' };
      this.scheduler.pause(latest.scheduleId);
      return { reply: `Paused schedule ${latest.scheduleId}.`, kind: 'schedule.pause', scheduleId: latest.scheduleId };
    }
    if (matched.action === 'resume-schedule') {
      const latest = this.scheduler.list({ status: 'PAUSED', limit: 1 })[0]
        || this.scheduler.list({ limit: 1 })[0];
      if (!latest) return { reply: 'No schedule to resume.', kind: 'schedule.resume' };
      this.scheduler.resume(latest.scheduleId);
      return { reply: `Resumed schedule ${latest.scheduleId}. Next run ${this.scheduler.get(latest.scheduleId)?.nextRunAt}.`, kind: 'schedule.resume' };
    }
    if (matched.action === 'cancel-schedule') {
      const latest = this.scheduler.list({ limit: 1 })[0];
      if (!latest) return { reply: 'No schedule to cancel.', kind: 'schedule.cancel' };
      this.scheduler.cancel(latest.scheduleId);
      return { reply: `Cancelled schedule ${latest.scheduleId}.`, kind: 'schedule.cancel' };
    }
    const parsed = parseSchedule(text);
    if (!parsed) return null;
    if (parsed.blocked) {
      return { reply: parsed.reason, kind: 'schedule.blocked', parsed };
    }
    const created = this.scheduler.create({ ...parsed, owner: userId || 'telegram' });
    if (created.blocked) return { reply: created.reason, kind: 'schedule.blocked', parsed: created };
    return {
      reply: [
        `Schedule ${created.scheduleId} stored.`,
        `Recurrence: ${created.recurrence?.recurrence || created.recurrence?.kind}`,
        `Timezone: ${created.timezone}`,
        `Next run: ${created.nextRunAt}`,
        `Objective template: ${created.objectiveTemplate}`,
        `Overlap: ${created.overlapPolicy}. Missed: ${created.missedRunPolicy}.`,
        'This will create a normal MacGyver research objective. It will not contact anyone.'
      ].join('\n'),
      kind: 'schedule.created',
      schedule: created,
      parsed
    };
  }

  inspect(kind, query = '') {
    if (kind === 'queue' || /queued|queue|retry/i.test(query)) {
      return this.jobQueue
        ? this.jobQueue.getStats().then(async (stats) => {
          const jobs = await this.jobQueue.listJobs({ limit: 20 });
          return { report: formatQueueInspect(stats, jobs), stats, jobs };
        })
        : { report: 'Job queue not initialized.' };
    }
    if (kind === 'scheduled' || /schedule/i.test(query)) {
      const inspect = this.scheduler.inspect();
      return { report: formatScheduleInspect(inspect), ...inspect };
    }
    if (kind === 'memory') {
      const items = this.memory.list(10);
      return {
        report: items.length
          ? items.map((m) => `${m.memoryId} · ${m.type} · ${m.subject} · ${m.content}`).join('\n')
          : 'No operational memories.',
        memories: items
      };
    }
    if (kind === 'overnight') {
      const overnight = this.journal.overnight();
      const latest = this.engine?.latest?.();
      return {
        report: [
          `Overnight since ${overnight.since}`,
          `Events: ${overnight.events}`,
          `Completed: ${overnight.completed.length}`,
          `Failed: ${overnight.failed.length}`,
          latest ? formatMorningReport(latest) : 'No objective completed overnight.'
        ].join('\n'),
        overnight
      };
    }
    if (kind === 'approvals') {
      return { report: 'Ask “what is waiting for approval?” against the latest objective.' };
    }
    return null;
  }

  health() {
    const stats = this.jobQueue
      ? {
          durable: this.jobQueue.durable,
          backend: this.jobQueue.backend,
          queueLength: null
        }
      : { durable: false, backend: 'missing' };
    return {
      state: this.jobQueue?.durable ? 'HEALTHY' : 'DEGRADED',
      detail: `backend=${this.jobQueue?.backend || 'none'} recoveredJobs=${this.startupReport?.jobs ?? 0}`,
      startup: this.startupReport,
      stats
    };
  }

  snapshot() {
    return {
      startup: this.startupReport,
      queue: null,
      schedules: this.scheduler.inspect(),
      memories: this.memory.list(8),
      journalTail: this.journal.read({ limit: 12 }),
      mem0: 'not used — operational memory is file-backed with provenance; Mem0 remains optional later for semantic user memory only',
      redis: this.redis ? 'leases, queue coordination, scheduler leader lock' : 'absent — file store is authoritative',
      supabase: 'not required for Day-8 job/schedule/memory; existing client remains for users/projects',
      n8n: 'recorder / workflow provider, not the orchestration brain'
    };
  }

  async shutdown() {
    this.scheduler.stop();
    this.jobQueue?.stopClaiming();
    this.journal.append({ type: 'runtime.shutdown', actor: 'process' });
    if (this.jobQueue) await this.jobQueue.shutdown();
  }
}
