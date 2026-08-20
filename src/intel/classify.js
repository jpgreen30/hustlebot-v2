/**
 * Entity-type / listicle / directory classification.
 * A keyword match is not enough to occupy a candidate slot.
 */

const CLINICAL_HOST = /(clevelandclinic|cdc\.gov|mayoclinic|nih\.gov|medlineplus|webmd|healthline|kidshealth|apa\.org|who\.int|nhs\.uk)/i;
const APK_HOST = /(apkpure|apkcombo|apkmirror|aptoide|apkdownload)/i;
const DIRECTORY_HOST = /(g2\.com|capterra|getapp|softwareadvice|trustradius|yellowpages|superpages|yelp\.com|angi\.com|bbb\.org|crunchbase|producthunt)/i;
const GENERIC_AI_HOST = /(chatgpt\.com|openai\.com|claude\.ai|anthropic\.com|gemini\.google)/i;
const ENCYCLOPEDIA_HOST = /(wikipedia\.org|britannica\.com|wikihow\.com)/i;

export const RESULT_ROLE = {
  CANDIDATE: 'CANDIDATE',
  SOURCE: 'SOURCE',
  REJECT: 'REJECT'
};

export const PAGE_KIND = {
  COMPANY: 'COMPANY',
  PRODUCT: 'PRODUCT',
  APP: 'APP',
  DIRECTORY: 'DIRECTORY',
  LISTICLE: 'LISTICLE',
  ARTICLE: 'ARTICLE',
  PUBLICATION: 'PUBLICATION',
  ASSOCIATION: 'ASSOCIATION',
  EVENT: 'EVENT',
  PERSON: 'PERSON',
  MIRROR: 'MIRROR',
  CLINICAL: 'CLINICAL',
  UNKNOWN: 'UNKNOWN'
};

export function inferRequestedType(question = '') {
  const q = String(question || '').toLowerCase();
  if (/\bexhibitors?\b/.test(q)) return 'ORGANIZATION';
  if (/\b(app|apps|platform|product|saas|software|tracker|receptionist)\b/.test(q)
    && !/\b(roofing|contractor|companies in)\b/.test(q)) {
    return 'PRODUCT';
  }
  if (/\b(companies|contractors|roofing|hvac|practices)\b/.test(q)) return 'ORGANIZATION';
  return 'ORGANIZATION';
}

export function inferPlaybookClass(question = '') {
  const q = String(question || '').toLowerCase();
  if (/\bexhibitors?\b|\bsummit\b|\bconference\b/.test(q)) return 'event-exhibitors';
  if (/\b(app|apps|platform|parenting|pregnancy|saas|software|receptionist)\b/.test(q)
    && !/\broofing|contractor\b/.test(q)) return 'product-landscape';
  if (/\b(roofing|hvac|solar|contractor|local)\b/.test(q)) return 'local-business';
  if (/\b(regulation|compliance|fog|grease|epa|permit)\b/.test(q)) return 'regulated-information';
  if (/\b(software|technology|b2b|vendor)\b/.test(q)) return 'b2b-software';
  return 'general-research';
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}
function pathOf(url) {
  try { return new URL(url).pathname.toLowerCase(); } catch { return ''; }
}

