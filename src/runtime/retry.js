export const FAILURE_KIND = {
  TRANSIENT: 'TRANSIENT',
  RATE_LIMIT: 'RATE_LIMIT',
  AUTH: 'AUTH',
  INVALID_INPUT: 'INVALID_INPUT',
  PROVIDER_PROTOCOL: 'PROVIDER_PROTOCOL',
  POLICY_BLOCK: 'POLICY_BLOCK',
  UNKNOWN: 'UNKNOWN'
};

export function classifyFailure(error) {
  const msg = String(error?.message || error || '');
  const status = Number(error?.status || error?.statusCode || 0);
  if (status === 401 || status === 403 || /invalid (api )?key|unauthorized|forbidden|authentication/i.test(msg)) {
    return FAILURE_KIND.AUTH;
  }
  if (status === 429 || /rate limit|too many requests|retry-after/i.test(msg)) {
    return FAILURE_KIND.RATE_LIMIT;
  }
  if (status === 400 || /invalid input|bad request|validation failed/i.test(msg)) {
    return FAILURE_KIND.INVALID_INPUT;
  }
  if (/policy|not authorized|blocked|do-not-contact|approval required/i.test(msg)) {
    return FAILURE_KIND.POLICY_BLOCK;
  }
  if (/protocol|unexpected token|malformed/i.test(msg)) {
    return FAILURE_KIND.PROVIDER_PROTOCOL;
  }
  if (status >= 500 || /ECONNRESET|ETIMEDOUT|ENOTFOUND|timeout|503|502|unavailable|interrupted|lease expired/i.test(msg)) {
    return FAILURE_KIND.TRANSIENT;
  }
  return FAILURE_KIND.UNKNOWN;
}

export function shouldRetry(kind) {
  return kind === FAILURE_KIND.TRANSIENT || kind === FAILURE_KIND.RATE_LIMIT || kind === FAILURE_KIND.UNKNOWN;
}

export function retryDelayMs(kind, attempt, base = 5000) {
  if (kind === FAILURE_KIND.RATE_LIMIT) return base * Math.max(2, attempt) * 4;
  return base * Math.max(1, attempt);
}
