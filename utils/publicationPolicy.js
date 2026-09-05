import { Temporal } from '@js-temporal/polyfill';
import { toTemporalInstant } from './easternDate.js';

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

// resolves publish times with legacy lock fallback and fails closed on invalid timestamps
export function isAssignmentLocked(assignment, now = new Date()) {
  if (!assignment) return true;
  if (assignment.publish_at == null || assignment.publish_at === '') {
    return Boolean(assignment.is_locked);
  }

  try {
    return Temporal.Instant.compare(
      toTemporalInstant(assignment.publish_at),
      toTemporalInstant(now)
    ) > 0;
  } catch {
    return true;
  }
}

/*
manual locks clear publish times and unlocks stamp now
explicit unlocks use server time even when clients send a timestamp
other scheduled times set the lock state and invalid timestamps throw request errors
*/
export function normalizePublicationWrite(payload, { defaultLocked = false, now = new Date() } = {}) {
  const normalized = { ...payload };
  const hasLock = hasOwn(normalized, 'is_locked');
  const hasPublishAt = hasOwn(normalized, 'publish_at');

  if (!hasLock && !hasPublishAt) {
    if (!defaultLocked) return normalized;
    normalized.is_locked = true;
    normalized.publish_at = null;
    return normalized;
  }

  const current = toTemporalInstant(now);

  if (hasLock && normalized.is_locked === false) {
    normalized.is_locked = false;
    normalized.publish_at = current.toString();
    return normalized;
  }

  if (hasPublishAt && normalized.publish_at != null && normalized.publish_at !== '') {
    let publishAt;
    try {
      publishAt = toTemporalInstant(normalized.publish_at);
    } catch {
      const error = new Error('publish_at must be a valid timestamp');
      error.status = 400;
      throw error;
    }
    normalized.publish_at = publishAt.toString();
    normalized.is_locked = Temporal.Instant.compare(publishAt, current) > 0;
    return normalized;
  }

  normalized.is_locked = hasLock ? Boolean(normalized.is_locked) : true;
  normalized.publish_at = normalized.is_locked ? null : current.toString();
  return normalized;
}
