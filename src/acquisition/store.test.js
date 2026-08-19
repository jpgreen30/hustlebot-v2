import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AcquisitionStore } from './store.js';
import { createProspect } from './schema.js';

describe('acquisition store', () => {
  test('persists a run and its prospects and can retrieve them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'acq-store-'));
    try {
      const store = new AcquisitionStore({ dir });
      const run = store.saveRun({
        runId: 'acq_test1',
        objective: 'test',
        startedAt: '2026-08-19T00:00:00.000Z',
        stats: { uniqueOrganizations: 1 }
      });
      const prospects = store.saveProspects('acq_test1', [
        createProspect({ organizationName: 'Acme', domain: 'acme.com', sourceUrl: 'https://show.test/a' })
      ]);
      assert.equal(store.getRun('acq_test1').runId, run.runId);
      assert.equal(store.listProspects({ runId: 'acq_test1' }).length, 1);
      assert.equal(store.getProspect(prospects[0].prospectId).organizationName, 'Acme');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
