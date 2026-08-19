/**
 * Qualification profiles are workflow configuration, not core engine logic.
 * Qentrax is one profile used for Day-3/Day-4 acceptance.
 */

export const QUALIFICATION_PROFILES = {
  'qentrax-buyer': {
    id: 'qentrax-buyer',
    name: 'Qentrax lead buyer',
    objective:
      'Companies that could plausibly buy consumer/performance leads, especially home-services, solar, insurance, finance, or affiliate/advertiser buyers.',
    positive: [
      { tag: 'lead-buyer', weight: 18, patterns: [/lead buyer/i, /buys? (consumer )?leads/i, /pay[- ]per[- ]lead/i, /exclusive leads/i] },
      { tag: 'performance-marketing', weight: 14, patterns: [/performance marketing/i, /affiliate/i, /cpa\b/i, /cpl\b/i, /media buy/i] },
      { tag: 'affiliate-network', weight: 12, patterns: [/affiliate network/i, /partner network/i, /affiliate platform/i] },
      { tag: 'lead-generation', weight: 12, patterns: [/lead generation/i, /lead gen/i, /inbound leads/i] },
      { tag: 'call-center', weight: 8, patterns: [/call center/i, /contact center/i, /pay per call/i] },
      { tag: 'solar-home', weight: 16, patterns: [/\bsolar\b/i, /home service/i, /roofing/i, /hvac\b/i, /home improvement/i] },
      { tag: 'insurance-finance', weight: 10, patterns: [/insurance/i, /consumer finance/i, /lending/i, /mortgage/i] },
      { tag: 'advertiser', weight: 8, patterns: [/\badvertiser\b/i, /brand advertiser/i, /direct advertiser/i] },
      { tag: 'acquisition', weight: 8, patterns: [/customer acquisition/i, /user acquisition/i, /growth marketing/i] },
      { tag: 'affiliate-event', weight: 6, patterns: [/affiliate summit/i, /affiliate-summit/i] }
    ],
    negative: [
      { tag: 'publisher-only', weight: 10, patterns: [/content publisher/i, /blog network/i, /media publisher only/i] },
      { tag: 'unrelated-saas', weight: 8, patterns: [/hr software/i, /payroll/i, /accounting software/i, /developer tools/i] },
      { tag: 'inactive', weight: 12, patterns: [/ceased operations/i, /out of business/i, /shut down/i] }
    ],
    decisionMakerTitles: [
      'ceo', 'founder', 'co-founder', 'cmo', 'cro', 'vp marketing', 'vp growth',
      'head of acquisition', 'affiliate manager', 'partnerships', 'business development',
      'media buyer', 'lead buyer', 'head of partnerships'
    ],
    targetRoles: [
      'Head of Lead Generation',
      'VP of Lead Generation',
      'VP of Growth',
      'Head of Growth',
      'VP of Acquisition',
      'Head of Acquisition',
      'Affiliate Manager',
      'Head of Affiliates',
      'Partnerships',
      'Business Development',
      'Media Buyer',
      'Performance Marketing',
      'CMO',
      'Founder',
      'CEO'
    ],
    priorityWeights: { company: 0.45, contact: 0.35, objective: 0.2 }
  }
};

export function getQualificationProfile(id = 'qentrax-buyer') {
  return QUALIFICATION_PROFILES[id] || QUALIFICATION_PROFILES['qentrax-buyer'];
}

export function profileTargetRoles(id = 'qentrax-buyer') {
  const profile = getQualificationProfile(id);
  return [...(profile.targetRoles || profile.decisionMakerTitles || [])];
}
