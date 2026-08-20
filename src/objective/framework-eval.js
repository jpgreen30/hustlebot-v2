/**
 * Day-7 evaluated CrewAI, Swarms, and LangGraph and rejected them as the
 * orchestration plane. They would compete with CapabilityRegistry, ApprovalGate,
 * Tool Fabric, and the MacGyver DAG. Delegation is implemented as bounded
 * specialist tasks under MacGyver — the existing supervisor remains authoritative.
 */

export const FRAMEWORK_EVALUATION = {
  considered: ['CrewAI', 'Swarms', 'LangGraph'],
  selected: 'native-macgyver-delegation',
  reason: 'An external swarm framework would create a second control plane. Day-7 extends MacGyver with objective-driven, least-privilege, bounded specialist tasks instead.'
};
