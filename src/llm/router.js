/**
 * Intelligent LLM router. Task class in, eligible model out, with fallback
 * and one-shot quality escalation. Never claims the preferred model ran
 * when a fallback actually did.
 */

import logger from '../utils/logger.js';
import { TASK_CLASS, loadModelRegistry, modelsForTask } from './registry.js';

function parseJson(text) {
  if (!text) return null;
  const match = String(text).match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

export class LlmRouter {
  constructor({ client, models, fetchImpl } = {}) {
    this.client = client || null;
    this.models = loadModelRegistry({ models });
    this.fetchImpl = fetchImpl || fetch;
    this.forcedDown = new Set();
    this.lastRoute = null;
  }

  list() {
    return this.models.filter((m) => m.enabled);
  }

  forceUnavailable(modelId) {
    this.forcedDown.add(modelId);
  }

  restore(modelId) {
    this.forcedDown.delete(modelId);
  }

  candidates(taskClass) {
    return modelsForTask(this.models, taskClass)
      .filter((m) => m.health !== 'UNAVAILABLE' && !this.forcedDown.has(m.modelId));
  }

  select(input = {}) {
    const taskClass = input.taskClass || TASK_CLASS.CHAT;
    const all = modelsForTask(this.models, taskClass)
      .filter((m) => m.enabled && m.health !== 'UNAVAILABLE');
    const preferred = all[0]?.modelId || null;
    const list = all.filter((m) => !this.forcedDown.has(m.modelId));
    const route = {
      taskClass,
      preferredModel: preferred || null,
      selectedModel: list[0]?.modelId || null,
      eligible: list.map((m) => m.modelId),
      fallback: Boolean(preferred && list[0]?.modelId && list[0].modelId !== preferred),
      reason: list[0]
        ? `${taskClass} routed to ${list[0].modelId} (cost ${list[0].relativeCost}, reasoning ${list[0].reasoningStrength})${preferred && list[0].modelId !== preferred ? `; preferred ${preferred} unavailable` : ''}`
        : `No eligible model for ${taskClass}`
    };
    this.lastRoute = route;
    return route;
  }

  async complete(input = {}) {
    const taskClass = input.taskClass || TASK_CLASS.CHAT;
    const prompt = input.prompt || input.text || '';
    const structured = input.structuredOutputRequired === true || input.structuredOutput === true;
    const forceDown = new Set([...(input.forceUnavailableModels || []), ...this.forcedDown]);
    const all = modelsForTask(this.models, taskClass)
      .filter((m) => m.enabled && m.health !== 'UNAVAILABLE');
    const preferred = all[0]?.modelId || null;
    const list = all.filter((m) => !forceDown.has(m.modelId));
    const attempts = [];

    if (!this.client?.complete) {
      return {
        status: 'unavailable',
        error: 'LLM client not configured',
        model: null,
        preferredModel: preferred,
        fallback: false,
        attempts,
        content: null
      };
    }

    for (const model of list) {
      try {
        const result = await this.client.complete(prompt, {
          taskType: taskClass.toLowerCase(),
          model: model.modelId,
          maxTokens: input.maxTokens || (taskClass === TASK_CLASS.PLANNING ? 800 : 400),
          temperature: input.temperature ?? (structured ? 0.2 : 0.4)
        });
        const used = result.model || model.modelId;
        attempts.push({ modelId: used, status: 'ok' });
        let content = result.content;
        if (structured) {
          const parsed = parseJson(content);
          if (!parsed) {
            attempts[attempts.length - 1] = { modelId: used, status: 'invalid-json' };
            if (attempts.length < 2 && list[1]) continue;
            return {
              status: 'failed',
              error: 'structured output was not valid JSON',
              model: used,
              preferredModel: preferred,
              fallback: used !== preferred,
              fallbackReason: used !== preferred ? 'invalid structured output' : null,
              attempts,
              content,
              parsed: null
            };
          }
          content = parsed;
        }
        const fallback = used !== preferred;
        return {
          status: 'ok',
          content: structured ? undefined : content,
          parsed: structured ? content : undefined,
          text: typeof result.content === 'string' ? result.content : JSON.stringify(content),
          model: used,
          preferredModel: preferred,
          fallback,
          fallbackReason: fallback
            ? (attempts.some((a) => a.status !== 'ok') ? attempts.map((a) => `${a.modelId}:${a.status}`).join(',') : 'preferred unavailable')
            : null,
          attempts,
          cost: result.cost || 0,
          tokens: result.tokens || null
        };
      } catch (error) {
        attempts.push({ modelId: model.modelId, status: 'failed', error: error.message });
        logger.warn(`LLM ${model.modelId} failed: ${error.message}`);
      }
    }

    return {
      status: 'failed',
      error: attempts.length ? attempts.map((a) => `${a.modelId}: ${a.error || a.status}`).join('; ') : `no eligible ${taskClass} model`,
      model: null,
      preferredModel: preferred,
      fallback: false,
      attempts,
      content: null
    };
  }
}

export { TASK_CLASS };
