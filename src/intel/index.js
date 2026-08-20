export {
  ENTITY_TYPE, SOURCE_KIND, SOURCE_STATUS, CLAIM_STATUS, TRUST_CLASS,
  INTEL_INTENT, EVIDENCE_BUDGET, createIntelligenceRequest, newId
} from './schema.js';
export { planSearchQueries } from './queries.js';
export { SourceRegistry, BUILTIN_SOURCES, sourceQuality } from './sources.js';
export { IntelStore } from './store.js';
export { EvidenceGraph, decideMerge, normalizeAlias } from './graph.js';
export { IntelligenceFabric } from './research.js';
export { registerIntelCapabilities } from './register.js';
export { matchIntelControl, formatIntelReply } from './control.js';