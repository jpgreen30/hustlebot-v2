/**
 * Structured outreach events. No ML — just durable facts.
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../.data/outreach');

export const EVENT_TYPES = [
  'outreach.prepared',
  'outreach.approved',
  'outreach.started',
  'outreach.paused',
  'outreach.resumed',
  'outreach.blocked',
  'call.started',
  'call.completed',
  'call.outcome',
  'email.queued',
  'email.sent',
  'email.delivered',
  'email.bounced',
  'email.replied',
  'email.failed',
  'prospect.state',
  'prospect.converted',
  'prospect.rejected'
];

export class OutreachEventLog {
  constructor(config = {}) {
    this.dir = config.dir || process.env.OUTREACH_DATA_DIR || DEFAULT_DIR;
    this.file = join(this.dir, 'events.jsonl');
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }

  record(type, payload = {}) {
    if (!EVENT_TYPES.includes(type)) {
      throw new Error(`Unknown outreach event type: ${type}`);
    }
    const event = {
      eventId: `evt_${randomUUID().slice(0, 10)}`,
      type,
      at: new Date().toISOString(),
      ...payload
    };
    appendFileSync(this.file, `${JSON.stringify(event)}\n`);
    return event;
  }

  list({ campaignId, limit = 100 } = {}) {
    if (!existsSync(this.file)) return [];
    const lines = readFileSync(this.file, 'utf8').split('\n').filter(Boolean);
    const events = lines.map((line) => JSON.parse(line));
    const filtered = campaignId ? events.filter((e) => e.campaignId === campaignId) : events;
    return filtered.slice(-limit);
  }
}

export function saveJson(dir, name, data) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(data, null, 2));
  return path;
}
