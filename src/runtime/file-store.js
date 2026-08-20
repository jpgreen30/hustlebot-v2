import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWrite } from './journal.js';

function emptyMeta() {
  return { pending: [], delayed: [], active: [], idempotency: {} };
}

export class FileJobStore {
  constructor(dir) {
    this.dir = dir;
    this.recordsDir = join(dir, 'records');
    this.metaPath = join(dir, 'meta.json');
    mkdirSync(this.recordsDir, { recursive: true });
    if (!existsSync(this.metaPath)) atomicWrite(this.metaPath, emptyMeta());
  }

  readMeta() {
    try {
      return { ...emptyMeta(), ...JSON.parse(readFileSync(this.metaPath, 'utf8')) };
    } catch {
      return emptyMeta();
    }
  }

  writeMeta(meta) {
    atomicWrite(this.metaPath, meta);
  }

  recordPath(id) {
    return join(this.recordsDir, `${id}.json`);
  }

  async save(job) {
    atomicWrite(this.recordPath(job.id), job);
  }

  async load(id) {
    const path = this.recordPath(id);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      return null;
    }
  }

  async pushPending(id) {
    const meta = this.readMeta();
    if (!meta.pending.includes(id)) meta.pending.push(id);
    meta.delayed = (meta.delayed || []).filter((row) => (row.id || row) !== id);
    this.writeMeta(meta);
  }

  async popPending() {
    const meta = this.readMeta();
    const id = meta.pending.shift() || null;
    this.writeMeta(meta);
    return id;
  }

  async removePending(id) {
    const meta = this.readMeta();
    const before = meta.pending.length;
    meta.pending = meta.pending.filter((x) => x !== id);
    this.writeMeta(meta);
    return before === meta.pending.length ? 0 : 1;
  }

  async pushDelayed(id, availableAt) {
    const meta = this.readMeta();
    meta.pending = meta.pending.filter((x) => x !== id);
    meta.delayed = (meta.delayed || []).filter((row) => (row.id || row) !== id);
    meta.delayed.push({ id, availableAt });
    this.writeMeta(meta);
  }

  async popDueDelayed(now) {
    const meta = this.readMeta();
    const due = [];
    const rest = [];
    for (const row of meta.delayed || []) {
      const id = row.id || row;
      const at = row.availableAt || 0;
      if (at <= now) due.push(id);
      else rest.push(row);
    }
    meta.delayed = rest;
    this.writeMeta(meta);
    return due;
  }

  async markActive(id) {
    const meta = this.readMeta();
    if (!meta.active.includes(id)) meta.active.push(id);
    this.writeMeta(meta);
  }

  async clearActive(id) {
    const meta = this.readMeta();
    meta.active = meta.active.filter((x) => x !== id);
    this.writeMeta(meta);
  }

  async listActive() {
    return this.readMeta().active || [];
  }

  async listIds() {
    return readdirSync(this.recordsDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''));
  }

  async remove(id) {
    const path = this.recordPath(id);
    if (existsSync(path)) unlinkSync(path);
    const meta = this.readMeta();
    meta.pending = meta.pending.filter((x) => x !== id);
    meta.active = meta.active.filter((x) => x !== id);
    meta.delayed = (meta.delayed || []).filter((row) => (row.id || row) !== id);
    for (const [key, value] of Object.entries(meta.idempotency || {})) {
      if (value === id) delete meta.idempotency[key];
    }
    this.writeMeta(meta);
  }

  async idsOlderThan(cutoff) {
    const ids = [];
    for (const id of await this.listIds()) {
      const job = await this.load(id);
      if (job && job.createdAt <= cutoff) ids.push(id);
    }
    return ids;
  }

  async counts() {
    const meta = this.readMeta();
    const ids = await this.listIds();
    return {
      pending: meta.pending.length,
      active: meta.active.length,
      total: ids.length
    };
  }

  async putIdempotency(key, id) {
    const meta = this.readMeta();
    meta.idempotency = meta.idempotency || {};
    meta.idempotency[key] = id;
    this.writeMeta(meta);
  }

  async getIdempotency(key) {
    return this.readMeta().idempotency?.[key] || null;
  }
}
