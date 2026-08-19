import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { RetellIntegration, normalizeE164, DEFAULT_TEST_NUMBER } from './retell-integration.js';

describe('Retell contract', () => {
  const originalFetch = global.fetch;
  let calls;

  function mockRetell({ create } = {}) {
    global.fetch = async (url, options) => {
      calls.push({ url: String(url), options });
      const href = String(url);
      if (href.includes('/list-phone-numbers')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                phone_number: '+14155550100',
                outbound_agents: [{ agent_id: 'agent_test' }]
              }
            ]
          })
        };
      }
      if (href.includes('/get-call/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ call_id: 'Jabr9TXYYJHfvl6Syypi88rdAHYHmcq6', call_status: 'registered' })
        };
      }
      if (create) return create(href, options);
      return {
        ok: true,
        status: 201,
        json: async () => ({ call_id: 'Jabr9TXYYJHfvl6Syypi88rdAHYHmcq6', call_status: 'registered' })
      };
    };
  }

  beforeEach(() => {
    calls = [];
    process.env.RETELL_API_KEY = 'test-key';
    process.env.RETELL_FROM_NUMBER = '+14155550100';
    process.env.RETELL_AGENT_ID = 'agent_test';
    process.env.RETELL_TEST_NUMBER = '+12135550123';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.RETELL_API_KEY;
    delete process.env.RETELL_FROM_NUMBER;
    delete process.env.RETELL_AGENT_ID;
    delete process.env.RETELL_TEST_NUMBER;
    delete process.env.RETELL_ALLOWED_NUMBERS;
  });

  test('normalizes US numbers to E.164', () => {
    assert.equal(normalizeE164('(213) 555-0123'), '+12135550123');
    assert.equal(normalizeE164('+44 20 7946 0958'), '+442079460958');
  });

  test('create-phone-call uses official fields and refuses to invent call ids', async () => {
    mockRetell();

    const retell = new RetellIntegration();
    retell.initialized = true;
    const result = await retell.makeOutboundCall({
      phoneNumber: '2135550123',
      script: 'This is a HustleBot production test.'
    });

    assert.equal(result.callId, 'Jabr9TXYYJHfvl6Syypi88rdAHYHmcq6');
    assert.equal(result.status, 'registered');
    const create = calls.find((c) => c.url.endsWith('/create-phone-call'));
    assert.ok(create);
    const body = JSON.parse(create.options.body);
    assert.equal(body.from_number, '+14155550100');
    assert.equal(body.to_number, '+12135550123');
    assert.equal(body.override_agent_id, 'agent_test');
    assert.equal(body.retell_llm_dynamic_variables.script, 'This is a HustleBot production test.');
    assert.equal(create.options.headers.Authorization, 'Bearer test-key');
  });

  test('uses a Retell-owned number when env from_number is not on the account', async () => {
    process.env.RETELL_FROM_NUMBER = '+10991112222';
    mockRetell();
    const retell = new RetellIntegration();
    retell.initialized = true;
    const result = await retell.makeOutboundCall({
      phoneNumber: '+12135550123',
      script: 'This is a HustleBot production test.'
    });
    assert.equal(result.callId, 'Jabr9TXYYJHfvl6Syypi88rdAHYHmcq6');
    const create = calls.find((c) => c.url.endsWith('/create-phone-call'));
    const body = JSON.parse(create.options.body);
    assert.equal(body.from_number, '+14155550100');
  });

  test('missing call_id is a protocol violation, not a fake success', async () => {
    mockRetell({
      create: async (href) => {
        if (href.includes('/create-phone-call')) {
          return { ok: true, status: 200, json: async () => ({ status: 'ok' }) };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      }
    });
    const retell = new RetellIntegration();
    retell.initialized = true;
    const result = await retell.makeOutboundCall({
      phoneNumber: '+12135550123',
      script: 'hi'
    });
    assert.equal(result.status, 'failed');
    assert.match(result.error, /missing call_id/);
  });

  test('blocks numbers outside the authorized allowlist', async () => {
    global.fetch = async () => {
      throw new Error('should not call provider');
    };
    const retell = new RetellIntegration();
    retell.initialized = true;
    const result = await retell.makeOutboundCall({
      phoneNumber: '+15559990000',
      script: 'hi'
    });
    assert.equal(result.status, 'failed');
    assert.match(result.error, /allowlist/);
  });

  test('defaults the Day-1 test number onto the allowlist', () => {
    delete process.env.RETELL_TEST_NUMBER;
    assert.equal(DEFAULT_TEST_NUMBER, '+18184381415');
  });
});
