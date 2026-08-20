/**
 * Natural-language quantity extraction for MacGyver objectives.
 * Handles "three Los Angeles logistics companies", "top five", "research 3 businesses".
 */

export const WORD_NUM = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30
};

const ENTITY = 'companies|company|exhibitors|prospects|businesses|business|roofers?|providers|products|apps|organizations|orgs';
const WORDS = Object.keys(WORD_NUM).join('|');

function asNum(value) {
  if (value == null) return null;
  const key = String(value).toLowerCase();
  if (WORD_NUM[key] != null) return WORD_NUM[key];
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function extractQuantities(text, extra = {}) {
  const raw = String(text || '');

  const digitNear = raw.match(new RegExp(`\\b(\\d+)\\s+(?:[\\w.'/-]+\\s+){0,6}(?:${ENTITY})\\b`, 'i'));
  const wordNear = raw.match(new RegExp(`\\b(${WORDS})\\s+(?:[\\w.'/-]+\\s+){0,6}(?:${ENTITY})\\b`, 'i'));
  const findDigit = raw.match(/\b(?:find|get|take|research|compare|identify)\s+(\d+)\b/i);
  const findWord = raw.match(new RegExp(`\\b(?:find|get|take|research|compare|identify)\\s+(${WORDS})\\b`, 'i'));
  const relevant = raw.match(new RegExp(`\\b(\\d+|${WORDS})\\s+relevant\\b`, 'i'));

  const topDigit = raw.match(/\btop\s+(\d+)\b/i);
  const topWord = raw.match(new RegExp(`\\btop\\s+(${WORDS})\\b`, 'i'));
  const whichDigit = raw.match(/\bwhich\s+(\d+)\b/i);
  const whichWord = raw.match(new RegExp(`\\bwhich\\s+(${WORDS})\\b`, 'i'));
  const biggest = raw.match(new RegExp(`\\b(?:the\\s+)?(${WORDS}|\\d+)\\s+biggest\\b`, 'i'));

  const findN = Number(
    extra.maxOrganizations
    || asNum(digitNear?.[1])
    || asNum(wordNear?.[1])
    || asNum(findDigit?.[1])
    || asNum(findWord?.[1])
    || asNum(relevant?.[1])
    || 10
  );

  const explicitTop = asNum(extra.topN)
    || asNum(topDigit?.[1])
    || asNum(topWord?.[1])
    || asNum(whichDigit?.[1])
    || asNum(whichWord?.[1])
    || asNum(biggest?.[1]);

  const topN = Number(explicitTop || Math.min(findN, 5));
  return { findN, topN };
}

const KNOWN_INDUSTRIES = [
  ['roofing', /\b(roofing|roofer)\b/i],
  ['solar', /\bsolar\b/i],
  ['hvac', /\bhvac\b/i],
  ['insurance', /\binsurance\b/i],
  ['logistics', /\b(logistics|freight|shipping|3pl|trucking|warehous\w*)\b/i],
  ['home-service', /\bhome service\b/i]
];

export function extractSlices(text) {
  const raw = String(text || '');
  const known = [];
  for (const [id, re] of KNOWN_INDUSTRIES) {
    if (re.test(raw)) known.push(id);
  }

  const across = raw.match(/across\s+([^.;]+?)(?:\s+in\s+[A-Za-z][^.;]*)?(?:[.;]|$)/i);
  const fromAcross = [];
  if (across) {
    for (const part of across[1].split(/\s*,\s*|\s+and\s+/i)) {
      const slice = part
        .replace(/^(and|&)\s+/i, '')
        .replace(/\b(platforms|apps|companies|products)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (slice.length >= 3 && !/^(the|their|its|and)$/i.test(slice)) fromAcross.push(slice.toLowerCase());
    }
  }

  const unique = [];
  for (const item of [...fromAcross, ...known]) {
    if (!unique.includes(item)) unique.push(item);
  }
  return unique;
}

export function isTrivialLookup(text) {
  return /^(what(?:'s| is) the (current )?utc time|what time is it|current utc time|ping)\??$/i.test(String(text || '').trim())
    || /current utc time/i.test(String(text || '')) && !/(compan|research|rank|prospect)/i.test(String(text || ''));
}
