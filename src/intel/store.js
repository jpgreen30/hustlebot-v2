/**
 * Durable intelligence store.
 * File = local tests. Redis = hot cache + Render-durable replica.
 * Supabase = preferred durable SoT for evidence/entities/memory.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWrite } from '../runtime/journal.js';

const TABLES = {
  memories: 'operational_memories',
  entities: 'intelligence_entities',
  aliases: 'intelligence_aliases',
  sources: 'intelligence_sources',
  claims: 'intelligence_claims',
  evidence: 'intelligence_evidence',
  relations: 'intelligence_relations'
};

function rowId(rec, kind) {
  if (kind === 'entities') return rec.entityId || rec.id;
  if (kind === 'aliases') return rec.aliasId || rec.id;
  if (kind === 'sources') return rec.sourceId || rec.id;
  if (kind === 'claims') return rec.claimId || rec.id;
  if (kind === 'evidence') return rec.evidenceId || rec.id;
  if (kind === 'relations') return rec.relationId || rec.id;
  if (kind === 'memories') return rec.memoryId || rec.id;
  if (kind === 'requests') return rec.intelligenceRequestId || rec.id;
  return rec.id || rec.entityId || rec.aliasId || rec.sourceId || rec.claimId || rec.evidenceId || rec.relationId || rec.memoryId;
}

export class IntelStore {
  constructor({ dir, redis, supabase, namespace = 'hustlebot:intel' } = {}) {
    this.dir = dir || null;
    if (this.dir) mkdirSync(this.dir, { recursive: true });
    this.redis = redis || null;
    this.supabase = supabase || null;
    this.namespace = namespace;
    this.collections = {
      entities: new Map(),
      aliases: new Map(),
      sources: new Map(),
      claims: new Map(),
      evidence: new Map(),
      relations: new Map(),
      memories: new Map(),
      requests: new Map()
    };
    this.stats = {
      entitiesStored: 0,
      claimsStored: 0,
      evidenceRecords: 0,
      sourcesUsed: 0,
      sourceFailures: 0,
      conflictsDetected: 0,
      staleClaims: 0,
      researchCacheHits: 0,
      entityMerges: 0,
      entityMergeRefusals: 0
    };
    if (this.dir) this.loadDir();
  }

  loadDir() {
    for (const kind of Object.keys(this.collections)) {
      const folder = join(this.dir, kind);
      if (!existsSync(folder)) continue;
      for (const file of readdirSync(folder).filter((f) => f.endsWith('.json'))) {
        try {
          const rec = JSON.parse(readFileSync(join(folder, file), 'utf8'));
          const id = rowId(rec, kind);
          if (id) this.collections[kind].set(id, rec);
        } catch { /* skip */ }
      }
    }
  }

  pathFor(kind, id) {
    const folder = join(this.dir, kind);
    mkdirSync(folder, { recursive: true });
    return join(folder, `${id}.json`);
  }

  async put(kind, rec) {
    const id = rowId(rec, kind);
    if (!id) return rec;
    if (!this.collections[kind]) this.collections[kind] = new Map();
    rec.updatedAt = new Date().toISOString();
    this.collections[kind].set(id, rec);
    if (this.dir) atomicWrite(this.pathFor(kind, id), rec);
    if (this.redis?.set) {
      try {
        await this.redis.set(`${this.namespace}:${kind}:${id}`, JSON.stringify(rec), 'EX', 30 * 24 * 3600);
        await this.redis.sadd(`${this.namespace}:${kind}`, id);
      } catch { /* optional */ }
    }
    const table = TABLES[kind];
    if (this.supabase?.from && table) {
      try {
        const { error } = await this.supabase.from(table).upsert({
          id,
          payload: rec,
          updated_at: rec.updatedAt
        });
        if (error && !/does not exist|42P01|schema cache/i.test(error.message || '')) {
          /* keep going; redis/file remain */
        }
      } catch { /* optional */ }
    }
    return rec;
  }

  get(kind, id) {
    return this.collections[kind]?.get(id) || null;
  }

  list(kind, limit = 200) {
    return [...(this.collections[kind]?.values() || [])].slice(-limit);
  }

  async hydrate() {
    let n = 0;
    if (this.supabase?.from) {
      for (const [kind, table] of Object.entries(TABLES)) {
        try {
          const { data, error } = await this.supabase.from(table).select('id,payload').limit(500);
          if (error || !data) continue;
          for (const row of data) {
            const rec = row.payload || row;
            const id = row.id || rowId(rec, kind);
            if (!id) continue;
            this.collections[kind].set(id, rec);
            n++;
          }
        } catch { /* table may not exist yet */ }
      }
    }
    if (this.redis?.smembers) {
      for (const kind of Object.keys(this.collections)) {
        try {
          const ids = await this.redis.smembers(`${this.namespace}:${kind}`);
          for (const id of ids || []) {
            if (this.collections[kind].has(id)) {
              this.stats.researchCacheHits += 1;
              continue;
            }
            const raw = await this.redis.get(`${this.namespace}:${kind}:${id}`);
            if (!raw) continue;
            this.collections[kind].set(id, JSON.parse(raw));
            n++;
          }
        } catch { /* optional */ }
      }
    }
    this.refreshStats();
    return n;
  }

  refreshStats() {
    this.stats.entitiesStored = this.collections.entities.size;
    this.stats.claimsStored = this.collections.claims.size;
    this.stats.evidenceRecords = this.collections.evidence.size;
    this.stats.conflictsDetected = this.list('claims').filter((c) => c.status === 'CONFLICTED').length;
    this.stats.staleClaims = this.list('claims').filter((c) => c.status === 'STALE').length;
    return this.stats;
  }

  snapshot() {
    return this.refreshStats();
  }

  putEntity(rec) { return this.put('entities', rec); }
  putAlias(rec) { return this.put('aliases', rec); }
  putSource(rec) { return this.put('sources', rec); }
  putClaim(rec) { return this.put('claims', rec); }
  putEvidence(rec) { return this.put('evidence', rec); }
  putRelation(rec) { return this.put('relations', rec); }
  putMemory(rec) { return this.put('memories', rec); }

  deleteFile(kind, id) {
    if (!this.dir) return;
    const path = this.pathFor(kind, id);
    if (existsSync(path)) unlinkSync(path);
  }
}
