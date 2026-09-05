import {
  formatDueDateEastern,
  parseDueDateForStorage,
} from '../utils/easternDate.js';

describe('new york date conversion', () => {
  it('formats instants with the offset active in new york', () => {
    expect(formatDueDateEastern('2026-03-08T05:00:00Z'))
      .toBe('2026-03-08T00:00:00-05:00');
    expect(formatDueDateEastern('2026-03-08T07:00:00Z'))
      .toBe('2026-03-08T03:00:00-04:00');
  });

  it('interprets local values in new york and preserves absolute instants', () => {
    expect(parseDueDateForStorage('2026-01-15T12:00'))
      .toBe('2026-01-15T17:00:00Z');
    expect(parseDueDateForStorage('2026-07-15T12:00:00-04:00'))
      .toBe('2026-07-15T16:00:00Z');
    expect(parseDueDateForStorage('2026-01-15'))
      .toBe('2026-01-15T05:00:00Z');
  });

  it.each([
    '2026-03-08T02:30',
    '2026-11-01T01:30',
  ])('rejects invalid new york wall clock time %s', (value) => {
    try {
      parseDueDateForStorage(value, 'publish_at');
      throw new Error('expected parsing to fail');
    } catch (error) {
      expect(error.status).toBe(400);
      expect(error.message).toBe('publish_at must be a valid New York timestamp');
    }
  });
});
