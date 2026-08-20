import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { LlmRouter, TASK_CLASS } from './router.js';
import { modelsForTask, loadModelRegistry } from './registry.js';

function fakeClient({ fail = [], invalidJson = [] } = {}) {
  const calls = [];
  return {
    calls,
    async complete(prompt, options) {
      calls.push({ prompt, model: options.model, taskType: options.taskType });
      if (fail.includes(options.model)) throw new Error(`${options.model} unavailable`);
      if (invalidJson.includes(options.model)) {
        return { content: 'not-json', model: options.model, cost: 0 };
      }
      return {
        content: JSON.stringify({ ok: true, model: options.model, task: options.taskType }),
        model: options.model,
        cost: 0.001,
        tokens: { input: 10, output: 8 }
      };
    }
  };
}

describe('Day-6 LLM router', () => {
  test('routes classification, extraction, and planning to different policies', () => {
    const router = new LlmRouter({ client: fakeClient() });
    const classification = router.select({ taskClass: TASK_CLASS.CLASSIFICATION });
    const extraction = router.select({ taskClass: TASK_CLASS.EXTRACTION });
    const planning = router.select({ taskClass: TASK_CLASS.PLANNING });
    assert.equal(classification.preferredModel, 'deepseek/deepseek-chat');
    assert.equal(extraction.preferredModel, 'deepseek/deepseek-chat');
    assert.equal(planning.preferredModel, 'anthropic/claude-sonnet-4.5');
    assert.notEqual(planning.preferredModel, classification.preferredModel);
  });

  test('falls back when preferred planning model is unavailable and records it', async () => {
    const client = fakeClient();
    const router = new LlmRouter({ client });
    const preferred = router.select({ taskClass: TASK_CLASS.PLANNING }).preferredModel;
    const result = await router.complete({
      taskClass: TASK_CLASS.PLANNING,
      prompt: 'plan this',
      structuredOutputRequired: true,
      forceUnavailableModels: [preferred]
    });
    assert.equal(result.status, 'ok');
    assert.equal(result.preferredModel, preferred);
    assert.notEqual(result.model, preferred);
    assert.equal(result.fallback, true);
    assert.ok(result.fallbackReason);
    assert.ok(!client.calls.some((c) => c.model === preferred));
  });

  test('quality escalation retries invalid structured output on a stronger model', async () => {
    const registry = loadModelRegistry();
    const planning = modelsForTask(registry, TASK_CLASS.PLANNING);
    const preferred = planning[0].modelId;
    const fallback = planning[1].modelId;
    const client = fakeClient({ invalidJson: [preferred] });
    const router = new LlmRouter({ client });
    const result = await router.complete({
      taskClass: TASK_CLASS.PLANNING,
      prompt: 'plan this',
      structuredOutputRequired: true
    });
    assert.equal(result.status, 'ok');
    assert.equal(result.model, fallback);
    assert.equal(result.fallback, true);
    assert.ok(result.attempts.some((a) => a.status === 'invalid-json'));
  });

  test('does not claim the preferred model ran when a fallback did', async () => {
    const client = fakeClient({ fail: ['anthropic/claude-sonnet-4.5'] });
    const router = new LlmRouter({ client });
    const result = await router.complete({
      taskClass: TASK_CLASS.PLANNING,
      prompt: 'plan',
      structuredOutputRequired: true
    });
    assert.equal(result.model, 'x-ai/grok-4.5');
    assert.equal(result.preferredModel, 'anthropic/claude-sonnet-4.5');
    assert.equal(result.fallback, true);
  });

  test('CHAT stays on a cheap eligible model', () => {
    const router = new LlmRouter({ client: fakeClient() });
    const chat = router.select({ taskClass: TASK_CLASS.CHAT });
    assert.ok(['deepseek/deepseek-chat', 'google/gemini-2.0-flash', 'x-ai/grok-4.5'].includes(chat.selectedModel));
  });

  test('REASONING falls back to grok when claude is forced down', async () => {
    const client = fakeClient();
    const router = new LlmRouter({ client });
    const preferred = router.select({ taskClass: TASK_CLASS.REASONING }).preferredModel;
    assert.equal(preferred, 'anthropic/claude-sonnet-4.5');
    const result = await router.complete({
      taskClass: TASK_CLASS.REASONING,
      prompt: 'critique this',
      structuredOutputRequired: true,
      forceUnavailableModels: [preferred]
    });
    assert.equal(result.status, 'ok');
    assert.notEqual(result.model, preferred);
    assert.ok(result.model);
    assert.equal(result.fallback, true);
    const eligible = router.select({ taskClass: TASK_CLASS.REASONING, forceUnavailableModels: [preferred] }).eligible;
    assert.ok(eligible.includes('x-ai/grok-4.5'));
    assert.ok(eligible.length >= 2);
  });
});
