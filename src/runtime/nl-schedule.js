import { nextRunAt, WEEKDAY } from './tz.js';

const DAY_NAME = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6
};

function extractObjective(text) {
  return String(text || '')
    .replace(/^(run this|do this|schedule this)\s*/i, '')
    .replace(/\b(every morning|every weekday|every day|each morning|tomorrow morning|run this every[^.]*)\b/gi, ' ')
    .replace(/\bin\s+\d+\s+(seconds?|minutes?|hours?)\b/gi, ' ')
    .replace(/\bevery\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(am|pm)?)?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseClock(hourRaw, minuteRaw, ampm) {
  let hour = Number(hourRaw);
  const minute = Number(minuteRaw || 0);
  const mer = String(ampm || '').toLowerCase();
  if (mer === 'pm' && hour < 12) hour += 12;
  if (mer === 'am' && hour === 12) hour = 0;
  return { hour, minute };
}

function wantsOutreach(text) {
  return /(email|call|sms|dial|outreach|text them|contact them|send (them )?(an )?email)/i.test(text);
}

export function matchScheduleIntent(text) {
  const value = String(text || '').trim();
  if (!value) return null;
  if (/every (morning|weekday|day|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(value)) return { query: value };
  if (/tomorrow morning/i.test(value)) return { query: value };
  if (/\bin\s+\d+\s+(seconds?|minutes?|hours?)\b/i.test(value)) return { query: value };
  if (/run this every|do this every|schedule (this|it)/i.test(value)) return { query: value };
  if (/^pause (that |the )?schedule/i.test(value)) return { query: value, action: 'pause-schedule' };
  if (/^resume (that |the |my )?schedule|^resume my .+ research/i.test(value)) return { query: value, action: 'resume-schedule' };
  if (/^cancel (that |the )?schedule/i.test(value)) return { query: value, action: 'cancel-schedule' };
  if (/when does it run next|what is scheduled|show (me )?(the )?schedules/i.test(value)) return { query: value, action: 'inspect-schedule' };
  return null;
}

export function parseSchedule(text, { now = new Date(), defaultTimezone = 'America/Los_Angeles' } = {}) {
  const value = String(text || '').trim();
  const timezone = /los angeles|\bla\b|pacific|america\/los_angeles/i.test(value)
    ? 'America/Los_Angeles'
    : defaultTimezone;

  if (wantsOutreach(value)) {
    return {
      blocked: true,
      reason: 'Scheduled outreach is not authorized. Schedule ≠ permission. Research schedules are allowed.',
      raw: value
    };
  }

  const inMatch = value.match(/\bin\s+(\d+)\s+(seconds?|minutes?|hours?)\b/i);
  if (inMatch) {
    const n = Number(inMatch[1]);
    const unit = inMatch[2].toLowerCase();
    const delayMs = /second/.test(unit) ? n * 1000 : /minute/.test(unit) ? n * 60000 : n * 3600000;
    const at = new Date(now.getTime() + delayMs);
    return {
      kind: 'delayed',
      delayMs,
      timezone,
      hour: null,
      minute: null,
      daysOfWeek: null,
      nextRunAt: at.toISOString(),
      recurrence: `once in ${n} ${unit}`,
      objectiveTemplate: extractObjective(value) || value,
      overlapPolicy: 'SKIP',
      missedRunPolicy: 'RUN_ONCE',
      approvalPolicy: 'side-effect',
      blocked: false,
      raw: value
    };
  }

  let hour = 8;
  let minute = 0;
  const clock = value.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (clock) {
    const parsed = parseClock(clock[1], clock[2], clock[3]);
    hour = parsed.hour;
    minute = parsed.minute;
  } else if (/morning/i.test(value)) {
    hour = 8;
    minute = 0;
  }

  if (/tomorrow morning/i.test(value)) {
    const at = nextRunAt({ kind: 'daily', timezone, hour: 8, minute: 0 }, now);
    return {
      kind: 'once',
      at: at.toISOString(),
      timezone,
      hour: 8,
      minute: 0,
      daysOfWeek: null,
      nextRunAt: at.toISOString(),
      recurrence: 'once tomorrow morning',
      objectiveTemplate: extractObjective(value) || value,
      overlapPolicy: 'SKIP',
      missedRunPolicy: 'RUN_ONCE',
      approvalPolicy: 'side-effect',
      blocked: false,
      raw: value
    };
  }

  const weekly = value.match(/every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
  if (weekly) {
    const daysOfWeek = [DAY_NAME[weekly[1].toLowerCase()]];
    const at = nextRunAt({ kind: 'weekly', timezone, hour, minute, daysOfWeek }, now);
    return {
      kind: 'weekly',
      timezone,
      hour,
      minute,
      daysOfWeek,
      nextRunAt: at.toISOString(),
      recurrence: `every ${weekly[1].toLowerCase()} at ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${timezone}`,
      objectiveTemplate: extractObjective(value) || value,
      overlapPolicy: 'SKIP',
      missedRunPolicy: 'RUN_ONCE',
      approvalPolicy: 'side-effect',
      blocked: false,
      raw: value
    };
  }

  if (/every (morning|weekday)|each morning/i.test(value)) {
    const daysOfWeek = [1, 2, 3, 4, 5];
    const at = nextRunAt({ kind: 'weekdays', timezone, hour, minute, daysOfWeek }, now);
    return {
      kind: 'weekdays',
      timezone,
      hour,
      minute,
      daysOfWeek,
      nextRunAt: at.toISOString(),
      recurrence: `weekdays at ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${timezone}`,
      objectiveTemplate: extractObjective(value) || value,
      overlapPolicy: 'SKIP',
      missedRunPolicy: 'RUN_ONCE',
      approvalPolicy: 'side-effect',
      blocked: false,
      raw: value
    };
  }

  if (/every day/i.test(value)) {
    const at = nextRunAt({ kind: 'daily', timezone, hour, minute }, now);
    return {
      kind: 'daily',
      timezone,
      hour,
      minute,
      daysOfWeek: null,
      nextRunAt: at.toISOString(),
      recurrence: `daily at ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${timezone}`,
      objectiveTemplate: extractObjective(value) || value,
      overlapPolicy: 'SKIP',
      missedRunPolicy: 'RUN_ONCE',
      approvalPolicy: 'side-effect',
      blocked: false,
      raw: value
    };
  }

  return null;
}

export { WEEKDAY };
