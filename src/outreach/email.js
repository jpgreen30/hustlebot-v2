/**
 * Provider-independent outreach email.
 * Possible providers: Brevo, SMTP (future), Gmail (future).
 * Never fabricates a provider message id.
 */

import logger from '../utils/logger.js';
import { validateEmail } from '../intelligence/validation.js';

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_SENDERS_URL = 'https://api.brevo.com/v3/senders';

function configuredSender() {
  const from = process.env.OUTREACH_FROM_EMAIL || process.env.SENDER_EMAIL || null;
  return from && String(from).trim() ? String(from).trim() : null;
}

export class OutreachEmailProvider {
  constructor(config = {}) {
    this.brevoApiKey = config.brevoApiKey || process.env.BREVO_API_KEY || null;
    this.senderEmail = config.senderEmail || configuredSender();
    this.senderName = config.senderName || process.env.SENDER_NAME || 'HustleBot';
    this.testEmail = config.testEmail || process.env.OUTREACH_TEST_EMAIL || process.env.EMAIL_TEST_DESTINATION || null;
    this.fetchImpl = config.fetchImpl || fetch;
    this.usage = { requests: 0 };
    this.verifiedSenders = [];
    this.senderSource = this.senderEmail
      ? (process.env.OUTREACH_FROM_EMAIL ? 'OUTREACH_FROM_EMAIL' : 'SENDER_EMAIL')
      : null;
    this.senderChoice = this.senderEmail ? 'configured' : 'unresolved';
    this.lastSenderError = null;
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
      if (this.senderChoice === 'ambiguous') {
        return {
          state: 'MISCONFIGURED',
          detail: `Multiple verified Brevo senders; not guessing (${this.verifiedSenders.length})`
        };
      }
      return {
        state: 'MISCONFIGURED',
        detail: this.lastSenderError || 'No verified Brevo sender resolved'
      };
    }
    return {
      state: 'HEALTHY',
      detail: `sender ${this.senderEmail} via ${this.senderSource}`
    };
  }

  authorizedDestinations() {
    return [this.testEmail].filter(Boolean).map((value) => String(value).trim().toLowerCase());
  }

  headers() {
    return {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': this.brevoApiKey
    };
  }

  async listSenders() {
    if (!this.brevoApiKey) {
      return { status: 'unavailable', senders: [], error: 'BREVO_API_KEY not set' };
    }
    try {
      const response = await this.fetchImpl(BREVO_SENDERS_URL, { headers: this.headers() });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          status: 'failed',
          senders: [],
          error: payload.message || payload.error || `Brevo HTTP ${response.status}`,
          httpStatus: response.status
        };
      }
      const senders = (payload.senders || []).map((item) => ({
        id: item.id ?? null,
        email: item.email || null,
        name: item.name || null,
        active: item.active !== false
      })).filter((item) => item.email);
      return { status: 'ok', senders, fabricated: false };
    } catch (error) {
      return { status: 'failed', senders: [], error: error.message };
    }
  }

  async resolveSender() {
    const configured = configuredSender() || this.senderEmail;
    const listed = await this.listSenders();
    if (listed.status === 'ok') {
      this.verifiedSenders = listed.senders.filter((s) => s.active && s.email);
    } else {
      this.lastSenderError = listed.error;
      this.verifiedSenders = [];
    }

    if (configured) {
      this.senderEmail = configured;
      this.senderSource = process.env.OUTREACH_FROM_EMAIL ? 'OUTREACH_FROM_EMAIL' : (process.env.SENDER_EMAIL ? 'SENDER_EMAIL' : 'constructor');
      this.senderChoice = 'configured';
      const match = this.verifiedSenders.find((s) => s.email.toLowerCase() === configured.toLowerCase());
      if (match?.name) this.senderName = this.senderName || match.name;
      return { status: 'ok', email: this.senderEmail, source: this.senderSource, options: this.verifiedSenders };
    }

    if (this.verifiedSenders.length === 1) {
      const only = this.verifiedSenders[0];
      this.senderEmail = only.email;
      this.senderName = only.name || this.senderName;
      this.senderSource = 'brevo-senders';
      this.senderChoice = 'unique-verified';
      logger.info(`📧 Resolved unique verified Brevo sender ${only.email}`);
      return { status: 'ok', email: this.senderEmail, source: this.senderSource, options: this.verifiedSenders };
    }

    if (this.verifiedSenders.length > 1) {
      this.senderChoice = 'ambiguous';
      this.senderEmail = null;
      return {
        status: 'ambiguous',
        email: null,
        source: null,
        options: this.verifiedSenders,
        error: 'Multiple verified senders; operator must choose'
      };
    }

    this.senderChoice = 'unresolved';
    return {
      status: 'unresolved',
      email: null,
      options: [],
      error: this.lastSenderError || 'No verified Brevo sender returned'
    };
  }

  async send(input = {}) {
    const to = String(input.to || '').trim();
    const subject = String(input.subject || '').trim();
    const body = String(input.body || '').trim();
    if (!this.senderEmail && this.brevoApiKey) {
      await this.resolveSender();
    }
    if (!this.isAvailable()) {
      return {
        status: 'unavailable',
        error: 'EMAIL OUTREACH: UNAVAILABLE',
        reason: this.senderChoice === 'ambiguous'
          ? 'Multiple verified Brevo senders; not guessing'
          : 'No production email provider is configured',
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
        headers: this.headers(),
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
