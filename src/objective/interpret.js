import { createObjective } from './schema.js';
import { OUTBOUND_CAPABILITIES } from './catalogue.js';
import { extractUrl } from './util.js';

const ASW_URL = 'https://www.affiliatesummit.com/west/exhibitors-2026';

export function interpretObjective(raw, extra = {}) {
  const text = String(raw || extra.rawRequest || extra.objective || '').trim();
  const lower = text.toLowerCase();
  const constraints = [];
  const exclusions = [];
  const prohibited = new Set(extra.prohibitedCapabilities || []);
  const successCriteria = [];

  const doNotContact = /(do not contact|don't contact|do not call|don't call|no outreach|nobody is contacted|without contacting)/i.test(text);
  if (doNotContact) {
    constraints.push('do-not-contact');
    for (const id of OUTBOUND_CAPABILITIES) prohibited.add(id);
    exclusions.push('outbound-communication');
  }

  if (/(don't|do not) (buy|purchase|spend|advertise)/i.test(text)) {
    constraints.push('no-spend');
    prohibited.add('payment.checkout');
  }

  const countMatch = text.match(/\b(\d+)\s+(companies|company|exhibitors|prospects|businesses|roofers?)\b/i)
    || text.match(/\b(?:find|get|take)\s+(\d+)\b/i);
  const topMatch = text.match(/\btop\s+(\d+)\b/i);
  const findN = Number(extra.maxOrganizations || countMatch?.[1] || 10);
  const topN = Number(extra.topN || topMatch?.[1] || Math.min(findN, 5));

  successCriteria.push({ type: 'minOrganizations', value: Math.min(findN, 3) });
  successCriteria.push({ type: 'rankedTop', value: topN });
  if (doNotContact) successCriteria.push({ type: 'noOutbound', value: true });

  const sourceUrl = extra.sourceUrl || extra.url || extractUrl(text)
    || (/affiliate summit/i.test(text) ? ASW_URL : null);

  let pattern = 'research_rank_search';
  if (/(authorized|self-test|test email|test call)/i.test(text) && !doNotContact) {
    pattern = 'authorized_test';
  } else if (sourceUrl || /exhibitor|affiliate summit|directory/i.test(text)) {
    pattern = 'research_rank_directory';
  }

  const profileId = extra.qualificationProfile
    || extra.profileId
    || (/qentrax|lead buyer|affiliate/i.test(text) ? 'qentrax-buyer' : 'qentrax-buyer');

  const locationMatch = text.match(/\b(los angeles|la-area|southern california|van nuys|california)\b/i);
  const industryMatch = text.match(/\b(roofing|roofer|solar|hvac|insurance|home service)\b/i);

  const query = extra.query
    || (industryMatch
      ? `${locationMatch?.[0] || ''} ${industryMatch[0]} companies`.replace(/\s+/g, ' ').trim()
      : null);

  const interpretedGoal = doNotContact
    ? `Discover, research, qualify, and rank prospects. Do not contact anyone.`
    : text;

  const objective = createObjective({
    ...extra,
    rawRequest: text,
    interpretedGoal,
    successCriteria,
    constraints,
    exclusions,
    prohibitedCapabilities: [...prohibited],
    maxActions: extra.maxActions || 24,
    context: {
      ...(extra.context || {}),
      sourceUrl,
      query,
      findN,
      topN,
      profileId,
      pattern,
      location: locationMatch?.[0] || extra.location || null,
      industry: industryMatch?.[0] || extra.industry || null,
      megaCapabilityForbidden: extra.megaCapabilityForbidden !== false,
      testEmail: extra.context?.testEmail || extra.testEmail || process.env.OUTREACH_TEST_EMAIL || process.env.EMAIL_TEST_DESTINATION || null
    }
  });

  return objective;
}
