/**
 * Contact validation states.
 * Discovery is separate from validation. Format checks are not provider validation.
 * Never claim VALIDATED without a real validation provider result.
 */

export const EMAIL_STATES = [
  'UNKNOWN',
  'DISCOVERED',
  'FORMAT_VALID',
  'VALIDATED',
  'RISKY',
  'INVALID',
  'INFERRED'
];

export const PHONE_STATES = [
  'UNKNOWN',
  'DISCOVERED',
  'FORMAT_VALID',
  'VALIDATED',
  'INVALID'
];

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_FORMAT = /^\+?[1-9]\d{7,14}$/;
const RISKY_EMAIL = /noreply|no-reply|donotreply|privacy|legal@|support@|info@/i;

export function validateEmail(email, options = {}) {
  if (!email) {
    return { value: null, status: 'UNKNOWN', method: 'none', formatOk: false };
  }
  if (options.inferred === true) {
    return {
      value: email,
      status: 'INFERRED',
      method: 'inferred-pattern',
      formatOk: EMAIL_FORMAT.test(email)
    };
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

export function toE164(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  if (String(phone).trim().startsWith('+')) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
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

/**
 * Syntax-only check. Never upgrades to VALIDATED.
 */
export function formatValidateEmail(email) {
  const base = validateEmail(email);
  if (base.status === 'DISCOVERED') {
    return { ...base, status: 'FORMAT_VALID', method: 'syntax' };
  }
  return base;
}

export function formatValidatePhone(phone) {
  const e164 = toE164(phone);
  const base = validatePhone(e164 || phone);
  if (base.status === 'DISCOVERED') {
    return { ...base, value: e164 || base.value, status: 'FORMAT_VALID', method: 'syntax', e164: e164 || null };
  }
  return { ...base, e164: e164 || null };
}

export class EmailValidator {
  constructor(config = {}) {
    this.provider = config.provider || null;
    this.providerName = config.providerName || null;
  }

  isAvailable() {
    return true;
  }

  async validate(email, options = {}) {
    if (this.provider && typeof this.provider.validate === 'function') {
      const result = await this.provider.validate(email, options);
      if (result?.status) return result;
    }
    if (options.providerStatus) {
      return validateEmail(email, options);
    }
    return formatValidateEmail(email);
  }
}

export class PhoneValidator {
  constructor(config = {}) {
    this.provider = config.provider || null;
    this.providerName = config.providerName || null;
  }

  isAvailable() {
    return true;
  }

  async validate(phone, options = {}) {
    if (this.provider && typeof this.provider.validate === 'function') {
      const result = await this.provider.validate(phone, options);
      if (result?.status) return result;
    }
    if (options.providerStatus) {
      return validatePhone(phone, options);
    }
    return formatValidatePhone(phone);
  }
}
