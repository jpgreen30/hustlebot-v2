import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { collectDay1Health, formatDay1StatusText, isStatusRequest } from './health-status.js';

describe('Day-1 health', () => {
  test('recognizes status utterances', () => {
    assert.equal(isStatusRequest('status'), true);
    assert.equal(isStatusRequest('/status'), true);
    assert.equal(isStatusRequest('Status'), true);
    assert.equal(isStatusRequest('run the test workflow'), false);
  });

  test('reports MISCONFIGURED rather than HEALTHY when only env-less services exist', async () => {
    const snapshot = await collectDay1Health({});
    for (const check of Object.values(snapshot.services)) {
      assert.notEqual(check.state, 'HEALTHY');
    }
    const text = formatDay1StatusText(snapshot);
    assert.match(text, /Telegram/i);
    assert.match(text, /MISCONFIGURED|UNAVAILABLE/);
  });
});
