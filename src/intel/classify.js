/**
 * Entity-type / listicle / directory classification.
 * A keyword match is not enough to occupy a candidate slot.
 */

const CLINICAL_HOST = /(clevelandclinic|cdc\.gov|mayoclinic|nih\.gov|medlineplus|webmd|healthline|kidshealth|apa\.org|who\.int|nhs\.uk)/i;
const APK_HOST = /(apkpure|apkcombo|apkmirror|aptoide|apkdownload)/i;
const DIRECTORY_HOST = /(g2\.com|capterra|getapp|softwareadvice|trustradius|yellowpages|superpages|yelp\.com|angi\.com|bbb\.org|crunchbase|producthunt|thumbtack\.com|homeguide\.com|expertise\.com)/i;
const GENERIC_AI_HOST = /(chatgpt\.com|openai\.com|claude\.ai|anthropic\.com|gemini\.google)/i;
const ENCYCLOPEDIA_HOST = /(wikipedia\.org|britannica\.com|wikihow\.com)/i;
const ENTERTAINMENT_HOST = /(tvinsider\.com|imdb\.com|rottentomatoes\.com|cbs\.com|nbc\.com|abc\.com|hulu\.com|netflix\.com|tracker\.gg|steampowered\.com|epicgames\.com|xbox\.com|fortnite\.gg|fandom\.com)/i;
const MEGA_RETAIL_HOST = /(amazon\.com|amazon\.[a-z.]+|walmart\.com|homedepot\.com|lowes\.com|ebay\.com|target\.com|aliexpress\.com)/i;
const PUBLICATION_HOST = /(psychologytoday\.com|forbes\.com|techcrunch\.com|theverge\.com|wired\.com|cnn\.com|latimes\.com|nytimes\.com|bbc\.com|variety\.com|people\.com)/i;
const PACKAGE_TRACK_HOST = /(17track\.net|aftership\.com|parcelsapp\.com)/i;

const GENERIC_NOUN = new Set([
  'software', 'platform', 'platforms', 'app', 'apps', 'saas', 'companies', 'company',
  'providers', 'solutions', 'technology', 'tracker', 'trackers', 'product', 'products',
  'tool', 'tools', 'system', 'systems', 'service', 'services', 'market', 'industry',
  'official', 'website', 'research', 'landscape', 'competitive', 'relevant', 'identify',
  'used', 'commercial', 'united', 'states', 'california', 'angeles', 'public',
  'evidence', 'anyone', 'contact', 'adjacent', 'information', 'sources', 'ecosystem',
  'terminology', 'discovered', 'explain', 'define', 'compare', 'rank', 'find',
  'discover', 'providers', 'provider'
]);

const TOKEN_ALIASES = {
  roofing: ['roofer', 'roofers'],
  pregnancy: ['pregnant', 'prenatal', 'maternity', 'postpartum', 'mother', 'mothers'],
  parenting: ['parent', 'parents', 'mother', 'mothers'],
  receptionist: ['answering']
};

const CATEGORY_KEEP = new Set([
  'dental', 'roofing', 'receptionist', 'pregnancy', 'parenting', 'fog', 'grease',
  'affiliate', 'exhibitor', 'exhibitors', 'summit', 'hvac', 'solar'
]);

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
  if (/\b(roofing|hvac|solar|contractor)\b/.test(q)
    && !/\b(receptionist (software|solutions|apps?|providers)|saas)\b/.test(q)) {
    return 'local-business';
  }
  if (/\b(app|apps|parenting|pregnancy|receptionist)\b/.test(q)
    && !/\broofing|contractor\b/.test(q)) {
    return 'product-landscape';
  }
  if (/\b(software|saas|technology|b2b|vendor)\b/.test(q)
    && /\b(used by|landscape|commercial|service companies|providers|b2b)\b/.test(q)) {
    return 'b2b-software';
  }
  if (/\b(regulation|compliance|fog|grease|epa|permit)\b/.test(q)) return 'regulated-information';
  if (/\b(software|technology|b2b|vendor|saas)\b/.test(q)) return 'b2b-software';
  if (/\b(platform|product)\b/.test(q) && !/\broofing|contractor\b/.test(q)) return 'product-landscape';
  return 'general-research';
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}
function pathOf(url) {
  try { return new URL(url).pathname.toLowerCase(); } catch { return ''; }
}

