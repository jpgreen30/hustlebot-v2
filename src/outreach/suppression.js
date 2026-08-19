/**
 * Suppression, duplicate-action protection, and global/campaign pause.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeEmail, normalizePhone } from '../acquisition/normalize.js';

const DEFAULT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../.data/outreach');

function actionKey({ campaignId, contactId, channel, destination }) {
  return [campaignId || 'none', contactId || 'none', channel || 'none', destination || 'none'].join('|');
}

export class SuppressionStore {
  constructor(config = {}) {
    this.dir = config.dir || process.env.OUTREACH_DATA_DIR || DEFAULT_DIR;
    this.file = join(this.dir, 'suppression.json');
    this.globalPaused = false;
    this.pausedCampaigns = new Set();
    this.suppressed = new Set();
    this.sends = new Map();
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    this.load();
  }

  load() {
    if (!existsSync(this.file)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
      this.globalPaused = Boolean(parsed.globalPaused);
      this.pausedCampaigns = new Set(parsed.pausedCampaigns || []);
      this.suppressed = new Set(parsed.suppressed || []);
      this.sends = new Map(Object.entries(parsed.sends || {}));
    } catch {
      // keep empty
    }
  }

  persist() {
    writeFileSync(this.file, JSON.stringify({
      globalPaused: this.globalPaused,
      pausedCampaigns: [...this.pausedCampaigns],
      suppressed: [...this.suppressed],
      sends: Object.fromEntries(this.sends)
    }, null, 2));
  }

  suppress(destination, reason = 'manual') {
    const key = this.normalizeDestination(destination);
    if (key) this.suppressed.add(key);
    this.persist();
    return { suppressed: key, reason };
  }

  normalizeDestination(value) {
    return normalizeEmail(value) || normalizePhone(value) || (value ? String(value).toLowerCase() : null);
  }

  isSuppressed(destination) {
    const key = this.normalizeDestination(destination);
    return Boolean(key && this.suppressed.has(key));
  }

  pauseAll() {
    this.globalPaused = true;
    this.persist();
  }

  resumeAll() {
    this.globalPaused = false;
    this.persist();
  }

  pauseCampaign(campaignId) {
    if (campaignId) this.pausedCampaigns.add(campaignId);
    this.persist();
  }

  resumeCampaign(campaignId) {
    this.pausedCampaigns.delete(campaignId);
    this.persist();
  }

  alreadySent(input) {
    return this.sends.has(actionKey(input));
  }

  recordSend(input, result = {}) {
    const key = actionKey(input);
    this.sends.set(key, {
      ...input,
      providerMessageId: result.providerMessageId || result.callId || null,
      status: result.status || 'recorded',
      at: new Date().toISOString()
    });
    this.persist();
    return key;
  }

  check(input = {}) {
    const destination = input.destination || input.to || input.phoneNumber || input.email;
    if (this.globalPaused) {
      return { allowed: false, reason: 'global pause is on', code: 'GLOBAL_PAUSE' };
    }
    if (input.campaignId && this.pausedCampaigns.has(input.campaignId)) {
      return { allowed: false, reason: `campaign ${input.campaignId} is paused`, code: 'CAMPAIGN_PAUSE' };
    }
    if (this.isSuppressed(destination)) {
      return { allowed: false, reason: `${destination} is suppressed`, code: 'SUPPRESSED' };
    }
    if (this.alreadySent({ ...input, destination })) {
      return { allowed: false, reason: 'duplicate send/action blocked', code: 'DUPLICATE' };
    }
    return { allowed: true, destination };
  }
}
