import { QueryTypes } from 'sequelize';
import {
  Accommodation,
  Assignment,
  AssignmentExtension,
  AssignmentGrade,
  AssignmentQuestion,
} from '../models/index.js';
import { sequelize } from '../config/sequelize.js';
import { EFFECTIVE_DUE_SQL, computeDeadlinePolicy } from './assignmentPolicy.js';
import { EFFECTIVELY_PUBLISHED_SQL, isAssignmentLocked } from './publicationPolicy.js';

const toNumber = (value) => (value === null || value === undefined ? 0 : Number(value));

// first key of the per student lock in postgres's two int advisory key space
const STUDENT_GRADE_LOCK_SPACE = 1;
const GRADE_UPDATE_FIELDS = ['raw_score', 'max_score', 'penalty_percent', 'final_score', 'graded_at', 'graded_by'];

// a missing transaction would silently release the xact locks and borrow a second pool connection
function requireTransaction(transaction) {
  if (!transaction) {
    throw new Error('grade writes require a transaction');
  }
}

/*
student level writers share each assignment lock in id order then take the student lock
assignment level writers take the assignment lock exclusively
one global order means lock waits can't form a cycle
*/
export async function lockStudentGrades({ assignmentIds, userId, transaction }) {
  requireTransaction(transaction);
  const ids = [...new Set(assignmentIds.map(Number))].sort((a, b) => a - b);
  if (ids.length) {
    // postgres runs volatile select items after order by so these lock in id order
    await sequelize.query(
      'SELECT pg_advisory_xact_lock_shared(t.id::bigint) FROM unnest(ARRAY[:ids]::int[]) AS t(id) ORDER BY t.id',
      { type: QueryTypes.SELECT, replacements: { ids }, transaction }
    );
  }
  await sequelize.query('SELECT pg_advisory_xact_lock(:space, :userId)', {
    type: QueryTypes.SELECT,
    replacements: { space: STUDENT_GRADE_LOCK_SPACE, userId: Number(userId) },
    transaction,
  });
}

export async function lockAssignmentGrades({ assignmentId, transaction }) {
  requireTransaction(transaction);
  await sequelize.query('SELECT pg_advisory_xact_lock(:assignmentId::bigint)', {
    type: QueryTypes.SELECT,
    replacements: { assignmentId: Number(assignmentId) },
    transaction,
  });
}

// locks before the write so it never holds a row that a lock holder is waiting on
export async function writeStudentGrades({ assignmentIds, userId, transaction }, write) {
  await lockStudentGrades({ assignmentIds, userId, transaction });
  const result = await write();
  await recomputeAssignmentGrades({ assignmentIds, userIds: [userId], transaction });
  return result;
}

