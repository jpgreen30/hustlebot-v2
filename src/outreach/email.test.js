import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { OutreachEmailProvider } from './email.js';

describe('outreach.email provider', () => {
  test('is UNAVAILABLE without credentials and never fabricates an id', async () => {
    const provider = new OutreachEmailProvider({ brevoApiKey: null, senderEmail: null });
    const out = await provider.send({
      to: 'test@example.com',
      subject: 'HustleBot Production Test',
      body: 'This is a HustleBot controlled outreach production test.'
    });
    assert.equal(out.status, 'unavailable');
    assert.match(out.error, /UNAVAILABLE/);
    assert.equal(out.fabricated, false);
    assert.equal(out.providerMessageId, undefined);
  });

  test('returns the provider message id when Brevo accepts the send', async () => {
    const provider = new OutreachEmailProvider({
      brevoApiKey: 'key',
      senderEmail: 'bot@hustlebot.test',
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ messageId: '<abc@brevo>' })
      })
    });
    const out = await provider.send({
      to: 'ops@hustlebot.test',
      subject: 'HustleBot Production Test',
      body: 'This is a HustleBot controlled outreach production test.',
      campaignId: 'cmp_1',
      prospectId: 'prs_1',
      contactId: 'per_1',
      executionId: 'exe_1'
    });
    assert.equal(out.status, 'sent');
    assert.equal(out.providerMessageId, '<abc@brevo>');
    assert.equal(out.campaignId, 'cmp_1');
  });
});
