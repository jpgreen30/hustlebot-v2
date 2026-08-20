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
  constructor({ dir, retentionMs } = {}) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
    this.retentionMs = retentionMs ?? 90 * 24 * 3600 * 1000;
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
    return rec;
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
