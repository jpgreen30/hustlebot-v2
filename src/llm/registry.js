/**
 * Configurable model registry. IDs are env/config driven so they can change
 * without rewriting planners.
 */

export const TASK_CLASS = {
  CHAT: 'CHAT',
  CLASSIFICATION: 'CLASSIFICATION',
  EXTRACTION: 'EXTRACTION',
  SUMMARIZATION: 'SUMMARIZATION',
  PLANNING: 'PLANNING',
  REASONING: 'REASONING',
  RECOVERY: 'RECOVERY',
  CODE: 'CODE'
};

const DEFAULT_MODELS = [
  {
    modelId: 'deepseek/deepseek-chat',
    provider: 'openrouter',
    enabled: true,
    taskClasses: [
      TASK_CLASS.CLASSIFICATION,
      TASK_CLASS.EXTRACTION,
      TASK_CLASS.SUMMARIZATION,
      TASK_CLASS.CHAT,
      TASK_CLASS.REASONING
    ],
    contextWindow: 64000,
    structuredOutput: true,
    relativeCost: 1,
    relativeLatency: 1,
    reasoningStrength: 2,
    health: 'HEALTHY'
  },
  {
    modelId: 'x-ai/grok-4.5',
    provider: 'openrouter',
    enabled: true,
    taskClasses: [
      TASK_CLASS.CHAT,
      TASK_CLASS.SUMMARIZATION,
      TASK_CLASS.PLANNING,
      TASK_CLASS.RECOVERY,
      TASK_CLASS.REASONING
    ],
    contextWindow: 128000,
    structuredOutput: true,
    relativeCost: 3,
    relativeLatency: 2,
    reasoningStrength: 3,
    health: 'HEALTHY'
  },
  {
    modelId: 'anthropic/claude-sonnet-4.5',
    provider: 'openrouter',
    enabled: true,
    taskClasses: [TASK_CLASS.PLANNING, TASK_CLASS.REASONING, TASK_CLASS.RECOVERY],
    contextWindow: 200000,
    structuredOutput: true,
    relativeCost: 5,
    relativeLatency: 3,
    reasoningStrength: 5,
    health: 'HEALTHY'
  },
  {
    modelId: 'google/gemini-2.0-flash',
    provider: 'openrouter',
    enabled: true,
    taskClasses: [
      TASK_CLASS.CLASSIFICATION,
      TASK_CLASS.EXTRACTION,
      TASK_CLASS.CHAT,
      TASK_CLASS.REASONING,
      TASK_CLASS.SUMMARIZATION
    ],
    contextWindow: 1000000,
    structuredOutput: true,
    relativeCost: 1,
    relativeLatency: 1,
    reasoningStrength: 2,
    health: 'HEALTHY'
  },
  {
    modelId: 'moonshot/moonshot-v1-128k',
    provider: 'openrouter',
    enabled: true,
    taskClasses: [TASK_CLASS.CODE],
    contextWindow: 128000,
    structuredOutput: true,
    relativeCost: 2,
    relativeLatency: 2,
    reasoningStrength: 3,
    health: 'HEALTHY'
  }
];

export function loadModelRegistry(config = {}) {
  let extra = [];
  if (config.models) extra = config.models;
  else if (process.env.HUSTLEBOT_MODELS) {
    try { extra = JSON.parse(process.env.HUSTLEBOT_MODELS); } catch { extra = []; }
  }
  const merged = new Map();
  for (const model of [...DEFAULT_MODELS, ...extra]) {
    if (!model?.modelId) continue;
    merged.set(model.modelId, {
      ...DEFAULT_MODELS.find((m) => m.modelId === model.modelId),
      ...model,
      enabled: model.enabled !== false
    });
  }
  return [...merged.values()];
}

export function modelsForTask(registry, taskClass) {
  return registry
    .filter((m) => m.enabled && (m.taskClasses || []).includes(taskClass))
    .sort((a, b) => {
      const cheap = (a.relativeCost || 3) - (b.relativeCost || 3);
      if (taskClass === TASK_CLASS.PLANNING || taskClass === TASK_CLASS.REASONING || taskClass === TASK_CLASS.RECOVERY) {
        return (b.reasoningStrength || 0) - (a.reasoningStrength || 0) || cheap;
      }
      if (taskClass === TASK_CLASS.CODE) {
        return (b.reasoningStrength || 0) - (a.reasoningStrength || 0) || cheap;
      }
      return cheap || (a.relativeLatency || 2) - (b.relativeLatency || 2);
    });
}
