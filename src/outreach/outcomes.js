/**
 * Normalize provider events into HustleBot outreach events.
 * Original payload references are preserved, never overwritten.
 */

export function mapRetellEvent(payload = {}) {
  const raw = String(payload.call_status || payload.status || '').toLowerCase();
  let eventType = 'call.started';
  let normalized = 'registered';
  if (raw === 'ongoing' || raw === 'registered') {
    eventType = 'call.started';
    normalized = raw === 'ongoing' ? 'ongoing' : 'registered';
  } else if (raw === 'ended' || raw === 'completed') {
    eventType = 'call.completed';
    normalized = 'completed';
  } else if (raw === 'not_connected' || raw === 'no_answer') {
    eventType = 'call.outcome';
    normalized = 'no_answer';
  } else if (raw === 'voicemail') {
    eventType = 'call.outcome';
    normalized = 'voicemail';
  } else if (raw === 'error' || raw === 'failed') {
    eventType = 'call.outcome';
    normalized = 'failed';
  }
  return {
    provider: 'retell',
    providerEventId: payload.call_id || payload.callId || payload.providerEventId || null,
    eventType,
    normalizedStatus: normalized,
    timestamp: payload.end_timestamp || payload.start_timestamp || new Date().toISOString(),
    metadata: { rawStatus: raw },
    providerPayloadRef: {
      call_id: payload.call_id || payload.callId || null,
      disconnection_reason: payload.disconnection_reason || null
    }
  };
}

export function mapEmailEvent(payload = {}) {
  const raw = String(payload.event || payload.status || '').toLowerCase();
  const map = {
    queued: 'email.queued',
    sent: 'email.sent',
    delivered: 'email.delivered',
    bounce: 'email.bounced',
    bounced: 'email.bounced',
    reply: 'email.replied',
    replied: 'email.replied',
    failed: 'email.failed',
    error: 'email.failed'
  };
  return {
    provider: payload.provider || 'email',
    providerEventId: payload.providerMessageId || payload.messageId || payload['message-id'] || null,
    eventType: map[raw] || 'email.sent',
    normalizedStatus: raw || 'sent',
    timestamp: payload.timestamp || new Date().toISOString(),
    metadata: { rawStatus: raw },
    providerPayloadRef: {
      messageId: payload.providerMessageId || payload.messageId || null
    }
  };
}

export function toStoredEvent(mapped, context = {}) {
  return {
    provider: mapped.provider,
    providerEventId: mapped.providerEventId,
    campaignId: context.campaignId || null,
    prospectId: context.prospectId || null,
    contactId: context.contactId || null,
    executionId: context.executionId || null,
    eventType: mapped.eventType,
    timestamp: mapped.timestamp,
    metadata: {
      ...(mapped.metadata || {}),
      normalizedStatus: mapped.normalizedStatus,
      providerPayloadRef: mapped.providerPayloadRef
    }
  };
}
