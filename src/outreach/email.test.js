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

  test('resolves a unique verified Brevo sender from GET /v3/senders', async () => {
    const prevFrom = process.env.OUTREACH_FROM_EMAIL;
    const prevSender = process.env.SENDER_EMAIL;
    delete process.env.OUTREACH_FROM_EMAIL;
    delete process.env.SENDER_EMAIL;
    const provider = new OutreachEmailProvider({
      brevoApiKey: 'key',
      senderEmail: null,
      fetchImpl: async (url) => {
        assert.match(String(url), /\/v3\/senders$/);
        return {
          ok: true,
          json: async () => ({ senders: [{ id: 1, email: 'ops@verified.test', name: 'Ops', active: true }] })
        };
      }
    });
    try {
      const resolved = await provider.resolveSender();
      assert.equal(resolved.status, 'ok');
      assert.equal(resolved.email, 'ops@verified.test');
      assert.equal(provider.isAvailable(), true);
      assert.equal(provider.getHealth().state, 'HEALTHY');
    } finally {
      if (prevFrom) process.env.OUTREACH_FROM_EMAIL = prevFrom;
      else delete process.env.OUTREACH_FROM_EMAIL;
      if (prevSender) process.env.SENDER_EMAIL = prevSender;
      else delete process.env.SENDER_EMAIL;
    }
  });

  test('does not guess when multiple verified senders exist', async () => {
    const prevFrom = process.env.OUTREACH_FROM_EMAIL;
    const prevSender = process.env.SENDER_EMAIL;
    delete process.env.OUTREACH_FROM_EMAIL;
    delete process.env.SENDER_EMAIL;
    const provider = new OutreachEmailProvider({
      brevoApiKey: 'key',
      senderEmail: null,
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          senders: [
            { email: 'a@verified.test', active: true },
            { email: 'b@verified.test', active: true }
          ]
        })
      })
    });
    try {
      const resolved = await provider.resolveSender();
      assert.equal(resolved.status, 'ambiguous');
      assert.equal(provider.senderEmail, null);
      assert.equal(provider.isAvailable(), false);
    } finally {
      if (prevFrom) process.env.OUTREACH_FROM_EMAIL = prevFrom;
      else delete process.env.OUTREACH_FROM_EMAIL;
      if (prevSender) process.env.SENDER_EMAIL = prevSender;
      else delete process.env.SENDER_EMAIL;
    }
  });
});