export function distinctiveTokens(question = '') {
  const raw = String(question || '');
  const playbook = inferPlaybookClass(raw);
  const skip = new Set();
  if (playbook === 'local-business') {
    skip.add('receptionist');
    skip.add('answering');
  }
  const out = [];
  for (const m of raw.matchAll(/\b[a-z]{3,}(?:-[a-z]{3,})+\b/gi)) {
    out.push(m[0].toLowerCase());
    for (const part of m[0].toLowerCase().split('-')) {
      if (part.length >= 3) out.push(part);
    }
  }
  for (const m of raw.matchAll(/\b[A-Z]{2,5}\b/g)) {
    if (!/^(US|USA|THE|AND|FOR|NOT|AI)$/.test(m[0])) out.push(m[0].toLowerCase());
  }
  for (const t of raw.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!t) continue;
    if (GENERIC_NOUN.has(t) && !CATEGORY_KEEP.has(t)) continue;
    if (skip.has(t)) continue;
    if (t.length >= 6 || CATEGORY_KEEP.has(t)) out.push(t);
  }
  return [...new Set(out)];
}

function hayFor(item = {}) {
  const url = item.url || item.website || '';
  let hostpath = '';
  try {
    const parsed = new URL(url);
    hostpath = `${parsed.hostname} ${parsed.pathname}`;
  } catch {
    hostpath = url;
  }
  return `${item.title || item.organizationName || item.name || ''} ${hostpath} ${item.snippet || item.description || ''}`.toLowerCase();
}

export function topicalHit(item = {}, question = '') {
  const tokens = distinctiveTokens(question);
  if (!tokens.length) return { hit: true, tokens: [], matched: [] };
  const hay = hayFor(item);
  const matched = tokens.filter((t) => {
    const aliases = [t, ...(TOKEN_ALIASES[t] || [])];
    return aliases.some((alias) => {
      if (alias.includes('-')) return hay.includes(alias.replace(/-/g, ' ')) || hay.includes(alias) || hay.includes(alias.replace(/-/g, ''));
      try {
        return new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(hay);
      } catch {
        return hay.includes(alias);
      }
    });
  });
  return { hit: matched.length > 0, tokens, matched };
}

export function topicalScore(accepted = [], question = '') {
  const n = accepted.length;
  if (!n) return 0;
  if (!distinctiveTokens(question).length) return 1;
  return accepted.filter((a) => topicalHit(a, question).hit).length / n;
}

