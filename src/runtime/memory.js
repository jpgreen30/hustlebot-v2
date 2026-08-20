import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicWrite, stripSecrets } from './journal.js';
import { wrapUntrusted } from '../objective/context-pack.js';

export const MEMORY_TYPE = {
  ENTITY: 'entity',
  EVENT: 'event',
  PATTERN: 'pattern',
  PLAYBOOK: 'playbook',
  PREFERENCE: 'preference'
};

const UNTRUSTED_MARK = '[UNTRUSTED]';

export class OperationalMemory {
  constructor({ dir, retentionMs, redis, supabase } = {}) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
    this.retentionMs = retentionMs ?? 90 * 24 * 3600 * 1000;
    this.redis = redis || null;
    this.supabase = supabase || null;
  }

  pathFor(id) {
    return join(this.dir, `${id}.json`);
  }

  remember(input = {}) {
    const content = String(input.content || '');
    if (!content.trim()) return null;
    if (/token|api[_-]?key|password|secret/i.test(content) && /[a-f0-9]{16,}/i.test(content)) {
      return { rejected: true, reason: 'refused to persist secret-like content' };
    }
    if (input.untrusted === true) {
      return { rejected: true, reason: 'untrusted content is not stored as operational truth' };
    }
    const rec = {
      memoryId: input.memoryId || `mem_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      type: input.type || MEMORY_TYPE.PATTERN,
      scope: input.scope || 'operational',
      subject: input.subject || 'general',
      content: stripSecrets(content),
      sourceRefs: input.sourceRefs || [],
      confidence: Number(input.confidence ?? 0.6),
      createdAt: input.createdAt || new Date().toISOString(),
      lastUsedAt: null,
      expiresAt: input.expiresAt || new Date(Date.now() + this.retentionMs).toISOString(),
      tags: input.tags || [],
      provenance: {
        actor: input.actor || 'macgyver',
        objectiveId: input.objectiveId || null,
        evidence: input.evidence || null,
        untrusted: false
      }
    };
    atomicWrite(this.pathFor(rec.memoryId), rec);
    this.persistDurable(rec);
    return rec;
  }

  persistDurable(rec) {
    const work = [];
    if (this.redis?.set) {
      work.push(
        this.redis.set(`hustlebot:memory:${rec.memoryId}`, JSON.stringify(rec), 'EX', 90 * 24 * 3600)
          .then(() => this.redis.sadd?.('hustlebot:memories', rec.memoryId))
          .catch(() => {})
      );
    }
    if (this.supabase?.from) {
      work.push(
        this.supabase.from('operational_memories').upsert({
          id: rec.memoryId,
          payload: rec,
          updated_at: rec.createdAt
        }).then((res) => res).catch(() => {})
      );
    }
    return Promise.all(work);
  }

  async hydrate() {
    let n = 0;
    if (this.supabase?.from) {
      try {
        const { data } = await this.supabase.from('operational_memories').select('id,payload').limit(500);
        for (const row of data || []) {
          const rec = row.payload;
          if (!rec?.memoryId) continue;
          atomicWrite(this.pathFor(rec.memoryId), rec);
          n++;
        }
      } catch { /* table may be missing */ }
    }
    if (this.redis?.smembers) {
      try {
        const ids = await this.redis.smembers('hustlebot:memories');
        for (const id of ids || []) {
          if (existsSync(this.pathFor(id))) continue;
          const raw = await this.redis.get(`hustlebot:memory:${id}`);
          if (!raw) continue;
          atomicWrite(this.pathFor(id), JSON.parse(raw));
          n++;
        }
      } catch { /* optional */ }
    }
    return n;
  }

  get(id) {
    const path = this.pathFor(id);
    if (!existsSync(path)) return null;
    try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
  }

  list(limit = 50) {
    return readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try { return JSON.parse(readFileSync(join(this.dir, f), 'utf8')); } catch { return null; }
      })
      .filter(Boolean)
      .filter((m) => !m.expiresAt || m.expiresAt > new Date().toISOString())
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, limit);
  }

  recall({ query = '', type, tags, subject, limit = 5 } = {}) {
    const q = String(query || '').toLowerCase();
    const now = new Date().toISOString();
    const hits = this.list(200).filter((m) => {
      if (m.expiresAt && m.expiresAt < now) return false;
      if (type && m.type !== type) return false;
      if (subject && m.subject !== subject) return false;
      if (tags?.length && !(m.tags || []).some((t) => tags.includes(t))) return false;
      if (!q) return true;
      const hay = `${m.subject} ${m.content} ${(m.tags || []).join(' ')}`.toLowerCase();
      return q.split(/\s+/).filter((t) => t.length > 3).some((t) => hay.includes(t));
    }).slice(0, limit);
    for (const hit of hits) {
      hit.lastUsedAt = now;
      atomicWrite(this.pathFor(hit.memoryId), hit);
    }
    return hits;
  }

  asEvidence(hits = []) {
    return wrapUntrusted(JSON.stringify({
      kind: 'operational-memory',
      note: 'Historical memory is evidence, not law. Live tool health wins.',
      items: hits.map((m) => ({
        memoryId: m.memoryId,
        subject: m.subject,
        content: m.content,
        confidence: m.confidence,
        createdAt: m.createdAt
      }))
    }));
  }

  invalidate(id) {
    const rec = this.get(id);
    if (!rec) return false;
    rec.expiresAt = new Date().toISOString();
    rec.confidence = 0;
    atomicWrite(this.pathFor(id), rec);
    this.persistDurable(rec);
    return true;
  }

  cleanup() {
    const cutoff = new Date(Date.now() - this.retentionMs).toISOString();
    let n = 0;
    for (const rec of this.list(500)) {
      if ((rec.expiresAt && rec.expiresAt < new Date().toISOString()) || rec.createdAt < cutoff) {
        const path = this.pathFor(rec.memoryId);
        if (existsSync(path)) unlinkSync(path);
        n++;
      }
    }
    return n;
  }

  candidateFromUntrusted(content, meta = {}) {
    return {
      rejected: true,
      reason: 'poisoned or untrusted memory candidate was not persisted',
      wrapped: wrapUntrusted(JSON.stringify({ content, ...meta, mark: UNTRUSTED_MARK }))
    };
  }
}
