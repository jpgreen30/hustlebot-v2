/**
 * Explainable 0–100 scoring with stored components.
 */

function clamp(n, max) {
  return Math.max(0, Math.min(max, n));
}

export function scoreProspect(prospect) {
  const q = prospect.qualification || {};
  const positives = q.positiveSignals || [];
  const negatives = q.negativeSignals || [];

  const businessFit = clamp(
    positives.filter((s) => ['lead-buyer', 'performance-marketing', 'affiliate-network', 'lead-generation', 'advertiser', 'acquisition', 'affiliate-event'].includes(s.tag))
      .reduce((sum, s) => sum + s.weight, 0),
    25
  );
  const verticalFit = clamp(
    positives.filter((s) => ['solar-home', 'insurance-finance', 'call-center'].includes(s.tag))
      .reduce((sum, s) => sum + Math.round(s.weight * 1.1), 0),
    20
  );
  const hasPerson = Boolean(prospect.contact?.fullName || (prospect.contacts || []).length);
  const senior = (prospect.contacts || []).some((c) =>
    /ceo|founder|cmo|cro|vp |head of/i.test(c.title || '')
  );
  const decisionMaker = clamp((hasPerson ? 10 : 0) + (senior ? 7 : 0) + (positives.some((s) => s.tag === 'decision-maker-found') ? 3 : 0), 20);
  const email = prospect.validation?.email?.status || (prospect.contact?.email ? 'DISCOVERED' : 'UNKNOWN');
  const phone = prospect.validation?.phone?.status || (prospect.contact?.phone ? 'DISCOVERED' : 'UNKNOWN');
  const contactability = clamp(
    (email === 'VALIDATED' ? 12 : email === 'DISCOVERED' ? 8 : email === 'RISKY' ? 4 : 0)
    + (phone === 'VALIDATED' ? 8 : phone === 'DISCOVERED' ? 5 : 0)
    + (prospect.website ? 3 : 0),
    20
  );
  const completeness = [
    prospect.organizationName,
    prospect.website || prospect.domain,
    prospect.description || prospect.intelligence?.description?.value || prospect.intelligence?.description,
    prospect.company?.location || prospect.intelligence?.location?.value || prospect.intelligence?.location
  ].filter(Boolean).length;
  const dataConfidence = clamp(
    completeness * 3
    + (prospect.provenance?.sourceUrls?.length ? 2 : 0)
    + Math.round((q.confidence || 0) * 4)
    - negatives.length * 2,
    15
  );

  const total = clamp(businessFit + verticalFit + decisionMaker + contactability + dataConfidence, 100);
  const explanation = [
    `Score: ${total}`,
    `Business fit: ${businessFit}/25`,
    `Vertical fit: ${verticalFit}/20`,
    `Decision maker: ${decisionMaker}/20`,
    `Contactability: ${contactability}/20`,
    `Data confidence: ${dataConfidence}/15`
  ].join('\n');

  return {
    ...prospect,
    score: {
      total,
      components: {
        businessFit: { value: businessFit, max: 25 },
        verticalFit: { value: verticalFit, max: 20 },
        decisionMaker: { value: decisionMaker, max: 20 },
        contactability: { value: contactability, max: 20 },
        dataConfidence: { value: dataConfidence, max: 15 }
      },
      explanation
    },
    qualification: {
      ...q,
      score: total
    }
  };
}

export function rankProspects(prospects, topN = 20) {
  return [...prospects]
    .map(scoreProspect)
    .sort((a, b) => (b.score?.total || 0) - (a.score?.total || 0))
    .map((p, index) => ({ ...p, rank: index + 1 }))
    .slice(0, topN);
}
