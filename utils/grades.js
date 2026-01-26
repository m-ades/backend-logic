import { QueryTypes } from 'sequelize';
import {
  Accommodation,
  Assignment,
  AssignmentExtension,
  AssignmentGrade,
  AssignmentQuestion,
} from '../models/index.js';
import { sequelize } from '../config/sequelize.js';
import { computeDeadlinePolicy } from './assignmentPolicy.js';

const toNumber = (value) => (value === null || value === undefined ? 0 : Number(value));

export async function recomputeAssignmentGrade({ assignmentId, userId }) {
  const assignment = await Assignment.findByPk(assignmentId);
  if (!assignment) {
    return null;
  }

  const questions = await AssignmentQuestion.findAll({
    where: { assignment_id: assignmentId },
    attributes: ['id'],
  });
  if (!questions.length) {
    return null;
  }

  const questionIds = questions.map((question) => question.id);
  const submissionRows = await sequelize.query(
    `
      SELECT assignment_question_id, MAX(score) AS max_score, MAX(submitted_at) AS latest_submitted_at
      FROM submissions
      WHERE user_id = :userId
        AND assignment_question_id IN (:questionIds)
      GROUP BY assignment_question_id
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { userId, questionIds },
    }
  );

  if (!submissionRows.length) {
    return null;
  }

  const scoreByQuestion = new Map();
  let latestSubmissionAt = null;
  for (const row of submissionRows) {
    scoreByQuestion.set(row.assignment_question_id, toNumber(row.max_score));
    if (row.latest_submitted_at) {
      const candidateDate = new Date(row.latest_submitted_at);
      if (!latestSubmissionAt || candidateDate > latestSubmissionAt) {
        latestSubmissionAt = candidateDate;
      }
    }
  }

  const rawScore = questions.reduce(
    (sum, question) => sum + (scoreByQuestion.get(question.id) || 0),
    0
  );
  const maxScore = questions.length * 100;

  const extension = await AssignmentExtension.findOne({
    where: { assignment_id: assignmentId, user_id: userId },
  });
  const accommodation = await Accommodation.findOne({
    where: { course_id: assignment.course_id, user_id: userId },
  });
  const policy = computeDeadlinePolicy({ assignment, extension, accommodation });

  let penaltyPercent = 0;
  if (policy.due_at && latestSubmissionAt && latestSubmissionAt > policy.due_at) {
    penaltyPercent = policy.late_penalty_percent ?? 0;
  }

  const finalScore = Math.max(
    0,
    Math.round(rawScore * (1 - penaltyPercent / 100))
  );

  const existing = await AssignmentGrade.findOne({
    where: { assignment_id: assignmentId, user_id: userId },
  });

  const payload = {
    assignment_id: assignmentId,
    user_id: userId,
    raw_score: rawScore,
    max_score: maxScore,
    penalty_percent: penaltyPercent,
    final_score: finalScore,
    graded_at: new Date(),
    graded_by: null,
  };

  const grade = existing ? await existing.update(payload) : await AssignmentGrade.create(payload);
  return grade;
}

export async function ensureZeroGradesForPastDue({ userId }) {
  if (!userId) return;
  await sequelize.query(
    `
      WITH enrolled_courses AS (
        SELECT course_id
        FROM course_enrollments
        WHERE user_id = :userId
      ),
      question_counts AS (
        SELECT assignment_id, COUNT(*) AS question_count
        FROM assignment_questions
        GROUP BY assignment_id
      ),
      submitted_assignments AS (
        SELECT DISTINCT aq.assignment_id
        FROM assignment_questions aq
        JOIN submissions s ON s.assignment_question_id = aq.id
        WHERE s.user_id = :userId
      )
      INSERT INTO assignment_grades (
        assignment_id,
        user_id,
        raw_score,
        max_score,
        penalty_percent,
        final_score,
        graded_at,
        graded_by
      )
      SELECT
        a.id,
        :userId,
        0,
        qc.question_count * 100,
        0,
        0,
        NOW(),
        NULL
      FROM assignments a
      JOIN enrolled_courses ec ON ec.course_id = a.course_id
      JOIN question_counts qc ON qc.assignment_id = a.id
      LEFT JOIN assignment_extensions ext
        ON ext.assignment_id = a.id AND ext.user_id = :userId
      LEFT JOIN accommodations acc
        ON acc.course_id = a.course_id AND acc.user_id = :userId
      LEFT JOIN assignment_grades ag
        ON ag.assignment_id = a.id AND ag.user_id = :userId
      LEFT JOIN submitted_assignments sa
        ON sa.assignment_id = a.id
      WHERE a.kind = 'assignment'
        AND a.due_date IS NOT NULL
        AND ag.assignment_id IS NULL
        AND sa.assignment_id IS NULL
        AND NOW() > (
          COALESCE(ext.extended_due_date, a.due_date)
          + (COALESCE(a.late_window_days, 0) + COALESCE(acc.extra_late_days, 0))
            * INTERVAL '1 day'
        )
      ON CONFLICT (assignment_id, user_id) DO NOTHING
    `,
    {
      type: QueryTypes.INSERT,
      replacements: { userId },
    }
  );
}
