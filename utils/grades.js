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

// assignment grade contract
// each question contributes its highest score ever
// the earliest submission attaining that score determines lateness
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
      SELECT DISTINCT ON (assignment_question_id)
        assignment_question_id,
        score AS best_score,
        submitted_at AS best_submitted_at
      FROM submissions
      WHERE user_id = :userId
        AND assignment_question_id IN (:questionIds)
      ORDER BY assignment_question_id, score DESC, submitted_at ASC, id ASC
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
  let latestBestSubmissionAt = null;
  for (const row of submissionRows) {
    scoreByQuestion.set(row.assignment_question_id, toNumber(row.best_score));
    if (row.best_submitted_at) {
      const candidateDate = new Date(row.best_submitted_at);
      if (!latestBestSubmissionAt || candidateDate > latestBestSubmissionAt) {
        latestBestSubmissionAt = candidateDate;
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
  if (policy.due_at && latestBestSubmissionAt && latestBestSubmissionAt > policy.due_at) {
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

/**
 * Return effective grades for a user: one row per enrolled assignment, with
 * real grade if present else final_score=0 and max_score from assignment.
 * Read-only (no INSERTs). Use this for GET /users/:id/grades.
 */
export async function fetchEffectiveGrades(userId) {
  if (!userId) return [];
  const rows = await sequelize.query(
    `
    SELECT
      a.id AS assignment_id,
      :userId AS user_id,
      COALESCE(ag.raw_score, 0) AS raw_score,
      COALESCE(ag.max_score, (SELECT COUNT(*)::int * 100 FROM assignment_questions WHERE assignment_id = a.id)) AS max_score,
      COALESCE(ag.penalty_percent, 0) AS penalty_percent,
      COALESCE(ag.final_score, 0) AS final_score,
      ag.graded_at,
      ag.graded_by,
      a.id AS "a_id",
      a.title AS "a_title",
      a.course_id AS "a_course_id",
      a.description AS "a_description",
      a.kind AS "a_kind",
      a.due_date AS "a_due_date",
      a.is_locked AS "a_is_locked",
      (SELECT COUNT(*)::int * 100 FROM assignment_questions WHERE assignment_id = a.id) AS "a_total_points"
    FROM assignments a
    JOIN course_enrollments ce ON ce.course_id = a.course_id AND ce.user_id = :userId
    LEFT JOIN assignment_grades ag ON ag.assignment_id = a.id AND ag.user_id = :userId
    WHERE a.kind = 'assignment'
    ORDER BY ag.graded_at DESC NULLS LAST, a.id
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { userId },
    }
  );
  return (rows || []).map((r) => ({
    assignment_id: r.assignment_id,
    user_id: r.user_id,
    raw_score: Number(r.raw_score) || 0,
    max_score: Number(r.max_score) || 0,
    penalty_percent: Number(r.penalty_percent) || 0,
    final_score: Number(r.final_score) || 0,
    graded_at: r.graded_at,
    graded_by: r.graded_by ?? null,
    Assignment: {
      id: r.a_id,
      title: r.a_title,
      course_id: r.a_course_id,
      description: r.a_description,
      kind: r.a_kind,
      due_date: r.a_due_date,
      is_locked: r.a_is_locked,
      total_points: r.a_total_points,
    },
  }));
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

/**
 * Insert 0 grades for unlocked (published) assignments where the student has
 * no grade and no submissions. Ensures unattempted unlocked work appears as 0
 * in the gradebook and in dashboard grade calculations.
 */
export async function ensureZeroGradesForUnlocked({ userId }) {
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
      LEFT JOIN assignment_grades ag
        ON ag.assignment_id = a.id AND ag.user_id = :userId
      LEFT JOIN submitted_assignments sa
        ON sa.assignment_id = a.id
      WHERE a.kind = 'assignment'
        AND a.is_locked = false
        AND ag.assignment_id IS NULL
        AND sa.assignment_id IS NULL
      ON CONFLICT (assignment_id, user_id) DO NOTHING
    `,
    {
      type: QueryTypes.INSERT,
      replacements: { userId },
    }
  );
}
