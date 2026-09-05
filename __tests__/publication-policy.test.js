import {
  isAssignmentLocked,
  normalizePublicationWrite,
} from '../utils/publicationPolicy.js';

describe('assignment publication policy', () => {
  const now = new Date('2026-09-04T16:00:00Z');

  it('keeps the manual lock state for legacy rows without publish_at', () => {
    expect(isAssignmentLocked({ is_locked: true, publish_at: null }, now)).toBe(true);
    expect(isAssignmentLocked({ is_locked: false, publish_at: null }, now)).toBe(false);
  });

  it('uses publish_at as the effective state when a schedule exists', () => {
    expect(isAssignmentLocked({
      is_locked: false,
      publish_at: '2026-09-04T16:01:00Z',
    }, now)).toBe(true);
    expect(isAssignmentLocked({
      is_locked: true,
      publish_at: '2026-09-04T16:00:00Z',
    }, now)).toBe(false);
  });

  it('fails closed when a stored publish_at is invalid', () => {
    expect(isAssignmentLocked({ is_locked: false, publish_at: 'not a date' }, now)).toBe(true);
  });

  it('normalizes manual publication changes', () => {
    expect(normalizePublicationWrite({ is_locked: true }, { now })).toEqual({
      is_locked: true,
      publish_at: null,
    });
    expect(normalizePublicationWrite({ is_locked: false }, { now })).toEqual({
      is_locked: false,
      publish_at: '2026-09-04T16:00:00Z',
    });
  });

  it('derives the stored lock flag from an explicit publish_at', () => {
    expect(normalizePublicationWrite({
      is_locked: false,
      publish_at: '2026-09-04T12:01:00-04:00',
    }, { now })).toEqual({
      is_locked: true,
      publish_at: '2026-09-04T16:01:00Z',
    });
    expect(normalizePublicationWrite({
      is_locked: true,
      publish_at: '2026-09-04T11:59:00-04:00',
    }, { now })).toEqual({
      is_locked: false,
      publish_at: '2026-09-04T15:59:00Z',
    });
  });

  it('defaults new assignments to manually locked', () => {
    expect(normalizePublicationWrite(
      { title: 'new assignment' },
      { defaultLocked: true, now }
    )).toEqual({
      title: 'new assignment',
      is_locked: true,
      publish_at: null,
    });
  });

  it('rejects an invalid explicit publish_at', () => {
    expect(() => normalizePublicationWrite({ publish_at: 'not a date' }, { now }))
      .toThrow('publish_at must be a valid timestamp');
  });
});
