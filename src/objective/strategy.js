export function suggestStrategy(objective, memoryRecords = []) {
  const pattern = objective?.context?.pattern;
  const matches = (memoryRecords || []).filter((record) => {
    if (record.status !== 'completed') return false;
    return record.plan?.pattern === pattern || record.context?.pattern === pattern;
  });
  if (!matches.length) return { used: false, reason: 'no prior successful pattern' };
  const last = matches[0];
  const sequence = (last.plan?.nodes || []).map((n) => n.capabilityId);
  const providers = [...new Set((last.executions || []).map((e) => e.provider).filter(Boolean))];
  const failures = (last.executions || []).filter((e) => e.status === 'failed').map((e) => e.error).filter(Boolean);
  return {
    used: true,
    reason: `Prior ${pattern} objective ${last.objectiveId} completed`,
    suggestedSequence: sequence,
    providerPreference: providers,
    knownFailureModes: failures.slice(0, 5),
    sourceObjectiveId: last.objectiveId
  };
}
