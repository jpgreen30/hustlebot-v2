/**
 * Grounded outreach plan generator.
 * PLAN is not SEND. Personalization uses only provenance-backed facts.
 */

function factsFrom(prospect) {
  const facts = [];
  if (prospect.organizationName) facts.push(`Organization: ${prospect.organizationName}`);
  if (prospect.description) facts.push(`Public description: ${prospect.description.slice(0, 220)}`);
  if (prospect.intelligence?.description?.value) {
    facts.push(`Researched description: ${String(prospect.intelligence.description.value).slice(0, 220)}`);
  }
  if (prospect.qualification?.positiveSignals?.length) {
    facts.push(`Fit signals: ${prospect.qualification.positiveSignals.map((s) => s.tag).join(', ')}`);
  }
  if (prospect.sourceEvent) facts.push(`Seen at: ${prospect.sourceEvent}`);
  if (prospect.booth) facts.push(`Booth: ${prospect.booth}`);
  if (prospect.company?.location) facts.push(`Location: ${prospect.company.location}`);
  return facts;
}

export function planOutreach(prospect, options = {}) {
  const objective = options.objective || 'Explore whether they buy performance or consumer leads';
  const facts = factsFrom(prospect);
  const contact = prospect.contact?.fullName
    ? prospect.contact
    : (prospect.contacts || [])[0] || { fullName: null, title: null, email: null };
  const emailAvailable = Boolean(contact.email);
  const phoneAvailable = Boolean(contact.phone || prospect.contact?.phone);
  const channels = [];
  if (emailAvailable) channels.push('email');
  if (phoneAvailable) channels.push('retell');
  if (!channels.length) channels.push('manual-research');

  const opening = facts.length
    ? `I noticed ${prospect.organizationName} ${prospect.sourceEvent ? `at ${prospect.sourceEvent}` : 'in public materials'}${prospect.description ? ` — ${prospect.description.slice(0, 120)}` : ''}.`
    : `I'd like to learn whether ${prospect.organizationName || 'your team'} buys performance leads.`;

  return {
    prospectId: prospect.prospectId,
    organizationName: prospect.organizationName,
    contact: {
      fullName: contact.fullName || null,
      title: contact.title || null,
      email: contact.email || prospect.contact?.email || null,
      phone: contact.phone || prospect.contact?.phone || null
    },
    channelPriority: channels,
    businessReason: prospect.qualification?.reasoningSummary || 'Public materials suggest possible lead-buying or performance marketing activity.',
    personalizationFacts: facts,
    openingAngle: opening,
    valueProposition: 'Qentrax can supply exclusive, compliant consumer leads if they actually buy in a matching vertical.',
    suggestedCallObjective: 'Confirm whether they buy leads and which verticals, then book a follow-up if there is fit.',
    suggestedEmailSubject: prospect.organizationName
      ? `${prospect.organizationName} / lead supply intro`
      : 'Lead supply intro',
    suggestedEmailBody: [
      contact.fullName ? `Hi ${contact.fullName.split(' ')[0]},` : 'Hi,',
      '',
      opening,
      '',
      'If you buy consumer or performance leads, I can share a short overview of exclusive supply and volume. No pitch deck required for a first reply.',
      '',
      'Best,',
      'HustleBot / Qentrax'
    ].join('\n'),
    followUpStrategy: 'If no reply in 4 business days, one follow-up email. Do not call unless approved and a public phone exists.',
    grounded: true,
    inventedFacts: []
  };
}
