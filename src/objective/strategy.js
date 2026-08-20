export function suggestStrategy(objective, memoryRecords = [], operational = []) {
  const pattern = objective?.context?.pattern;
  const matches = (memoryRecords || []).filter((record) => {
    if (record.status !== 'completed') return false;
    return record.plan?.pattern === pattern || record.context?.pattern === pattern;
  });
  const lessons = (operational || []).map((m) => ({
    memoryId: m.memoryId,
    subject: m.subject,
    content: m.content,
    confidence: m.confidence,
    createdAt: m.createdAt
  }));
  if (!matches.length && !lessons.length) {
    return { used: false, reason: 'no prior successful pattern', operationalLessons: lessons, liveHealthWins: true };
  }
  const last = matches[0];
  const sequence = (last?.plan?.nodes || []).map((n) => n.capabilityId);
  const providers = [...new Set((last?.executions || []).map((e) => e.provider).filter(Boolean))];
  const failures = (last?.executions || []).filter((e) => e.status === 'failed').map((e) => e.error).filter(Boolean);
  return {
    used: Boolean(last) || lessons.length > 0,
    reason: last
      ? `Prior ${pattern} objective ${last.objectiveId} completed`
      : `Operational memory: ${lessons.map((l) => l.subject).join(', ')}`,
    suggestedSequence: sequence,
    providerPreference: providers,
    knownFailureModes: failures.slice(0, 5),
    sourceObjectiveId: last?.objectiveId || null,
    operationalLessons: lessons,
    liveHealthWins: true
  };
}
