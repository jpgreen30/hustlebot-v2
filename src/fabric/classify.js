/**
 * Conservative security classification for dynamically discovered tools.
 * External descriptions and "safe": true never override HustleBot policy.
 */

import { SIDE_EFFECT } from '../objective/catalogue.js';

const DESTRUCTIVE_RE = /\b(delete|destroy|purge|drop|wipe|truncate|rm\b|remove all|erase)\b/i;
const FINANCIAL_RE = /\b(payment|purchase|checkout|transfer|charge|invoice|refund|wire|crypto|wallet)\b/i;
const OUTBOUND_RE = /\b(email|sms|call|dial|tweet|post to|publish|outreach|send message|broadcast|whatsapp|telegram send)\b/i;
const WRITE_RE = /\b(write|create|update|insert|store|save|patch|put|mutate|register)\b/i;
const UNCERTAIN_RE = /\b(execute|run action|invoke|arbitrary|eval|shell|command|script)\b/i;

function blob(tool = {}) {
  return [
    tool.name,
    tool.toolId,
    tool.description,
    JSON.stringify(tool.inputSchema || {}),
    JSON.stringify(tool.annotations || {})
  ].join(' ');
}

export function classifyDiscoveredTool(tool = {}) {
  const text = blob(tool);
  const claimedSafe = tool.annotations?.safe === true || tool.safe === true || tool.metadata?.safe === true;

  if (DESTRUCTIVE_RE.test(text)) {
    return {
      sideEffect: SIDE_EFFECT.DESTRUCTIVE,
      approvalRequired: true,
      reason: 'Name/schema matches destructive operations',
      claimedSafeIgnored: claimedSafe
    };
  }
  if (FINANCIAL_RE.test(text)) {
    return {
      sideEffect: SIDE_EFFECT.FINANCIAL,
      approvalRequired: true,
      reason: 'Name/schema matches financial operations',
      claimedSafeIgnored: claimedSafe
    };
  }
  if (OUTBOUND_RE.test(text)) {
    return {
      sideEffect: SIDE_EFFECT.EXTERNAL_SIDE_EFFECT,
      approvalRequired: true,
      reason: 'Name/schema matches outbound/external side effects',
      claimedSafeIgnored: claimedSafe
    };
  }
  if (UNCERTAIN_RE.test(text) && !/read|list|get|search|inspect|health|ping|time|echo|compare/i.test(tool.name || '')) {
    return {
      sideEffect: SIDE_EFFECT.EXTERNAL_SIDE_EFFECT,
      approvalRequired: true,
      reason: 'Uncertain execute-shaped tool; defaulting to approval',
      claimedSafeIgnored: claimedSafe
    };
  }
  if (WRITE_RE.test(text) && !/read-only|readonly|inspect|list|get /i.test(text)) {
    return {
      sideEffect: SIDE_EFFECT.LOW_RISK_WRITE,
      approvalRequired: true,
      reason: 'Write-shaped tool quarantined until explicitly approved',
      claimedSafeIgnored: claimedSafe
    };
  }
  return {
    sideEffect: SIDE_EFFECT.READ_ONLY,
    approvalRequired: false,
    reason: 'No write/outbound/financial/destructive signals; classified READ_ONLY',
    claimedSafeIgnored: claimedSafe
  };
}

export function schemaIsValid(schema) {
  if (schema == null) return true;
  if (typeof schema !== 'object' || Array.isArray(schema)) return false;
  if (schema.type && schema.type !== 'object' && schema.type !== 'array' && schema.type !== 'string' && schema.type !== 'number' && schema.type !== 'boolean' && schema.type !== 'integer') {
    return false;
  }
  return true;
}
