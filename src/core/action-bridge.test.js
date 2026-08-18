import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ActionBridge } from './action-bridge.js';
import { CapabilityRegistry } from './capability-registry.js';
import { registerPlatformCapabilities } from './platform-capabilities.js';

describe('ActionBridge', () => {
  test('uses conversational fallback when no capability is selected', async () => {
    const bridge = new ActionBridge({
      registry: { has: () => false, resolve: () => [], invoke: async () => ({}) }
    });
    const out = await bridge.execute({
      capabilityId: null,
      fallback_response: 'hello there',
      confidence: 0.9
    });
    assert.equal(out.success, true);
    assert.equal(out.source, 'conversational');
    assert.equal(out.conversationalResponse, 'hello there');
  });

  test('does not execute low-confidence capability matches', async () => {
    let invoked = false;
    const bridge = new ActionBridge({
      registry: {
        has: () => true,
        resolve: () => [{ inputs: { type: 'object', properties: {} } }],
        invoke: async () => {
          invoked = true;
          return { result: { ok: true } };
        }
      }
    });
    const out = await bridge.execute({
      capabilityId: 'workflow.execute',
      parameters: { alias: 'test' },
      confidence: 0.2,
      fallback_response: 'not sure'
    });
    assert.equal(out.source, 'conversational');
    assert.equal(invoked, false);
  });

  test('provider failure payloads stay failures', async () => {
    const registry = new CapabilityRegistry();
    registerPlatformCapabilities(registry, {
      n8nIntegration: {
        execute: async () => ({ status: 'failed', error: 'webhook down' }),
        isReady: () => true
      }
    });
    const bridge = new ActionBridge({ registry });
    const out = await bridge.execute({
      capabilityId: 'workflow.execute',
      parameters: { alias: 'test' },
      confidence: 0.9
    });
    assert.equal(out.success, false);
    assert.equal(out.error, 'PROVIDER_FAILED');
    assert.match(out.conversationalResponse, /webhook down/);
  });

  test('successful n8n execute surfaces execution id', async () => {
    const registry = new CapabilityRegistry();
    registerPlatformCapabilities(registry, {
      n8nIntegration: {
        execute: async (alias) => ({
          alias,
          status: 'executed',
          executionId: 'wf-real-1',
          providerExecutionId: '999'
        }),
        isReady: () => true
      }
    });
    const bridge = new ActionBridge({ registry });
    const out = await bridge.execute({
      capabilityId: 'workflow.execute',
      parameters: { workflow: 'test' },
      confidence: 0.95
    });
    assert.equal(out.success, true);
    assert.match(out.conversationalResponse, /wf-real-1|999|test/);
  });

  test('normalizes voice.call parameter aliases', async () => {
    const seen = [];
    const registry = {
      has: () => true,
      resolve: () => [{
        inputs: {
          type: 'object',
          properties: { phoneNumber: { type: 'string' }, script: { type: 'string' } },
          required: ['phoneNumber', 'script']
        }
      }],
      invoke: async (id, input) => {
        seen.push(input);
        return { result: { callId: 'abc', status: 'registered' } };
      }
    };
    const bridge = new ActionBridge({ registry });
    const out = await bridge.execute({
      capabilityId: 'voice.call',
      parameters: { phone: '+15551212', text: 'This is a test' },
      confidence: 0.9
    });
    assert.equal(out.success, true);
    assert.equal(seen[0].phoneNumber, '+15551212');
    assert.equal(seen[0].script, 'This is a test');
    assert.match(out.conversationalResponse, /abc/);
  });
});