export function isListicle(item = {}) {
  const title = String(item.title || item.organizationName || item.name || '');
  const url = item.url || item.website || '';
  const path = pathOf(url);
  const hay = `${title} ${item.snippet || item.description || ''}`.toLowerCase();
  if (/\/(blog|guides?|articles?|roundup|reviews)\//i.test(path)) return true;
  if (/^(best|top)\s+\d*\s*/i.test(title) && /\b(apps?|software|tools|companies|providers|solutions|contractors)\b/i.test(title)) return true;
  if (/\bthe\s+\d+\s+best\b/i.test(title)) return true;
  if (/\b\d+\s+best\b/i.test(title) && /\b(apps?|software|tools|companies|providers|contractors|roofing)\b/i.test(title)) return true;
  if (/\b(compared|vs\.?|versus|roundup|ultimate guide)\b/i.test(title)) return true;
  if (/\btop\s+\d+\b/i.test(hay) && /\b(best|tools|apps|software|contractors)\b/i.test(hay)) return true;
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
  const hay = hayFor(item);
  const reasons = [];
  const wantSoftware = playbook === 'b2b-software' || playbook === 'regulated-information'
    || (requested === 'PRODUCT' && /\b(software|saas|technology used by)\b/i.test(question));

  if (!title && !url) {
    return { role: RESULT_ROLE.REJECT, pageKind: PAGE_KIND.UNKNOWN, requested, reasons: ['empty'] };
  }
  if (GENERIC_AI_HOST.test(host) && !/\b(chatgpt|openai|claude|gemini)\b/i.test(question)) {
    return { role: RESULT_ROLE.REJECT, pageKind: PAGE_KIND.ARTICLE, requested, reasons: ['generic-ai-host'] };
  }
  if (ENCYCLOPEDIA_HOST.test(host)) {
    return { role: RESULT_ROLE.REJECT, pageKind: PAGE_KIND.ARTICLE, requested, reasons: ['encyclopedia'] };
  }
  if (ENTERTAINMENT_HOST.test(host) && !/\b(tv|show|streaming|game|fortnite)\b/i.test(question)) {
    return { role: RESULT_ROLE.REJECT, pageKind: PAGE_KIND.ARTICLE, requested, reasons: ['entertainment-off-topic'] };
  }
  if (PACKAGE_TRACK_HOST.test(host) && !/\b(shipping|parcel|logistics|freight)\b/i.test(question)) {
    return { role: RESULT_ROLE.REJECT, pageKind: PAGE_KIND.PRODUCT, requested, reasons: ['package-tracker-off-topic'] };
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
  if (PUBLICATION_HOST.test(host) && (playbook === 'product-landscape' || playbook === 'b2b-software')) {
    return { role: RESULT_ROLE.SOURCE, pageKind: PAGE_KIND.PUBLICATION, requested, reasons: ['publication-is-source'] };
  }
  if (MEGA_RETAIL_HOST.test(host) && (playbook === 'b2b-software' || playbook === 'product-landscape' || playbook === 'regulated-information')) {
    return { role: RESULT_ROLE.SOURCE, pageKind: PAGE_KIND.DIRECTORY, requested, reasons: ['retail-catalog-not-vendor'] };
  }
  if (/\b(association|society|institute of|chamber of)\b/i.test(title)) {
    return { role: RESULT_ROLE.SOURCE, pageKind: PAGE_KIND.ASSOCIATION, requested, reasons: ['association'] };
  }
  if (playbook === 'product-landscape' && CLINICAL_HOST.test(host)) {
    return { role: RESULT_ROLE.SOURCE, pageKind: PAGE_KIND.CLINICAL, requested, reasons: ['clinical-host'] };
  }
  if (/\b(season \d|premiere date|lone-wolf|fishing boats|bass, deep v)\b/i.test(hay)
    && !/\b(tv|boat|fishing)\b/i.test(question)) {
    return { role: RESULT_ROLE.REJECT, pageKind: PAGE_KIND.ARTICLE, requested, reasons: ['entertainment-copy'] };
  }

  const topic = topicalHit(item, question);
  if (topic.tokens.length && !topic.hit) {
    return {
      role: RESULT_ROLE.REJECT,
      pageKind: PAGE_KIND.UNKNOWN,
      requested,
      playbook,
      reasons: ['off-topic']
    };
  }

  if (wantSoftware && topic.hit && !/\b(software|saas|app|apps|platform|cloud|routing|dispatch|work[- ]?order|crm|erp|sso|api)\b/i.test(hay)) {
    return {
      role: RESULT_ROLE.SOURCE,
      pageKind: PAGE_KIND.COMPANY,
      requested,
      playbook,
      reasons: ['hardware-or-service-not-software']
    };
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
  if (topic.matched.length) reasons.push(`topic:${topic.matched.slice(0, 3).join(',')}`);
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
