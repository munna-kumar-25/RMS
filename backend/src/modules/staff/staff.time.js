import { AccessError } from '../access/authorization.js';

/**
 * Assignment dates, shift dates, and attendance dates are calendar dates
 * (YYYY-MM-DD) in the branch timezone. They are not UTC instants.
 * An assignment covers a local date when startDate <= date and
 * (endDate is empty or endDate >= date). Both ends are inclusive.
 *
 * Shift instants are stored in UTC. timezoneSnapshot is the IANA zone
 * used to interpret the local start and end. Overnight shifts set
 * endsNextDay and finish on the next local calendar date.
 *
 * Attendance is grouped on the linked shift's local start date. An
 * unscheduled session uses the branch-local calendar date of clock-in.
 *
 * A local time that does not exist, or that occurs twice because of
 * daylight saving, is rejected. The caller must choose a different
 * local time. The server does not pick an offset.
 */

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const assertDate = (value, label = 'Date') => {
  const match = DATE.exec(String(value || ''));
  if (!match) throw new AccessError(`${label} must be YYYY-MM-DD.`, 400);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    throw new AccessError(`${label} is not a real calendar date.`, 400);
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
};

export const assertTime = (value, label = 'Time') => {
  if (!TIME.test(String(value || ''))) throw new AccessError(`${label} must be HH:mm.`, 400);
  return String(value);
};

export const addDays = (date, days) => {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  const pad = (part) => String(part).padStart(2, '0');
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
};

export const rangesOverlap = (startA, endA, startB, endB) => {
  const finishA = endA || '9999-12-31';
  const finishB = endB || '9999-12-31';
  return startA <= finishB && startB <= finishA;
};

const zoneParts = (instant, timeZone) => {
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    throw new AccessError('Timezone must be a valid IANA timezone.', 400);
  }
  const parts = Object.fromEntries(formatter.formatToParts(instant).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === '24' ? '0' : parts.hour),
    minute: Number(parts.minute),
  };
};

export const localDate = (instant, timeZone) => {
  const parts = zoneParts(instant, timeZone);
  const pad = (part) => String(part).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
};

export const zonedLocalToUtc = (date, time, timeZone) => {
  assertDate(date);
  assertTime(time);
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute, 0);
  const matches = [];
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const utc = new Date(wall - offset * 60000);
    const parts = zoneParts(utc, timeZone);
    if (parts.year === year && parts.month === month && parts.day === day && parts.hour === hour && parts.minute === minute) {
      if (!matches.some((item) => item.getTime() === utc.getTime())) matches.push(utc);
    }
  }
  if (matches.length === 0) {
    throw new AccessError('That local time does not exist in the branch timezone. Choose a different time.', 400);
  }
  if (matches.length > 1) {
    throw new AccessError('That local time occurs twice in the branch timezone. Choose a different time.', 400);
  }
  return matches[0];
};

export const shiftBounds = ({ shiftDate, startLocalTime, endLocalTime, endsNextDay, timeZone }) => {
  const start = zonedLocalToUtc(shiftDate, startLocalTime, timeZone);
  const endDate = endsNextDay ? addDays(shiftDate, 1) : shiftDate;
  const end = zonedLocalToUtc(endDate, endLocalTime, timeZone);
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  if (minutes <= 0 || minutes > 20 * 60) {
    throw new AccessError('A shift must last between 1 minute and 20 hours. Overnight shifts must set endsNextDay.', 400);
  }
  return { start, end, minutes };
};

export const assertBreakFits = (plannedBreakMinutes, durationMinutes) => {
  const minutes = Number(plannedBreakMinutes ?? 0);
  if (!Number.isInteger(minutes) || minutes < 0) throw new AccessError('Planned break minutes must be a whole number.', 400);
  if (minutes >= durationMinutes) throw new AccessError('Planned break must be shorter than the shift.', 400);
  return minutes;
};
