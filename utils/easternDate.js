/**
 * Eastern offset for a given date (EST -05 or EDT -04).
 * US DST: 2nd Sun Mar – 1st Sun Nov.
 */
function easternOffsetFor(dateStr) {
  if (!dateStr || dateStr.length < 10) return '-05:00';
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '-05:00';
  const mar1 = new Date(Date.UTC(y, 2, 1));
  const nov1 = new Date(Date.UTC(y, 10, 1));
  const firstSun = (date) => (date.getUTCDay() === 0 ? 1 : 8 - date.getUTCDay());
  const dstStart = new Date(Date.UTC(y, 2, firstSun(mar1) + 7));
  const dstEnd = new Date(Date.UTC(y, 10, firstSun(nov1)));
  const at = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return at >= dstStart && at < dstEnd ? '-04:00' : '-05:00';
}

/**
 * Format a Date (UTC moment from DB) to Eastern as YYYY-MM-DDTHH:mm:ss±HH:mm.
 * API returns Eastern with offset so frontend parses unambiguously (never as UTC/local).
 */
export function formatDueDateEastern(value) {
  if (value == null) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const timeStr = d.toLocaleTimeString('en-GB', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  if (!dateStr || !timeStr) return null;
  const offset = easternOffsetFor(dateStr);
  return `${dateStr}T${timeStr}${offset}`;
}

/**
 * Parse incoming due_date from client. If it has an offset (or Z), use as-is.
 * If it has no offset (legacy/local), treat as Eastern and convert to UTC Date for storage.
 */
export function parseDueDateForStorage(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return value;
  const hasOffset = value.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(value);
  if (hasOffset) return value;
  if (value.includes('T') && value.length >= 16) {
    const datePart = value.slice(0, 10);
    let timePart = value.slice(11, 19);
    if (timePart.length === 5) timePart += ':00';
    const offset = easternOffsetFor(datePart);
    return `${datePart}T${timePart}${offset}`;
  }
  return value;
}
