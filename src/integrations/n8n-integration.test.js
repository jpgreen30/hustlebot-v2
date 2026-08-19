import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  N8NIntegration,
  DEFAULT_N8N_TEST_WEBHOOK,
  extractProviderExecutionId
} from './n8n-integration.js';

describe('n8n executor', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.N8N_WEBHOOK_URL = 'https://n8n.example/webhook/prod';
    process.env.N8N_TEST_WEBHOOK_URL = 'https://n8n.example/webhook/test';
    delete process.env.N8N_WORKFLOWS;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.N8N_WEBHOOK_URL;
    delete process.env.N8N_TEST_WEBHOOK_URL;
    delete process.env.N8N_WORKFLOWS;
  });

  test('registers the test alias and returns provider execution id', async () => {
    global.fetch = async (url, options) => {
      assert.equal(String(url), 'https://n8n.example/webhook/test');
      assert.equal(options.method, 'POST');
      return {
        ok: true,
        status: 200,
        json: async () => ({ executionId: 'n8n-exec-77' })
      };
    };
    const n8n = new N8NIntegration();
    const result = await n8n.execute('test', { ping: true });
    assert.equal(result.status, 'executed');
    assert.equal(result.providerExecutionId, 'n8n-exec-77');
    assert.equal(result.executionId, 'n8n-exec-77');
  });

  test('reads n8nExecutionId from the live array webhook response', async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ([
        {
          ok: true,
          executionId: null,
          n8nExecutionId: '40',
          message: 'HustleBot test workflow executed successfully in n8n.'
        }
      ])
    });
    const n8n = new N8NIntegration();
    const result = await n8n.execute('test', { ping: true });
    assert.equal(result.status, 'executed');
    assert.equal(result.providerExecutionId, '40');
    assert.equal(result.executionId, '40');
    assert.match(result.message, /executed successfully/);
  });

  test('fails closed for an unknown alias without calling fetch', async () => {
    global.fetch = async () => {
      throw new Error('should not fetch');
    };
    const n8n = new N8NIntegration();
    const result = await n8n.execute('missing');
    assert.equal(result.status, 'failed');
    assert.match(result.error, /not registered/);
  });

  test('does not crash on invalid N8N_WORKFLOWS JSON', () => {
    process.env.N8N_WORKFLOWS = '{not-json';
    const n8n = new N8NIntegration();
    assert.ok(n8n.workflows.has('test'));
  });

  test('defaults to the live hustlebot-test webhook when env is unset', () => {
    delete process.env.N8N_WEBHOOK_URL;
    delete process.env.N8N_TEST_WEBHOOK_URL;
    const n8n = new N8NIntegration();
    assert.equal(n8n.workflows.get('test').url, DEFAULT_N8N_TEST_WEBHOOK);
    assert.equal(n8n.isReady(), true);
  });

  test('registers campaign-prepare as an alias of the live test webhook', () => {
    const n8n = new N8NIntegration();
    assert.ok(n8n.workflows.has('campaign-prepare'));
    assert.equal(n8n.workflows.get('campaign-prepare').url, 'https://n8n.example/webhook/test');
    assert.ok(n8n.workflows.has('campaign-orchestrate'));
  });

  test('extractProviderExecutionId prefers n8nExecutionId over null executionId', () => {
    assert.equal(
      extractProviderExecutionId([{ executionId: null, n8nExecutionId: '39' }]),
      '39'
    );
    assert.equal(extractProviderExecutionId({ id: 'x' }), 'x');
    assert.equal(extractProviderExecutionId(null), null);
  });
});
