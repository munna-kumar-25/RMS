import { AccessError } from '../access/authorization.js';

const COUNTRY_CODES = new Set(`AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS YE ZA ZM ZW`.split(' '));

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const CHANNELS = new Set(['dine_in', 'takeaway', 'delivery', 'online']);

export const normalizeCode = (value) => String(value || '').trim().toUpperCase();

const fail = (message) => {
  throw new AccessError(message, 400);
};

export const assertCode = (value) => {
  const code = normalizeCode(value);
  if (!/^[A-Z0-9_-]+$/.test(code)) fail('Branch code must use letters, numbers, hyphens, or underscores.');
  return code;
};

export const assertName = (value) => {
  const name = String(value || '').trim();
  if (!name || name.length > 100) fail('Branch name is required and must be 100 characters or fewer.');
  return name;
};

export const assertEmail = (value) => {
  if (value === undefined || value === null || value === '') return '';
  const email = String(value).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Enter a valid email address.');
  return email;
};

export const assertCountry = (value) => {
  if (!value) return '';
  const code = String(value).trim().toUpperCase();
  if (!COUNTRY_CODES.has(code)) fail('Country code must be a valid ISO 3166-1 alpha-2 code.');
  return code;
};

export const assertCurrency = (value) => {
  const code = String(value || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) fail('Currency code must be a three-letter ISO code.');
  return code;
};

export const assertTimezone = (value) => {
  const zone = String(value || '').trim();
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date());
  } catch {
    fail('Timezone must be a valid IANA timezone.');
  }
  return zone;
};

export const assertCutoff = (value) => {
  const cutoff = String(value || '').trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(cutoff)) fail('Business-day cutoff must use HH:mm.');
  return cutoff;
};

export const assertChannels = (value) => {
  if (!Array.isArray(value) || value.length === 0) fail('Select at least one order channel.');
  const channels = [...new Set(value)];
  if (channels.some((channel) => !CHANNELS.has(channel))) fail('Order channel is not supported.');
  return channels;
};

export const assertCoordinates = (latitude, longitude) => {
  const hasLat = latitude !== undefined && latitude !== null && latitude !== '';
  const hasLng = longitude !== undefined && longitude !== null && longitude !== '';
  if (hasLat !== hasLng) fail('Latitude and longitude must be supplied together.');
  if (!hasLat) return { latitude: null, longitude: null };
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) fail('Latitude must be between -90 and 90.');
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) fail('Longitude must be between -180 and 180.');
  return { latitude: lat, longitude: lng };
};

const minutes = (value) => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ''));
  if (!match) fail('Operating times must use HH:mm.');
  return (Number(match[1]) * 60) + Number(match[2]);
};

const rangesFor = (intervals) => {
  const ranges = (intervals || []).map((interval) => {
    const start = minutes(interval.start);
    const end = minutes(interval.end);
    if (interval.overnight) {
      if (end >= start) fail('An overnight interval must end the next morning, before its opening time.');
      return [start, end + 1440];
    }
    if (end <= start) fail('A same-day interval must close after it opens. Mark overnight service explicitly.');
    return [start, end];
  }).sort((left, right) => left[0] - right[0]);
  for (let index = 1; index < ranges.length; index += 1) {
    if (ranges[index][0] < ranges[index - 1][1]) fail('Operating intervals overlap.');
  }
  return ranges;
};

const daySchedule = (day, value) => {
  if (!value || typeof value !== 'object') fail(`Operating hours for ${day} are required.`);
  const closed = Boolean(value.closed);
  const intervals = Array.isArray(value.intervals) ? value.intervals : [];
  if (closed && intervals.length) fail(`${day} is closed and cannot also list service intervals.`);
  if (!closed && !intervals.length) fail(`${day} needs at least one service interval or must be closed.`);
  rangesFor(intervals);
  return {
    closed,
    intervals: intervals.map((interval) => ({
      start: interval.start,
      end: interval.end,
      overnight: Boolean(interval.overnight),
    })),
  };
};

export const assertOperatingHours = (value) => {
  if (!value || typeof value !== 'object') fail('Operating hours are required.');
  const week = {};
  DAYS.forEach((day) => {
    week[day] = daySchedule(day, value[day]);
  });
  DAYS.forEach((day, index) => {
    const spill = rangesFor(week[day].intervals).filter((range) => range[1] > 1440).map((range) => range[1] - 1440);
    const next = rangesFor(week[DAYS[(index + 1) % DAYS.length]].intervals);
    spill.forEach((end) => {
      if (next.some((range) => range[0] < end)) fail('An overnight interval overlaps the next day.');
    });
  });
  const exceptions = Array.isArray(value.exceptions) ? value.exceptions : [];
  week.exceptions = exceptions.map((exception) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exception.date || '')) fail('Exception dates must use YYYY-MM-DD.');
    const schedule = daySchedule(exception.date, exception);
    return { date: exception.date, ...schedule };
  });
  return week;
};

export const businessDate = (instant, timeZone, cutoff) => {
  const zone = assertTimezone(timeZone);
  const limit = assertCutoff(cutoff);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);
  const read = (type) => parts.find((part) => part.type === type)?.value;
  const localMinutes = (Number(read('hour')) * 60) + Number(read('minute'));
  const [hour, minute] = limit.split(':').map(Number);
  const cutoffMinutes = (hour * 60) + minute;
  const stamp = new Date(Date.UTC(Number(read('year')), Number(read('month')) - 1, Number(read('day'))));
  if (localMinutes < cutoffMinutes) stamp.setUTCDate(stamp.getUTCDate() - 1);
  return stamp.toISOString().slice(0, 10);
};

export const DAYS_OF_WEEK = DAYS;
export const ORDER_CHANNELS = [...CHANNELS];
