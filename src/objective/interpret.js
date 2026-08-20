import { createObjective } from './schema.js';
import { OUTBOUND_CAPABILITIES } from './catalogue.js';
import { extractUrl } from './util.js';
import { extractQuantities, extractSlices, isTrivialLookup } from './quantities.js';

const ASW_URL = 'https://www.affiliatesummit.com/west/exhibitors-2026';

export function interpretObjective(raw, extra = {}) {
  const text = String(raw || extra.rawRequest || extra.objective || '').trim();
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

  const { findN, topN } = extractQuantities(text, extra);
  const slices = extractSlices(text);
  const trivial = isTrivialLookup(text);

  if (!trivial) {
    successCriteria.push({ type: 'minOrganizations', value: Math.min(findN, 3) });
    successCriteria.push({ type: 'rankedTop', value: topN });
  } else {
    successCriteria.push({ type: 'lookup', value: 'utc-time' });
  }
  if (doNotContact) successCriteria.push({ type: 'noOutbound', value: true });
  if (/\bcompar/i.test(text) || /opportunit/i.test(text)) successCriteria.push({ type: 'comparison', value: true });

  const sourceUrl = extra.sourceUrl || extra.url || extractUrl(text)
    || (/affiliate summit/i.test(text) ? ASW_URL : null);

  let pattern = 'research_rank_search';
  if (trivial) {
    pattern = 'direct_capability';
  } else if (/(authorized|self-test|test email|test call)/i.test(text) && !doNotContact) {
    pattern = 'authorized_test';
  } else if (sourceUrl || /exhibitor|affiliate summit|directory/i.test(text)) {
    pattern = 'research_rank_directory';
  }

  const profileId = extra.qualificationProfile
    || extra.profileId
    || (/qentrax|lead buyer|affiliate/i.test(text) ? 'qentrax-buyer' : 'qentrax-buyer');

  const locationMatch = text.match(/\b(los angeles|la-area|southern california|van nuys|california)\b/i);
  const industryMatch = slices[0] || (text.match(/\b(roofing|roofer|solar|hvac|insurance|home service|logistics|freight|shipping|3pl|trucking|warehous\w*)\b/i)?.[0] || null);

  const query = extra.query
    || (industryMatch
      ? `${locationMatch?.[0] || ''} ${industryMatch} companies`.replace(/\s+/g, ' ').trim()
      : text
        .replace(/^(research|find|discover|rank|compare)\s+\d*\s*/i, '')
        .replace(/\bdo not contact anyone\.?/i, '')
        .replace(/\b(use public evidence|compare their [^.]*)/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180));

  const interpretedGoal = trivial
    ? 'Lookup a live capability result. Do not spawn specialists.'
    : (doNotContact
      ? `Discover, research, qualify, and rank prospects. Do not contact anyone.`
      : text);

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
      industry: industryMatch || extra.industry || null,
      slices,
      megaCapabilityForbidden: extra.megaCapabilityForbidden !== false,
      testEmail: extra.context?.testEmail || extra.testEmail || process.env.OUTREACH_TEST_EMAIL || process.env.EMAIL_TEST_DESTINATION || null
    }
  });

  return objective;
}

export { extractQuantities, extractSlices, isTrivialLookup };