/*
recomputes persisted grades for these assignments in a fixed number of queries
null userIds means everyone holding a grade or a submission on them
assignments without questions lose their grades and students with neither get none
*/
export async function recomputeAssignmentGrades({ assignmentIds, userIds = null, transaction }) {
  requireTransaction(transaction);
  if (!assignmentIds.length || userIds?.length === 0) return [];
  const byUser = userIds ? { user_id: userIds } : {};

  const assignments = await Assignment.findAll({
    where: { id: assignmentIds },
    attributes: ['id', 'course_id', 'due_date', 'late_window_days', 'late_penalty_percent'],
    transaction,
  });
  if (!assignments.length) return [];

  const questions = await AssignmentQuestion.findAll({
    where: { assignment_id: assignments.map((assignment) => assignment.id) },
    attributes: ['id', 'assignment_id'],
    transaction,
  });
  const questionCountByAssignment = new Map(assignments.map((assignment) => [assignment.id, 0]));
  const assignmentIdByQuestion = new Map();
  for (const question of questions) {
    questionCountByAssignment.set(
      question.assignment_id,
      questionCountByAssignment.get(question.assignment_id) + 1
    );
    assignmentIdByQuestion.set(question.id, question.assignment_id);
  }

  const emptyAssignmentIds = assignments
    .filter((assignment) => !questionCountByAssignment.get(assignment.id))
    .map((assignment) => assignment.id);
  if (emptyAssignmentIds.length) {
    await AssignmentGrade.destroy({
      where: { assignment_id: emptyAssignmentIds, ...byUser },
      transaction,
    });
  }
  const gradable = assignments.filter((assignment) => questionCountByAssignment.get(assignment.id));
  if (!gradable.length) return [];
  const gradableIds = gradable.map((assignment) => assignment.id);

  // earliest submission reaching each question's best score decides lateness
  const bestRows = await sequelize.query(
    `
      SELECT DISTINCT ON (user_id, assignment_question_id)
        user_id,
        assignment_question_id,
        score AS best_score,
        submitted_at AS best_submitted_at
      FROM submissions
      WHERE assignment_question_id IN (:questionIds)
        ${userIds ? 'AND user_id IN (:userIds)' : ''}
      ORDER BY user_id, assignment_question_id, score DESC, submitted_at ASC, id ASC
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { questionIds: [...assignmentIdByQuestion.keys()], userIds },
      transaction,
    }
  );
  const existing = await AssignmentGrade.findAll({
    where: { assignment_id: gradableIds, ...byUser },
    attributes: ['assignment_id', 'user_id'],
    transaction,
  });

  const pairs = new Map();
  const pairFor = (assignmentId, userId) => {
    const key = `${assignmentId}:${userId}`;
    if (!pairs.has(key)) {
      pairs.set(key, { assignmentId, userId, rawScore: 0, latestBestAt: null });
    }
    return pairs.get(key);
  };
  for (const grade of existing) {
    pairFor(grade.assignment_id, grade.user_id);
  }
  for (const row of bestRows) {
    const pair = pairFor(assignmentIdByQuestion.get(row.assignment_question_id), row.user_id);
    pair.rawScore += toNumber(row.best_score);
    if (row.best_submitted_at) {
      const submittedAt = new Date(row.best_submitted_at);
      if (!pair.latestBestAt || submittedAt > pair.latestBestAt) {
        pair.latestBestAt = submittedAt;
      }
    }
  }
  if (!pairs.size) return [];

  const studentIds = [...new Set([...pairs.values()].map((pair) => pair.userId))];
  const extensions = await AssignmentExtension.findAll({
    where: { assignment_id: gradableIds, user_id: studentIds },
    attributes: ['assignment_id', 'user_id', 'extended_due_date'],
    transaction,
  });
  const accommodations = await Accommodation.findAll({
    where: {
      course_id: [...new Set(gradable.map((assignment) => assignment.course_id))],
      user_id: studentIds,
    },
    attributes: ['course_id', 'user_id', 'extra_late_days', 'late_penalty_waived'],
    transaction,
  });
  const assignmentById = new Map(gradable.map((assignment) => [assignment.id, assignment]));
  const extensionByKey = new Map(
    extensions.map((extension) => [`${extension.assignment_id}:${extension.user_id}`, extension])
  );
  const accommodationByKey = new Map(
    accommodations.map((accommodation) => [`${accommodation.course_id}:${accommodation.user_id}`, accommodation])
  );

  const gradedAt = new Date();
  const rows = [...pairs.entries()].map(([key, pair]) => {
    const assignment = assignmentById.get(pair.assignmentId);
    const policy = computeDeadlinePolicy({
      assignment,
      extension: extensionByKey.get(key) ?? null,
      accommodation: accommodationByKey.get(`${assignment.course_id}:${pair.userId}`) ?? null,
    });
    const isLate = policy.due_at && pair.latestBestAt && pair.latestBestAt > policy.due_at;
    const penaltyPercent = isLate ? policy.late_penalty_percent ?? 0 : 0;
    return {
      assignment_id: pair.assignmentId,
      user_id: pair.userId,
      raw_score: pair.rawScore,
      max_score: questionCountByAssignment.get(pair.assignmentId) * 100,
      penalty_percent: penaltyPercent,
      final_score: Math.max(0, Math.round(pair.rawScore * (1 - penaltyPercent / 100))),
      graded_at: gradedAt,
      graded_by: null,
    };
  });
  // a fixed row order keeps concurrent upserts from locking rows in different orders
  rows.sort((a, b) => a.assignment_id - b.assignment_id || a.user_id - b.user_id);

  return AssignmentGrade.bulkCreate(rows, {
    conflictAttributes: ['assignment_id', 'user_id'],
    updateOnDuplicate: GRADE_UPDATE_FIELDS,
    transaction,
  });
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
      a.publish_at AS "a_publish_at",
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
  return (rows || []).map((r) => {
    const assignment = {
      id: r.a_id,
      title: r.a_title,
      course_id: r.a_course_id,
      description: r.a_description,
      kind: r.a_kind,
      due_date: r.a_due_date,
      is_locked: r.a_is_locked,
      publish_at: r.a_publish_at,
      total_points: r.a_total_points,
    };
    assignment.is_locked = isAssignmentLocked(assignment);
    return {
      assignment_id: r.assignment_id,
      user_id: r.user_id,
      raw_score: Number(r.raw_score) || 0,
      max_score: Number(r.max_score) || 0,
      penalty_percent: Number(r.penalty_percent) || 0,
      final_score: Number(r.final_score) || 0,
      graded_at: r.graded_at,
      graded_by: r.graded_by ?? null,
      Assignment: assignment,
    };
  });
}

export async function ensureZeroGradesForPastDue({ userId }) {
  if (!userId) return;
  await sequelize.transaction(async (transaction) => {
    // without the locks a question change can regrade around this insert and leave a stale max_score
    const assignments = await sequelize.query(
      `
        SELECT a.id
        FROM assignments a
        JOIN course_enrollments ce ON ce.course_id = a.course_id AND ce.user_id = :userId
        WHERE a.kind = 'assignment'
          AND a.due_date IS NOT NULL
      `,
      { type: QueryTypes.SELECT, replacements: { userId }, transaction }
    );
    if (!assignments.length) return;
    await lockStudentGrades({
      assignmentIds: assignments.map((assignment) => assignment.id),
      userId,
      transaction,
    });
    await insertPastDueZeroGrades({ userId, transaction });
  });
}

function insertPastDueZeroGrades({ userId, transaction }) {
  return sequelize.query(
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
        AND ${EFFECTIVELY_PUBLISHED_SQL}
        AND ag.assignment_id IS NULL
        AND sa.assignment_id IS NULL
        AND NOW() > ${EFFECTIVE_DUE_SQL}
      ON CONFLICT (assignment_id, user_id) DO NOTHING
    `,
    {
      type: QueryTypes.INSERT,
      replacements: { userId },
      transaction,
    }
  );
}

