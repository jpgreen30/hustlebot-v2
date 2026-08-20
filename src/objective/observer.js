export const OBSERVATION = {
  SUCCESS: 'SUCCESS',
  PARTIAL: 'PARTIAL',
  RETRYABLE_FAILURE: 'RETRYABLE_FAILURE',
  PROVIDER_FAILURE: 'PROVIDER_FAILURE',
  INVALID_RESULT: 'INVALID_RESULT',
  BLOCKED: 'BLOCKED',
  TERMINAL_FAILURE: 'TERMINAL_FAILURE'
};

export function observeNodeResult(node, invocation) {
  if (!invocation) {
    return { status: OBSERVATION.TERMINAL_FAILURE, reason: 'no invocation record' };
  }
  if (invocation.blocked || invocation.result?.status === 'blocked') {
    return { status: OBSERVATION.BLOCKED, reason: invocation.result?.error || 'blocked' };
  }
  if (invocation.success === false) {
    const message = String(invocation.error || invocation.result?.error || 'provider failed');
    const retryable = /timeout|unavailable|ECONN|429|503|fail/i.test(message);
    return {
      status: retryable ? OBSERVATION.RETRYABLE_FAILURE : OBSERVATION.PROVIDER_FAILURE,
      reason: message
    };
  }
  const result = invocation.result;
  if (result == null) {
    return { status: OBSERVATION.INVALID_RESULT, reason: 'empty result' };
  }
  if (result.status === 'failed' || result.status === 'unavailable') {
    const message = result.error || result.status;
    return {
      status: /unavailable|timeout/i.test(String(message))
        ? OBSERVATION.PROVIDER_FAILURE
        : OBSERVATION.RETRYABLE_FAILURE,
      reason: message
    };
  }
  if (node.capabilityId === 'org.discover' || node.id === 'discover') {
    const orgs = result.prospects || result.organizations || result.records || result.results || [];
    if (!Array.isArray(orgs) || orgs.length === 0) {
      return { status: OBSERVATION.RETRYABLE_FAILURE, reason: 'discovery returned zero organizations' };
    }
  }
  if (node.capabilityId?.startsWith('contact.discover')) {
    const people = result.contacts
      || (result.prospects || []).flatMap((p) => p.contacts || []);
    if (Array.isArray(people) && people.length === 0) {
      return { status: OBSERVATION.PARTIAL, reason: 'zero named contacts is a legitimate provider result' };
    }
  }
  return { status: OBSERVATION.SUCCESS, reason: invocation.provider ? `via ${invocation.provider}` : 'ok' };
}
