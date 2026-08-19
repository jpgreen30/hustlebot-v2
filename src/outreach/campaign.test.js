import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransition,
  transitionCampaign,
  applyApprovalToCampaign,
  setProspectOutreachState
} from './campaign.js';

describe('campaign state machine', () => {
  test('cannot move PENDING_APPROVAL to RUNNING', () => {
    assert.equal(canTransition('PENDING_APPROVAL', 'RUNNING'), false);
    const blocked = transitionCampaign({ lifecycle: 'PENDING_APPROVAL' }, 'RUNNING');
    assert.match(blocked.lastTransitionError, /pending approval/i);
    assert.equal(blocked.lifecycle, 'PENDING_APPROVAL');
  });

  test('approved campaign may start', () => {
    const approved = applyApprovalToCampaign({
      lifecycle: 'PENDING_APPROVAL',
      approval: { status: 'approved' }
    });
    assert.equal(approved.lifecycle, 'APPROVED');
    const running = transitionCampaign(approved, 'RUNNING', 'start');
    assert.equal(running.lifecycle, 'RUNNING');
  });

  test('prospect outreach states persist events and reject unknown states', () => {
    const next = setProspectOutreachState({ outreachEvents: [] }, 'QUEUED', { type: 'queued' });
    assert.equal(next.outreachState, 'QUEUED');
    assert.equal(next.outreachEvents.length, 1);
    assert.throws(() => setProspectOutreachState({}, 'EMAILING'));
  });
});
