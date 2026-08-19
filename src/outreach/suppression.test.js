import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SuppressionStore } from './suppression.js';

describe('suppression + duplicate protection', () => {
  test('blocks suppressed destinations, duplicates, and paused campaigns', () => {
    const dir = mkdtempSync(join(tmpdir(), 'supp-'));
    const store = new SuppressionStore({ dir });
    try {
      store.suppress('ada@brand.test', 'opt-out');
      assert.equal(store.check({ destination: 'ada@brand.test' }).allowed, false);
      const ok = store.check({
        campaignId: 'cmp_1',
        contactId: 'per_1',
        channel: 'email',
        destination: 'ok@brand.test'
      });
      assert.equal(ok.allowed, true);
      store.recordSend({
        campaignId: 'cmp_1',
        contactId: 'per_1',
        channel: 'email',
        destination: 'ok@brand.test'
      }, { providerMessageId: 'msg_1', status: 'sent' });
      assert.equal(store.check({
        campaignId: 'cmp_1',
        contactId: 'per_1',
        channel: 'email',
        destination: 'ok@brand.test'
      }).code, 'DUPLICATE');
      store.pauseCampaign('cmp_1');
      assert.equal(store.check({ campaignId: 'cmp_1', destination: 'other@brand.test' }).code, 'CAMPAIGN_PAUSE');
      store.pauseAll();
      assert.equal(store.check({ destination: 'other@brand.test' }).code, 'GLOBAL_PAUSE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