export function isListicle(item = {}) {
  const title = String(item.title || item.organizationName || item.name || '');
  const url = item.url || item.website || '';
  const path = pathOf(url);
  const hay = `${title} ${item.snippet || item.description || ''}`.toLowerCase();
  if (/\/(blog|guides?|articles?|roundup|reviews)\//i.test(path)) return true;
  if (/^(best|top)\s+\d*\s*/i.test(title) && /\b(apps?|software|tools|companies|providers|solutions)\b/i.test(title)) return true;
  if (/\b(compared|vs\.?|versus|roundup|ultimate guide)\b/i.test(title)) return true;
  if (/\btop\s+\d+\b/i.test(hay) && /\b(best|tools|apps|software)\b/i.test(hay)) return true;
  return false;
}

export function isDirectoryPage(item = {}) {
  const url = item.url || item.website || '';
  const host = hostOf(url);
  const title = String(item.title || item.organizationName || item.name || '');
  if (DIRECTORY_HOST.test(host)) return true;
  if (/\b(directory|catalog of|list of (apps|software|companies))\b/i.test(title)) return true;
  return false;
}

export function isApkMirror(item = {}) {
  const url = item.url || item.website || '';
  const title = String(item.title || item.organizationName || item.name || '');
  if (APK_HOST.test(hostOf(url))) return true;
  if (/\b(apk|download .* for android)\b/i.test(title)) return true;
  return false;
}

export function isClinicalOrg(item = {}) {
  return CLINICAL_HOST.test(hostOf(item.url || item.website || ''));
}

export function classifySearchResult(item = {}, question = '') {
  const requested = inferRequestedType(question);
  const playbook = inferPlaybookClass(question);
  const title = String(item.title || item.organizationName || item.name || '');
  const url = item.url || item.website || '';
  const host = hostOf(url);
  const reasons = [];

  if (!title && !url) {
    return { role: RESULT_ROLE.REJECT, pageKind: PAGE_KIND.UNKNOWN, requested, reasons: ['empty'] };
  }
  if (GENERIC_AI_HOST.test(host) && !/\b(chatgpt|openai|claude|gemini)\b/i.test(question)) {
    return { role: RESULT_ROLE.REJECT, pageKind: PAGE_KIND.ARTICLE, requested, reasons: ['generic-ai-host'] };
  }
  if (ENCYCLOPEDIA_HOST.test(host)) {
    return { role: RESULT_ROLE.REJECT, pageKind: PAGE_KIND.ARTICLE, requested, reasons: ['encyclopedia'] };
  }
  if (isApkMirror(item)) {
    return { role: RESULT_ROLE.REJECT, pageKind: PAGE_KIND.MIRROR, requested, reasons: ['apk-mirror'] };
  }
  if (isClinicalOrg(item) && playbook === 'product-landscape') {
    return { role: RESULT_ROLE.SOURCE, pageKind: PAGE_KIND.CLINICAL, requested, reasons: ['clinical-not-product'] };
  }
  if (isDirectoryPage(item)) {
    return { role: RESULT_ROLE.SOURCE, pageKind: PAGE_KIND.DIRECTORY, requested, reasons: ['directory-is-source'] };
  }
  if (isListicle(item)) {
    return { role: RESULT_ROLE.SOURCE, pageKind: PAGE_KIND.LISTICLE, requested, reasons: ['listicle-is-source-not-vendor'] };
  }
  if (/\b(association|society|institute of|chamber of)\b/i.test(title)) {
    return { role: RESULT_ROLE.SOURCE, pageKind: PAGE_KIND.ASSOCIATION, requested, reasons: ['association'] };
  }
  if (playbook === 'product-landscape' && CLINICAL_HOST.test(host)) {
    return { role: RESULT_ROLE.SOURCE, pageKind: PAGE_KIND.CLINICAL, requested, reasons: ['clinical-host'] };
  }

  let pageKind = PAGE_KIND.COMPANY;
  if (/\b(app|apps|tracker|platform|saas|software)\b/i.test(`${title} ${host}`) || /apps\.apple\.com|play\.google\.com/i.test(url)) {
    pageKind = PAGE_KIND.PRODUCT;
  }
  if (requested === 'PRODUCT' && pageKind === PAGE_KIND.COMPANY && /apps\.apple|play\.google|producthunt/i.test(url)) {
    pageKind = PAGE_KIND.APP;
  }

  if (requested === 'PRODUCT' && pageKind === PAGE_KIND.COMPANY && isClinicalOrg(item)) {
    return { role: RESULT_ROLE.SOURCE, pageKind: PAGE_KIND.CLINICAL, requested, reasons: ['wrong-entity-type'] };
  }

  reasons.push('candidate');
  return {
    role: RESULT_ROLE.CANDIDATE,
    pageKind,
    requested,
    playbook,
    reasons
  };
}

export function diversity(accepted = []) {
  const domains = accepted.map((a) => (a.domain || hostOf(a.website || a.url || '')).replace(/^www\./, '')).filter(Boolean);
  const counts = {};
  for (const d of domains) counts[d] = (counts[d] || 0) + 1;
  const max = Math.max(0, ...Object.values(counts));
  const concentration = domains.length ? max / domains.length : 0;
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [null, 0];
  return { uniqueDomains: new Set(domains).size, concentration, dominantDomain: dominant[0], dominantCount: dominant[1] };
}
