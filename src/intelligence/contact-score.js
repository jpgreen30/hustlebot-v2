/**
 * Contactability score (not company qualification) and combined outreach priority.
 */

import { getQualificationProfile } from './profiles.js';

function clamp(n, max) {
  return Math.max(0, Math.min(max, Number(n) || 0));
}

function titleText(contact) {
  return String(contact.title || '').toLowerCase();
}

export function roleMatchesTitle(title, role) {
  const t = String(title || '').toLowerCase();
  const r = String(role || '').toLowerCase().trim();
  if (!t || !r) return false;
  if (t.includes(r)) return true;
  const first = r.split(/\s+/)[0] || '';
  const firstAlts = first.split('/').filter(Boolean);
  const rest = r.split(/[\s\/]+/).slice(1).filter((w) => !['of', 'and', 'the', 'or', '/'].includes(w));
  const firstHit = firstAlts.some((alt) => t.includes(alt));
  const restHit = rest.length === 0 || rest.every((word) => t.includes(word));
  return firstHit && restHit;
}

export function scoreContact(contact, options = {}) {
  const profile = getQualificationProfile(options.profileId || 'qentrax-buyer');
  const title = titleText(contact);
  const roles = profile.targetRoles || profile.decisionMakerTitles || [];
  const roleIndex = roles.findIndex((role) => roleMatchesTitle(title, role));
  const roleRelevance = clamp(roleIndex === -1 ? (title ? 8 : 0) : 30 - Math.min(20, roleIndex * 2), 30);

  const seniority = clamp(
    /ceo|founder|owner|chief/i.test(title) ? 15
      : /vp|vice president|head of|cmo|cro|cto/i.test(title) ? 13
        : /director|partner/i.test(title) ? 10
          : /manager/i.test(title) ? 7
            : title ? 4 : 0,
    15
  );

  const identityConfidence = clamp(
    (contact.providerPersonId ? 8 : 0)
    + (contact.linkedinUrl || /linkedin\.com/i.test(contact.publicProfileUrl || '') ? 6 : 0)
    + (contact.fullName && contact.organization ? 4 : 0)
    + Math.round((contact.confidence || 0) * 4)
    + ((contact.mergeReasons || []).length ? 2 : 0),
    20
  );

  const emailStatus = contact.emailStatus || contact.verificationStatus || 'UNKNOWN';
  const emailQuality = clamp(
    emailStatus === 'VALIDATED' ? 15
      : emailStatus === 'DISCOVERED' ? 11
        : emailStatus === 'FORMAT_VALID' ? 8
          : emailStatus === 'RISKY' ? 4
            : emailStatus === 'INFERRED' ? 2
              : 0,
    15
  );

  const phoneStatus = contact.phoneStatus || 'UNKNOWN';
  const phoneQuality = clamp(
    phoneStatus === 'VALIDATED' ? 15
      : phoneStatus === 'DISCOVERED' ? 10
        : phoneStatus === 'FORMAT_VALID' ? 7
          : 0,
    15
  );

  const sourceConfidence = clamp(
    contact.provider === 'apollo' ? 5
      : contact.provider === 'public-web' ? 3
        : contact.source ? 2 : 1,
    5
  );

  const total = clamp(
    roleRelevance + seniority + identityConfidence + emailQuality + phoneQuality + sourceConfidence,
    100
  );

  return {
    total,
    version: 'contact-quality.v1',
    components: {
      roleRelevance: { value: roleRelevance, max: 30 },
      seniority: { value: seniority, max: 15 },
      identityConfidence: { value: identityConfidence, max: 20 },
      emailQuality: { value: emailQuality, max: 15 },
      phoneQuality: { value: phoneQuality, max: 15 },
      sourceConfidence: { value: sourceConfidence, max: 5 }
    },
    explanation: [
      `Contact quality: ${total}`,
      `Role: ${roleRelevance}/30`,
      `Seniority: ${seniority}/15`,
      `Identity: ${identityConfidence}/20`,
      `Email: ${emailQuality}/15`,
      `Phone: ${phoneQuality}/15`,
      `Source: ${sourceConfidence}/5`
    ].join('\n')
  };
}

export function objectiveRelevance(prospect, contact, options = {}) {
  const company = prospect.qualification?.score || prospect.score?.total || 0;
  const contactTotal = contact.contactQuality?.total ?? scoreContact(contact, options).total;
  const qTags = prospect.qualification?.positiveSignals || [];
  const objectiveBoost = qTags.some((s) => ['lead-buyer', 'performance-marketing', 'affiliate-network'].includes(s.tag))
    ? 12 : 0;
  return clamp(Math.round(company * 0.4 + contactTotal * 0.4 + objectiveBoost + 20), 100);
}

export function combinedPriority(prospect, contact, options = {}) {
  const profile = getQualificationProfile(options.profileId || 'qentrax-buyer');
  const companyFit = Number(prospect.qualification?.score ?? prospect.score?.total ?? 0);
  const contactQuality = contact.contactQuality?.total ?? scoreContact(contact, options).total;
  const relevance = objectiveRelevance(prospect, contact, options);
  const weights = options.weights || profile.priorityWeights || { company: 0.45, contact: 0.35, objective: 0.2 };
  const total = clamp(Math.round(
    companyFit * weights.company + contactQuality * weights.contact + relevance * weights.objective
  ), 100);
  return {
    total,
    version: 'outreach-priority.v1',
    formula: `${weights.company}*company + ${weights.contact}*contact + ${weights.objective}*objective`,
    components: {
      companyFit,
      contactQuality,
      objectiveRelevance: relevance
    }
  };
}

export function attachContactScores(prospect, options = {}) {
  const contacts = (prospect.contacts || []).map((contact) => {
    const contactQuality = scoreContact(contact, options);
    const priority = combinedPriority(prospect, { ...contact, contactQuality }, options);
    return { ...contact, contactQuality, priority };
  }).sort((a, b) => (b.priority?.total || 0) - (a.priority?.total || 0));

  const best = contacts[0] || null;
  return {
    ...prospect,
    contacts,
    contact: best ? {
      ...(prospect.contact || {}),
      fullName: best.fullName,
      title: best.title,
      email: best.email,
      phone: best.phone,
      linkedinUrl: best.linkedinUrl
    } : prospect.contact,
    contactQuality: best?.contactQuality || null,
    priority: best?.priority || null
  };
}
