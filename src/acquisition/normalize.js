/**
 * Deterministic field normalization.
 * Does not invent missing values.
 */

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'mc_cid', 'mc_eid', 'ref'
]);

export function normalizeWhitespace(value) {
  if (value == null) return null;
  const out = String(value).replace(/\s+/g, ' ').trim();
  return out || null;
}

export function normalizeUrl(raw) {
  const text = normalizeWhitespace(raw);
  if (!text) return null;
  const withScheme = /^[a-z]+:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
    }
    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/, '');
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeDomain(raw) {
  const url = normalizeUrl(raw) || (raw && raw.includes('.') ? normalizeUrl(`https://${raw}`) : null);
  if (!url) {
    const text = normalizeWhitespace(raw);
    if (!text) return null;
    return text.replace(/^www\./i, '').toLowerCase();
  }
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

export function normalizeOrganizationName(raw) {
  let name = normalizeWhitespace(raw);
  if (!name) return null;
  name = name.replace(/<[^>]+>/g, ' ');
  name = name.replace(/^#+\s*/, '');
  name = name.replace(/[®™©]/g, '').replace(/\s+/g, ' ').trim();
  name = name.replace(/[.,;:]+$/g, '').trim();
  if (/[<>{}=]|livebuzz|buzzmodule|moduleid/i.test(name)) return null;
  if (/^(home|exhibitors?|sponsors?|about|contact|privacy|login|register)$/i.test(name)) return null;
  if (name.length < 2 || name.length > 120) return null;
  return name;
}

export function normalizeEmail(raw) {
  const text = normalizeWhitespace(raw);
  if (!text) return null;
  const email = text.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (/example\.com$|email\.com$|domain\.com$|test\.com$|sentry\.io$|wixpress\.com$/.test(email)) return null;
  return email;
}

export function normalizePhone(raw) {
  const text = normalizeWhitespace(raw);
  if (!text) return null;
  const digits = text.replace(/[^\d+]/g, '');
  const justDigits = digits.replace(/\D/g, '');
  if (justDigits.length < 10 || justDigits.length > 15) return null;
  if (/^(\d)\1+$/.test(justDigits)) return null;
  if (digits.startsWith('+')) return `+${justDigits}`;
  if (justDigits.length === 11 && justDigits.startsWith('1')) return `+${justDigits}`;
  if (justDigits.length === 10) return `+1${justDigits}`;
  return `+${justDigits}`;
}

export function normalizeSocialUrl(raw) {
  const url = normalizeUrl(raw);
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (!/(linkedin|twitter|x\.com|facebook|instagram|youtube|github)\./i.test(host)) return null;
    return url;
  } catch {
    return null;
  }
}

export function normalizeProspect(raw) {
  const website = normalizeUrl(raw.website || raw.domain);
  const domain = normalizeDomain(raw.domain || raw.website || website);
  const contact = raw.contact || {};
  const company = raw.company || {};
  const socials = (company.socialUrls || [])
    .map(normalizeSocialUrl)
    .filter(Boolean);

  const linkedin = normalizeSocialUrl(contact.linkedinUrl);
  const firstName = normalizeWhitespace(contact.firstName);
  const lastName = normalizeWhitespace(contact.lastName);
  const fullName = normalizeWhitespace(contact.fullName)
    || [firstName, lastName].filter(Boolean).join(' ')
    || null;

  return {
    ...raw,
    organizationName: normalizeOrganizationName(raw.organizationName),
    domain,
    website,
    description: normalizeWhitespace(raw.description),
    category: normalizeWhitespace(raw.category),
    sourceUrl: normalizeUrl(raw.sourceUrl) || raw.sourceUrl || null,
    sourceType: raw.sourceType || null,
    sourceEvent: normalizeWhitespace(raw.sourceEvent),
    sourceDate: raw.sourceDate || null,
    contact: {
      firstName,
      lastName,
      fullName,
      title: normalizeWhitespace(contact.title),
      email: normalizeEmail(contact.email),
      phone: normalizePhone(contact.phone),
      linkedinUrl: linkedin
    },
    company: {
      industry: normalizeWhitespace(company.industry),
      location: normalizeWhitespace(company.location),
      employeeRange: normalizeWhitespace(company.employeeRange),
      socialUrls: [...new Set(socials)]
    }
  };
}
