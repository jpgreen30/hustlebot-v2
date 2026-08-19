import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityRegistry } from '../core/capability-registry.js';
import { registerPlatformCapabilities } from '../core/platform-capabilities.js';
import { registerAcquisitionCapabilities } from '../acquisition/register.js';
import { registerIntelligenceCapabilities } from './register.js';
import { IntentDetector } from '../core/intent-detector.js';

describe('Day-3 capability registration', () => {
  test('registers intelligence capabilities without changing Day-1 gated set', () => {
    const r = new CapabilityRegistry();
    registerPlatformCapabilities(r, {});
    registerAcquisitionCapabilities(r, {});
    registerIntelligenceCapabilities(r, {
      browserProvider: { render: async () => ({ status: 'ok', records: [] }) },
      intelligenceEngine: { prepare: async () => ({ status: 'ok' }), isAvailable: () => true },
      outreachExecutor: { execute: async () => ({ status: 'blocked' }), isAvailable: () => true }
    });
    assert.ok(r.has('web.render'));
    assert.ok(r.has('company.research'));
    assert.ok(r.has('contact.discover'));
    assert.ok(r.has('prospect.qualify'));
    assert.ok(r.has('prospect.score'));
    assert.ok(r.has('outreach.plan'));
    assert.ok(r.has('campaign.prepare'));
    assert.ok(r.has('outreach.execute'));
    assert.ok(r.has('contact.resolve'));
    assert.ok(r.has('email.validate'));
    assert.ok(r.has('phone.validate'));
    assert.ok(r.has('contact.score'));
    assert.ok(r.has('prospect.priority'));
    assert.ok(r.has('campaign.control'));
    const gated = r.list().filter((c) => c.requiresApproval).map((c) => c.capabilityId).sort();
    assert.ok(gated.includes('outreach.execute'));
    assert.ok(gated.includes('voice.call'));
    const day1Only = new CapabilityRegistry();
    registerPlatformCapabilities(day1Only, {});
    const day1Gated = day1Only.list().filter((c) => c.requiresApproval).map((c) => c.capabilityId).sort();
    assert.deepEqual(day1Gated, ['payment.checkout', 'site.deploy', 'social.publish', 'voice.call']);
  });

  test('NL campaign objective hints to campaign.prepare, acquisition list still maps to acquisition.run', () => {
    const detector = new IntentDetector({ llm: null, registry: new CapabilityRegistry() });
    const campaign = detector.hintCampaignIntent(
      'Find companies that could buy leads from Qentrax, research them, rank the best prospects, and prepare an outreach campaign. Do not contact anyone.'
    );
    assert.equal(campaign.capabilityId, 'campaign.prepare');
    assert.equal(campaign.parameters.qualificationProfile, 'qentrax-buyer');
    assert.ok(campaign.confidence >= 0.55);

    const acquisition = detector.hintAcquisitionIntent(
      'Find exhibitors from https://www.affiliatesummit.com/west/exhibitors-2026 and build me a prospect list'
    );
    assert.equal(acquisition.capabilityId, 'acquisition.run');
  });

  test('campaign inspection phrases map to campaign.control and cannot start without that capability', () => {
    const detector = new IntentDetector({ llm: null, registry: new CapabilityRegistry() });
    const show = detector.hintCampaignControlIntent('Show me the Qentrax campaign.');
    assert.equal(show.capabilityId, 'campaign.control');
    const dms = detector.hintCampaignControlIntent('Show me the decision makers.');
    assert.equal(dms.capabilityId, 'campaign.control');
    const start = detector.hintCampaignControlIntent('Start outreach');
    assert.equal(start.parameters.action, 'start outreach');
    const prep = detector.hintCampaignControlIntent(
      'Take the top Qentrax prospects, find the best people to contact, score the contacts, and prepare an outreach campaign. Do not contact anyone.'
    );
    assert.equal(prep, null);
  });
});
