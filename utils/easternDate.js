import { Temporal } from '@js-temporal/polyfill';

const NEW_YORK_TIME_ZONE = 'America/New_York';

// converts supported values to temporal instants and throws otherwise
export function toTemporalInstant(value) {
  if (value instanceof Date) return Temporal.Instant.from(value.toISOString());
  if (typeof value === 'number') return Temporal.Instant.fromEpochMilliseconds(value);
  return Temporal.Instant.from(value);
}

// formats instants in new york and returns null for invalid values
export function formatDueDateEastern(value) {
  if (value == null) return null;
  try {
    return toTemporalInstant(value)
      .toZonedDateTimeISO(NEW_YORK_TIME_ZONE)
      .toString({ timeZoneName: 'never', smallestUnit: 'second' });
  } catch {
    return null;
  }
}

/*
preserves offset instants and maps local values to new york
date only values use midnight and invalid wall times throw request errors
*/
export function parseDueDateForStorage(value, fieldName = 'timestamp') {
  if (value == null || typeof value !== 'string') return value;
  const hasOffset = value.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(value);

  try {
    if (hasOffset) return toTemporalInstant(value).toString();
    const local = value.includes('T')
      ? Temporal.PlainDateTime.from(value)
      : Temporal.PlainDate.from(value).toPlainDateTime();
    return local
      .toZonedDateTime(NEW_YORK_TIME_ZONE, { disambiguation: 'reject' })
      .toInstant()
      .toString();
  } catch {
    const error = new Error(`${fieldName} must be a valid New York timestamp`);
    error.status = 400;
    throw error;
  }
}
