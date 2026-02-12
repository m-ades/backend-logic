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

  const baseDue = extension?.extended_due_date
    ? new Date(extension.extended_due_date)
    : new Date(assignment.due_date);
  const lateWindowDays = assignment?.late_window_days ?? 0;
  const extraLateDays = accommodation?.extra_late_days ?? 0;
  const hasExtension = Boolean(extension?.extended_due_date);
  // treat accommodation extra_late_days as extra full-credit days (shift due date),
  // not as additional late-window days. do not stack with extensions.
  const effectiveDue = !hasExtension && extraLateDays
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
