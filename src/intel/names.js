/**
 * Canonical display names from evidence, not LLM guesses.
 */

function compactAlnum(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function sldOf(domain = '') {
  const host = String(domain || '').replace(/^www\./, '').toLowerCase();
  const parts = host.split('.').filter(Boolean);
  if (parts.length < 2) return parts[0] || '';
  const cc = new Set(['uk', 'au', 'ca', 'us', 'nz', 'za', 'ie', 'in']);
  if (parts.length >= 3 && cc.has(parts[parts.length - 1]) && ['co', 'com', 'org', 'net', 'ac'].includes(parts[parts.length - 2])) {
    return parts[parts.length - 3];
  }
  return parts[parts.length - 2];
}

function cleanTitle(title = '') {
  return String(title || '')
    .replace(/\bapp\s+app\b/ig, 'App')
    .replace(/\s*[|\-–—:]\s*(app store|google play|official (site|website)|home)\s*$/i, '')
    .replace(/\s*[|\-–—:].*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function preferredDisplayName(input = {}) {
  const domain = String(input.domain || '').replace(/^www\./, '');
  const sld = sldOf(domain || input.website);
  const current = input.name || input.organizationName || '';
  const candidates = [
    input.jsonLdName,
    input.ogSiteName,
    input.ogTitle && cleanTitle(input.ogTitle),
    cleanTitle(input.title || ''),
    input.officialName,
    input.directoryName,
    input.highConfidenceAlias
  ].filter(Boolean);
  for (const candidate of candidates) {
    const cc = compactAlnum(candidate);
    const cs = compactAlnum(sld);
    if (!cc || cc.length < 4) continue;
    if (cs && (cc === cs || cs.startsWith(cc) || cc.startsWith(cs))) {
      if (/\s/.test(candidate) || candidate.length <= current.length + 8) return candidate.trim();
    }
  }
  if (current && sld && compactAlnum(current) === compactAlnum(sld) && !/\s/.test(current)) {
    const titled = cleanTitle(input.title || '');
    if (titled && compactAlnum(titled).startsWith(compactAlnum(sld))) return titled;
  }
  return current || sld || null;
}

export function registrableParts(domain = '') {
  const host = String(domain || '').replace(/^www\./, '').toLowerCase();
  const parts = host.split('.').filter(Boolean);
  if (parts.length < 2) return { sld: host, tld: '', host };
  const cc = new Set(['uk', 'au', 'ca', 'us', 'nz', 'za', 'ie', 'in']);
  if (parts.length >= 3 && cc.has(parts[parts.length - 1]) && ['co', 'com', 'org', 'net', 'ac'].includes(parts[parts.length - 2])) {
    return { sld: parts[parts.length - 3], tld: parts.slice(-2).join('.'), host };
  }
  return { sld: parts[parts.length - 2], tld: parts[parts.length - 1], host };
}

export function normalizeProductAlias(name = '') {
  return String(name || '')
    .toLowerCase()
    .replace(/\b(app|application|official)\b/g, ' ')
    .replace(/\+/g, 'plus')
    .replace(/[^a-z0-9]+/g, '')
    .replace(/plus$/, '');
}
