/* 
sql equivalent of computeDeadlinePolicy's cutoff, for queries that cannot call it
*/
export const PAST_CUTOFF_SQL = `
  (
    GREATEST(ext.extended_due_date, a.due_date)
    + COALESCE(acc.extra_late_days, 0) * INTERVAL '1 day'
    + COALESCE(a.late_window_days, 0) * INTERVAL '1 day'
  )
`;

// returns a new date that's days later
export function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/* compute assignment due date for a
student who gets an extension or accomodation */
export function computeDeadlinePolicy({
  assignment,
  extension,
  accommodation,
}) {
  if (!assignment?.due_date) {
    return {
      due_at: null,
      cutoff_at: null,
      late_penalty_percent: assignment?.late_penalty_percent ?? null,
      late_window_days: assignment?.late_window_days ?? null,
      extra_late_days: accommodation?.extra_late_days ?? 0,
      late_penalty_waived: accommodation?.late_penalty_waived ?? false,
    };
  }

  // an extension can only push a deadline later; it must never pull one earlier than
  // the assignment's own due date, which can happen if the due date moves after it was granted
  const dueAt = new Date(assignment.due_date).getTime();
  const extensionAt = extension?.extended_due_date
    ? new Date(extension.extended_due_date).getTime()
    : NaN;
  const baseDue = Number.isFinite(extensionAt)
    ? new Date(Number.isFinite(dueAt) ? Math.max(extensionAt, dueAt) : extensionAt)
    : new Date(assignment.due_date);
  const lateWindowDays = assignment?.late_window_days ?? 0;
  const extraLateDays = accommodation?.extra_late_days ?? 0;
  // extra_late_days are full-credit days that shift the due date, and they stack
  // on top of an extension rather than being cancelled out by one
  const effectiveDue = extraLateDays
    ? addDays(baseDue, extraLateDays)
    : baseDue;
  const cutoff = addDays(effectiveDue, lateWindowDays);
  const penalty = accommodation?.late_penalty_waived
    ? 0
    : assignment?.late_penalty_percent ?? 0;

  return {
    due_at: effectiveDue,
    cutoff_at: cutoff,
    late_penalty_percent: penalty,
    late_window_days: lateWindowDays,
    extra_late_days: extraLateDays,
    late_penalty_waived: accommodation?.late_penalty_waived ?? false,
  };
}
