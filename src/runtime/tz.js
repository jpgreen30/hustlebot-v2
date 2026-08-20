const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const WEEKDAY_NAME = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function zonedParts(date, timeZone = 'UTC') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hourCycle: 'h23'
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: WEEKDAY[get('weekday')] ?? 0,
    weekdayName: get('weekday')
  };
}

export function makeZonedDate(parts, timeZone = 'UTC') {
  let guess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0);
  for (let i = 0; i < 4; i++) {
    const shown = zonedParts(new Date(guess), timeZone);
    const shownUtc = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute, shown.second);
    const targetUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0);
    const diff = targetUtc - shownUtc;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

function addCalendarDays(parts, days) {
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
}

export function nextRunAt(rule = {}, from = new Date()) {
  if (rule.kind === 'once' && rule.at) return new Date(rule.at);
  if (rule.kind === 'delayed') return new Date(from.getTime() + Number(rule.delayMs || 0));
  const timezone = rule.timezone || 'UTC';
  const hour = Number(rule.hour ?? 8);
  const minute = Number(rule.minute ?? 0);
  const days = Array.isArray(rule.daysOfWeek) ? rule.daysOfWeek : null;
  const start = zonedParts(from, timezone);
  for (let add = 0; add < 16; add++) {
    const day = addCalendarDays(start, add);
    const candidate = makeZonedDate({ ...day, hour, minute, second: 0 }, timezone);
    if (candidate.getTime() <= from.getTime()) continue;
    const shown = zonedParts(candidate, timezone);
    if (days && !days.includes(shown.weekday)) continue;
    return candidate;
  }
  throw new Error('Could not compute nextRunAt');
}

export function weekdayName(n) {
  return WEEKDAY_NAME[n] || String(n);
}

export { WEEKDAY };
