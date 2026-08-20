import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../.data/objectives');

export class ObjectiveMemory {
  constructor(config = {}) {
    this.dir = config.dir || process.env.OBJECTIVE_DATA_DIR || DEFAULT_DIR;
    this.ensure();
  }

  ensure() {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }

  pathFor(id) {
    return join(this.dir, `${id}.json`);
  }

  save(record) {
    this.ensure();
    writeFileSync(this.pathFor(record.objectiveId), JSON.stringify(record, null, 2));
    return record;
  }

  get(id) {
    const path = this.pathFor(id);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  }

  list(limit = 20) {
    this.ensure();
    return readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try { return JSON.parse(readFileSync(join(this.dir, f), 'utf8')); } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
      .slice(0, limit);
  }
}
