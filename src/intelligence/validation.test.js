import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateEmail, validatePhone, attachValidation } from './validation.js';

describe('contact validation', () => {
  test('does not mark format-ok emails as VALIDATED', () => {
    const email = validateEmail('ada@katalys.com');
    assert.equal(email.status, 'DISCOVERED');
    assert.equal(email.method, 'format');
    assert.equal(email.formatOk, true);
  });

  test('marks role/noreply addresses as RISKY, not VALIDATED', () => {
    assert.equal(validateEmail('info@brand.test').status, 'RISKY');
    assert.equal(validateEmail('no-reply@brand.test').status, 'RISKY');
  });

  test('missing values stay UNKNOWN', () => {
    assert.equal(validateEmail(null).status, 'UNKNOWN');
    assert.equal(validatePhone(null).status, 'UNKNOWN');
  });

  test('provider status is required for VALIDATED', () => {
    const email = validateEmail('ada@katalys.com', { providerStatus: 'VALIDATED', provider: 'neverbounce' });
    assert.equal(email.status, 'VALIDATED');
    assert.equal(email.method, 'neverbounce');
  });

  test('attachValidation writes both email and phone states', () => {
    const out = attachValidation({ contact: { email: 'bad', phone: '+18185551212' } });
    assert.equal(out.validation.email.status, 'INVALID');
    assert.equal(out.validation.phone.status, 'DISCOVERED');
  });

  test('email.validate syntax check is FORMAT_VALID and never VALIDATED', async () => {
    const { EmailValidator, PhoneValidator, formatValidateEmail } = await import('./validation.js');
    const email = new EmailValidator();
    const checked = await email.validate('ada@katalys.com');
    assert.equal(checked.status, 'FORMAT_VALID');
    assert.notEqual(checked.status, 'VALIDATED');
    assert.equal(formatValidateEmail('ada@katalys.com').status, 'FORMAT_VALID');
    const phone = await new PhoneValidator().validate('+18184381415');
    assert.equal(phone.status, 'FORMAT_VALID');
    assert.ok(phone.e164);
  });
});
