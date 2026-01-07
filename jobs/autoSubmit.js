import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/sequelize.js';
import { Assignment } from '../models/index.js';
import { autoSubmitIfPastDeadline } from '../utils/autoSubmit.js';

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

const getIntervalMs = () => {
  const raw = process.env.AUTO_SUBMIT_INTERVAL_MS;
  if (!raw) {
    return DEFAULT_INTERVAL_MS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS;
};

export async function runAutoSubmitSweep() {
  // track timing, created count for simple operational logging.
  const startedAt = new Date();
  let createdCount = 0;
  // only consider drafts with no matching submission, then re-check cutoff per user.
  const candidates = await sequelize.query(
    `
      SELECT DISTINCT q.assignment_id, d.user_id
      FROM assignment_drafts d
      JOIN assignment_questions q ON q.id = d.assignment_question_id
      JOIN assignments a ON a.id = q.assignment_id
      WHERE a.kind = 'assignment'
        AND a.due_date IS NOT NULL
        AND a.due_date < NOW()
        AND NOT EXISTS (
          SELECT 1
          FROM submissions s
          WHERE s.assignment_question_id = d.assignment_question_id
            AND s.user_id = d.user_id
        )
    `,
    { type: QueryTypes.SELECT }
  );

  const assignmentIds = [...new Set(candidates.map((row) => row.assignment_id))];
  const assignments = assignmentIds.length
    ? await Assignment.findAll({ where: { id: assignmentIds } })
    : [];
  const assignmentMap = new Map(assignments.map((assignment) => [assignment.id, assignment]));

  for (const candidate of candidates) {
    const assignment = assignmentMap.get(candidate.assignment_id);
    if (!assignment) {
      continue;
    }

    const result = await autoSubmitIfPastDeadline(assignment, candidate.user_id);
    createdCount += result.created?.length || 0;
  }

  const endedAt = new Date();
  console.log('[auto-submit] sweep complete', {
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    createdCount,
    candidateCount: candidates.length,
  });
}

export function scheduleAutoSubmitSweep() {
  const run = async () => {
    try {
      console.log('[auto-submit] sweep start', { startedAt: new Date().toISOString() });
      await runAutoSubmitSweep();
    } catch (error) {
      console.error('Auto-submit sweep failed', error);
    }
  };

  run();

  return setInterval(run, getIntervalMs());
}
