import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const SECRET_KEY = /token|secret|password|passwd|api[_-]?key|authorization|cookie|credential/i;

export function stripSecrets(value, depth = 0) {
  if (depth > 6 || value == null) return value;
  if (typeof value === 'string') {
    if (value.length > 4000) return `${value.slice(0, 4000)}…`;
    return value;
  }
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => stripSecrets(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = SECRET_KEY.test(key) ? '[redacted]' : stripSecrets(item, depth + 1);
    }
    return out;
  }
  return value;
}

export function atomicWrite(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  const body = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  writeFileSync(tmp, body);
  renameSync(tmp, path);
}

export class EventJournal {
  constructor({ dir, retentionMs } = {}) {
    this.dir = dir;
    this.retentionMs = retentionMs ?? 14 * 24 * 3600 * 1000;
    this.path = join(dir, 'events.jsonl');
    mkdirSync(dir, { recursive: true });
  }

  append(event = {}) {
    const rec = {
      eventId: event.eventId || `evt_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      timestamp: event.timestamp || new Date().toISOString(),
      type: event.type || 'unknown',
      objectiveId: event.objectiveId || null,
      executionId: event.executionId || null,
      parentExecutionId: event.parentExecutionId || null,
      jobId: event.jobId || null,
      scheduleId: event.scheduleId || null,
      actor: event.actor || 'system',
      metadata: stripSecrets(event.metadata || {})
    };
    appendFileSync(this.path, `${JSON.stringify(rec)}\n`);
    return rec;
  }

  read({ objectiveId, type, limit = 100, since } = {}) {
    if (!existsSync(this.path)) return [];
    const lines = readFileSync(this.path, 'utf8').split('\n').filter(Boolean);
    const out = [];
    for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
      try {
        const rec = JSON.parse(lines[i]);
        if (objectiveId && rec.objectiveId !== objectiveId) continue;
        if (type && rec.type !== type) continue;
        if (since && rec.timestamp < since) continue;
        out.push(rec);
      } catch {
        continue;
      }
    }
    return out.reverse();
  }

  overnight({ sinceHours = 12 } = {}) {
    const since = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();
    const events = this.read({ limit: 500, since });
    return {
      since,
      events: events.length,
      failed: events.filter((e) => /failed|dead_letter|error/i.test(e.type)),
      completed: events.filter((e) => /completed/i.test(e.type)),
      paused: events.filter((e) => /paused/i.test(e.type))
    };
  }

  cleanup() {
    if (!existsSync(this.path)) return 0;
    const cutoff = new Date(Date.now() - this.retentionMs).toISOString();
    const kept = [];
    for (const line of readFileSync(this.path, 'utf8').split('\n')) {
      if (!line) continue;
      try {
        const rec = JSON.parse(line);
        if (rec.timestamp >= cutoff) kept.push(line);
      } catch {
        kept.push(line);
      }
    }
    writeFileSync(this.path, kept.length ? `${kept.join('\n')}\n` : '');
    return kept.length;
  }
}
