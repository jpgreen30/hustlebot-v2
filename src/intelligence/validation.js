/**
 * Contact validation states.
 * Format checks are not real-world validation.
 */

export const EMAIL_STATES = ['UNKNOWN', 'DISCOVERED', 'VALIDATED', 'INVALID', 'RISKY'];
export const PHONE_STATES = ['UNKNOWN', 'DISCOVERED', 'VALIDATED', 'INVALID'];

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_FORMAT = /^\+?[1-9]\d{7,14}$/;
const RISKY_EMAIL = /noreply|no-reply|donotreply|privacy|legal@|support@|info@/i;

export function validateEmail(email, options = {}) {
  if (!email) {
    return { value: null, status: 'UNKNOWN', method: 'none', formatOk: false };
  }
  const formatOk = EMAIL_FORMAT.test(email);
  if (!formatOk) {
    return { value: email, status: 'INVALID', method: 'format', formatOk: false };
  }
  if (options.providerStatus) {
    return {
      value: email,
      status: options.providerStatus,
      method: options.provider || 'provider',
      formatOk: true
    };
  }
  return {
    value: email,
    status: RISKY_EMAIL.test(email) ? 'RISKY' : 'DISCOVERED',
    method: 'format',
    formatOk: true
  };
}

export function validatePhone(phone, options = {}) {
  if (!phone) {
    return { value: null, status: 'UNKNOWN', method: 'none', formatOk: false };
  }
  const digits = String(phone).replace(/[^\d+]/g, '');
  const formatOk = PHONE_FORMAT.test(digits);
  if (!formatOk) {
    return { value: phone, status: 'INVALID', method: 'format', formatOk: false };
  }
  if (options.providerStatus) {
    return {
      value: phone,
      status: options.providerStatus,
      method: options.provider || 'provider',
      formatOk: true
    };
  }
  return { value: phone, status: 'DISCOVERED', method: 'format', formatOk: true };
}

export function attachValidation(prospect) {
  const email = prospect.contact?.email || null;
  const phone = prospect.contact?.phone || null;
  return {
    ...prospect,
    validation: {
      email: validateEmail(email),
      phone: validatePhone(phone)
    }
  };
}
