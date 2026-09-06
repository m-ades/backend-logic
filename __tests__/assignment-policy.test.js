import { computeDeadlinePolicy } from '../utils/assignmentPolicy.js';

// the sql in PAST_CUTOFF_SQL mirrors these rules; changing one without the other is a bug
describe('assignment deadline policy', () => {
  const assignment = {
    due_date: '2026-03-01T00:00:00Z',
    late_window_days: 3,
    late_penalty_percent: 10,
  };
  const at = (iso) => new Date(iso).getTime();

  it('adds the late window to the due date when there is nothing else', () => {
    const policy = computeDeadlinePolicy({ assignment });
    expect(at(policy.due_at)).toBe(at('2026-03-01T00:00:00Z'));
    expect(at(policy.cutoff_at)).toBe(at('2026-03-04T00:00:00Z'));
  });

  it('shifts the due date by extra_late_days when there is no extension', () => {
    const policy = computeDeadlinePolicy({
      assignment,
      accommodation: { extra_late_days: 2 },
    });
    expect(at(policy.due_at)).toBe(at('2026-03-03T00:00:00Z'));
    expect(at(policy.cutoff_at)).toBe(at('2026-03-06T00:00:00Z'));
  });

  it('uses the extension as the due date and adds the late window', () => {
    const policy = computeDeadlinePolicy({
      assignment,
      extension: { extended_due_date: '2026-03-10T00:00:00Z' },
    });
    expect(at(policy.due_at)).toBe(at('2026-03-10T00:00:00Z'));
    expect(at(policy.cutoff_at)).toBe(at('2026-03-13T00:00:00Z'));
  });

  it('stacks extra_late_days on top of an extension', () => {
    const policy = computeDeadlinePolicy({
      assignment,
      extension: { extended_due_date: '2026-03-10T00:00:00Z' },
      accommodation: { extra_late_days: 2 },
    });
    expect(at(policy.due_at)).toBe(at('2026-03-12T00:00:00Z'));
    expect(at(policy.cutoff_at)).toBe(at('2026-03-15T00:00:00Z'));
  });
});
