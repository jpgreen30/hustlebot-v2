import { SIDE_EFFECT } from '../objective/catalogue.js';

export function registerIntelCapabilities(registry, fabric) {
  if (!registry || !fabric) return;
  registry.registerAll([
    {
      capabilityId: 'intelligence.research',
      name: 'Run a bounded intelligence research request',
      description: 'Plans queries, selects sources, ingests evidence. Not a mega-pipeline; org.discover remains planner-visible.',
      provider: 'intel-fabric',
      permissions: ['network.read'],
      tags: ['research', 'intel'],
      sideEffect: SIDE_EFFECT.READ_ONLY,
      inputs: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          objective: { type: 'string' },
          quantity: { type: 'number' }
        }
      },
      expectedCost: 0.01,
      expectedLatencyMs: 20000,
      reliability: 0.8,
      handler: (input, context) => fabric.research(input, context),
      isAvailable: () => true
    },
    {
      capabilityId: 'intelligence.verify',
      name: 'Verify a claim against persisted evidence',
      description: 'Returns discovered/corroborated/conflicted/insufficient-evidence. LLM confidence is not verification.',
      provider: 'intel-fabric',
      permissions: ['data.read'],
      tags: ['verify', 'intel'],
      sideEffect: SIDE_EFFECT.READ_ONLY,
      inputs: {
        type: 'object',
        properties: {
          entity: { type: 'string' },
          claim: { type: 'string' },
          predicate: { type: 'string' }
        }
      },
      expectedCost: 0,
      expectedLatencyMs: 40,
      reliability: 0.99,
      handler: (input) => fabric.verify(input),
      isAvailable: () => true
    },
    {
      capabilityId: 'intelligence.refresh',
      name: 'Refresh an entity without destroying historical evidence',
      provider: 'intel-fabric',
      permissions: ['network.read'],
      tags: ['refresh', 'intel'],
      sideEffect: SIDE_EFFECT.READ_ONLY,
      handler: (input, context) => fabric.refresh({ ...input, context }),
      isAvailable: () => true
    },
    {
      capabilityId: 'intelligence.inspect',
      name: 'Inspect persisted evidence, claims, and provenance',
      provider: 'intel-fabric',
      permissions: ['data.read'],
      tags: ['inspect', 'intel'],
      sideEffect: SIDE_EFFECT.READ_ONLY,
      handler: async (input) => fabric.graph.inspectEntity(input.query || input.entity || input.name),
      isAvailable: () => true
    },
    {
      capabilityId: 'intelligence.market-map',
      name: 'Compose a market map from evidence',
      provider: 'intel-fabric',
      permissions: ['network.read'],
      tags: ['research', 'intel'],
      sideEffect: SIDE_EFFECT.READ_ONLY,
      handler: (input, context) => fabric.marketMap(input, context),
      isAvailable: () => true
    }
  ]);
}
