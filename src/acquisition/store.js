/**
 * Persist acquisition runs and prospects using local JSON files.
 * Compatible with the existing HybridStorage local fallback.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { compactProspect } from './schema.js';

const DEFAULT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../.data/acquisition');

export class AcquisitionStore {
  constructor(config = {}) {
    this.dir = config.dir || process.env.ACQUISITION_DATA_DIR || DEFAULT_DIR;
    this.runsDir = join(this.dir, 'runs');
    this.prospectsDir = join(this.dir, 'prospects');
    this.ensure();
  }

  ensure() {
    for (const dir of [this.dir, this.runsDir, this.prospectsDir]) {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    }
  }

  writeJson(path, data) {
    writeFileSync(path, JSON.stringify(data, null, 2));
  }

  readJson(path) {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  }

  saveRun(run) {
    this.ensure();
    const path = join(this.runsDir, `${run.runId}.json`);
    this.writeJson(path, run);
    return run;
  }

  getRun(runId) {
    return this.readJson(join(this.runsDir, `${runId}.json`));
  }

  listRuns(limit = 20) {
    this.ensure();
    const files = readdirSync(this.runsDir).filter((f) => f.endsWith('.json'));
    const runs = files
      .map((file) => this.readJson(join(this.runsDir, file)))
      .filter(Boolean)
      .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
    return runs.slice(0, limit);
  }

  saveProspects(runId, prospects) {
    this.ensure();
    const records = prospects.map((p) => {
      const compact = compactProspect(p);
      compact.runId = runId;
      const path = join(this.prospectsDir, `${compact.prospectId}.json`);
      const existing = this.readJson(path);
      const next = existing
        ? { ...existing, ...compact, runIds: [...new Set([...(existing.runIds || []), runId])] }
        : { ...compact, runIds: [runId] };
      this.writeJson(path, next);
      return next;
    });
    this.writeJson(join(this.dir, `run-${runId}-prospects.json`), records);
    return records;
  }

  getProspect(prospectId) {
    return this.readJson(join(this.prospectsDir, `${prospectId}.json`));
  }

  listProspects({ runId, limit = 100 } = {}) {
    this.ensure();
    if (runId) {
      return this.readJson(join(this.dir, `run-${runId}-prospects.json`)) || [];
    }
    const files = readdirSync(this.prospectsDir).filter((f) => f.endsWith('.json'));
    return files
      .map((file) => this.readJson(join(this.prospectsDir, file)))
      .filter(Boolean)
      .slice(0, limit);
  }
}
