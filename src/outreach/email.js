/**
 * Provider-independent outreach email.
 * Possible providers: Brevo, SMTP (future), Gmail (future).
 * Never fabricates a provider message id.
 */

import logger from '../utils/logger.js';
import { validateEmail } from '../intelligence/validation.js';

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

export class OutreachEmailProvider {
  constructor(config = {}) {
    this.brevoApiKey = config.brevoApiKey || process.env.BREVO_API_KEY || null;
    this.senderEmail = config.senderEmail || process.env.SENDER_EMAIL || process.env.OUTREACH_FROM_EMAIL || null;
    this.senderName = config.senderName || process.env.SENDER_NAME || 'HustleBot';
    this.testEmail = config.testEmail || process.env.OUTREACH_TEST_EMAIL || process.env.EMAIL_TEST_DESTINATION || null;
    this.fetchImpl = config.fetchImpl || fetch;
    this.usage = { requests: 0 };
  }

  isAvailable() {
    return Boolean(this.brevoApiKey && this.senderEmail);
  }

  isReady() {
    return this.isAvailable();
  }

  getHealth() {
    if (!this.brevoApiKey) {
      return { state: 'UNAVAILABLE', detail: 'BREVO_API_KEY not set' };
    }
    if (!this.senderEmail) {
      return { state: 'MISCONFIGURED', detail: 'SENDER_EMAIL / OUTREACH_FROM_EMAIL not set' };
    }
    return { state: 'UNVERIFIED', detail: 'Brevo credentials present' };
  }

  authorizedDestinations() {
    return [this.testEmail].filter(Boolean).map((value) => String(value).trim().toLowerCase());
  }

  async send(input = {}) {
    const to = String(input.to || '').trim();
    const subject = String(input.subject || '').trim();
    const body = String(input.body || '').trim();
    if (!this.isAvailable()) {
      return {
        status: 'unavailable',
        error: 'EMAIL OUTREACH: UNAVAILABLE',
        reason: 'No production email provider is configured',
        fabricated: false
      };
    }
    const format = validateEmail(to);
    if (!format.formatOk) {
      return { status: 'failed', error: 'invalid destination email', fabricated: false };
    }
    if (!subject || !body) {
      return { status: 'failed', error: 'subject and body are required', fabricated: false };
    }

    this.usage.requests += 1;
    try {
      const response = await this.fetchImpl(BREVO_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'api-key': this.brevoApiKey
        },
        body: JSON.stringify({
          sender: { email: this.senderEmail, name: this.senderName },
          to: [{ email: to }],
          subject,
          textContent: body,
          headers: {
            'X-HustleBot-Campaign': input.campaignId || '',
            'X-HustleBot-Prospect': input.prospectId || '',
            'X-HustleBot-Contact': input.contactId || '',
            'X-HustleBot-Execution': input.executionId || ''
          }
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          status: 'failed',
          error: payload.message || payload.error || `Brevo HTTP ${response.status}`,
          httpStatus: response.status,
          fabricated: false
        };
      }
      const providerMessageId = payload.messageId || payload.messageIds?.[0] || null;
      if (!providerMessageId) {
        return {
          status: 'failed',
          error: 'Brevo accepted the request but returned no message id',
          fabricated: false
        };
      }
      return {
        status: 'sent',
        provider: 'brevo',
        providerMessageId,
        to,
        subject,
        campaignId: input.campaignId || null,
        prospectId: input.prospectId || null,
        contactId: input.contactId || null,
        executionId: input.executionId || null,
        timestamp: new Date().toISOString(),
        fabricated: false
      };
    } catch (error) {
      logger.warn(`Outreach email failed: ${error.message}`);
      return { status: 'failed', error: error.message, fabricated: false };
    }
  }
}
