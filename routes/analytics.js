import express from 'express';
import { Op } from 'sequelize';
import {
  Accommodation,
  Assignment,
  AssignmentExtension,
  AssignmentGrade,
  AssignmentQuestion,
  CourseEnrollment,
  User,
  sequelize,
} from '../models/index.js';
import { handleValidationResult } from '../middleware/validation.js';
import {
  courseIdOptionalParam,
  courseIdParam,
  dropLowestNParam,
  userIdParam,
} from '../validators/analytics.js';
import {
  fetchAssignmentAnalytics,
  fetchStudentAssignments,
  fetchStudentPerformance,
  fetchStudentSubmissionCount,
  fetchStudentSubmittedAssignments,
  fetchStudentTime,
  fetchAssignmentGradeSummary,
  fetchInstructorAssignmentStats,
  fetchInstructorGradeSummary,
  fetchInstructorTimeByCategory,
} from '../queries/analytics.js';
import { computeDeadlinePolicy } from '../utils/assignmentPolicy.js';
import { ensureSelfOrAdmin, isSystemAdmin } from '../utils/authorization.js';
import { requireInstructorOrAdmin } from './instructor.js';

const router = express.Router();

/**
 * Parse a due date from DB/driver into a Date (UTC instant).
 * Handles Date objects and strings including "YYYY-MM-DD HH:mm:ss.fff -0500"
 * so that 21:29 Eastern is not misinterpreted as server-local 21:29.
 */
function parseDueDate(value) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== 'string') return new Date(value);
  // Normalize to ISO 8601: "2026-01-31 21:29:00.000 -0500" -> "2026-01-31T21:29:00.000-05:00"
  let s = value.trim().replace(/^\s*(\d{4}-\d{2}-\d{2})\s+(\d)/, '$1T$2');
  const tzMatch = s.match(/([+-])(\d{2})(\d{2})\s*$/);
  if (tzMatch) {
    s = s.replace(/\s*[+-]\d{4}\s*$/, `${tzMatch[1]}${tzMatch[2]}:${tzMatch[3]}`);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

router.get('/assignments', [courseIdOptionalParam, handleValidationResult], async (req, res, next) => {
  try {
    const { courseId } = req.query;
    if (courseId) {
      if (!(await requireInstructorOrAdmin(courseId, req.user.id))) {
        return res.status(403).json({ message: 'Instructor or admin access required' });
      }
    } else if (!isSystemAdmin(req.user)) {
      return res.status(403).json({ message: 'Instructor or admin access required' });
    }
    const rows = await fetchAssignmentAnalytics(sequelize, courseId ?? null);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

/**
 * Student dashboard analytics for a course (or all enrolled courses if courseId omitted):
 * assignment status counts, per-assignment grade rows, submission performance, time-on-task
 * (avg / median / p75 / cohort median), and submission counts.
 * Query: userId (required), courseId (optional).
 */
router.get(
  '/student-dashboard',
  [userIdParam, courseIdOptionalParam, handleValidationResult],
  async (req, res, next) => {
  try {
    const { userId } = req.query;
    const courseId = req.query.courseId ?? null;
    if (!ensureSelfOrAdmin(req, res, userId)) {
      return;
    }

    const [assignments, performance, submissionCount, submittedAssignments, time] = await Promise.all([
      fetchStudentAssignments(sequelize, userId, courseId),
      fetchStudentPerformance(sequelize, userId, courseId),
      fetchStudentSubmissionCount(sequelize, userId, courseId),
      fetchStudentSubmittedAssignments(sequelize, userId, courseId),
      fetchStudentTime(sequelize, userId, courseId),
    ]);

    const now = new Date();
    let upcoming = 0;
    let pending = 0;
    let overdue = 0;
    let pastDueDateCount = 0;

    const upcomingWindowEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const upcomingList = assignments
      .map((assignment) => {
        const dueAtValue = assignment.due_at ?? assignment.due_date ?? null;
        const dueDate = parseDueDate(dueAtValue);
        const isComplete = Boolean(assignment.grade_id);
        const lateWindow = assignment.late_window_days || 0;
        const graceEnd = dueDate ? new Date(dueDate.getTime() + lateWindow * 24 * 60 * 60 * 1000) : null;

        let status = 'upcoming';
        if (isComplete) {
          status = 'completed';
        } else if (dueDate && graceEnd && now > graceEnd) {
          status = 'overdue';
        } else if (dueDate && now > dueDate) {
          status = 'pending';
        }

        if (dueDate && now > dueDate) pastDueDateCount += 1;

        if (!isComplete) {
          if (status === 'upcoming') upcoming += 1;
          if (status === 'pending') pending += 1;
          if (status === 'overdue') overdue += 1;
        }

        return {
          id: assignment.id,
          title: assignment.title,
          course_id: assignment.course_id,
          due_date: assignment.due_date,
          due_at: assignment.due_at ?? assignment.due_date ?? null,
          is_locked: assignment.is_locked,
          total_points: assignment.total_points,
          status,
        };
      })
      .filter((item) => {
        const dueDate = parseDueDate(item.due_at ?? item.due_date);
        if (!dueDate) return false;
        return dueDate >= now && dueDate <= upcomingWindowEnd;
      })
      .filter((item) => !item.is_locked)
      .sort((a, b) => {
        const aDate = parseDueDate(a.due_at ?? a.due_date);
        const bDate = parseDueDate(b.due_at ?? b.due_date);
        if (aDate && bDate) return aDate - bDate;
        if (aDate) return -1;
        if (bDate) return 1;
        return (a.id ?? 0) - (b.id ?? 0);
      })
      .slice(0, 4);

    const assignmentGrades = assignments.map((a) => ({
      assignment_id: a.id,
      final_score: a.final_score ?? 0,
      max_score: a.max_score ?? a.total_points ?? 0,
      raw_score: a.final_score ?? 0,
      graded_at: a.graded_at,
      Assignment: {
        id: a.id,
        title: a.title,
        is_locked: a.is_locked,
        due_at: a.due_at ?? a.due_date,
        due_date: a.due_date,
      },
    }));

    const safeTime = {
      avg_minutes_per_question: null,
      median_minutes_per_question: null,
      p75_minutes_per_question: null,
      cohort_median_minutes_per_question: null,
      ...(time || {}),
    };

    res.json({
      assignments: {
        upcoming,
        pending,
        overdue,
        pastDueDateCount,
        total: assignments.length,
        upcomingList,
      },
      assignmentGrades,
      performance: performance || {
        avg_score: null,
        avg_attempt: null,
        correct_rate: null,
        first_try_correct_rate: null,
      },
      time: safeTime,
      submissionCount: submissionCount?.submission_count || 0,
      submittedAssignmentIds: submittedAssignments || [],
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Instructor dashboard analytics for one course: class grade summary, per-assignment
 * submission stats (scores, attempts, correctness, time per question, difficulty hints),
 * and average time-on-task by problem category.
 * Query: courseId (required).
 */
router.get('/instructor-dashboard', [courseIdParam, handleValidationResult], async (req, res, next) => {
  try {
    const { courseId } = req.query;
    if (!(await requireInstructorOrAdmin(courseId, req.user.id))) {
      return res.status(403).json({ message: 'Instructor or admin access required' });
    }

    const gradeSummary = await fetchInstructorGradeSummary(sequelize, courseId);
    const assignmentStats = await fetchInstructorAssignmentStats(sequelize, courseId);
    const timeByCategory = await fetchInstructorTimeByCategory(sequelize, courseId);

    res.json({
      gradeSummary,
      assignmentStats,
      timeByCategory,
    });
  } catch (error) {
    next(error);
  }
});

router.get(
  '/gradebook',
  [courseIdParam, dropLowestNParam, handleValidationResult],
  async (req, res, next) => {
  try {
    const { courseId } = req.query;
    if (!(await requireInstructorOrAdmin(courseId, req.user.id))) {
      return res.status(403).json({ message: 'Instructor or admin access required' });
    }
    const dropLowestN = req.query.dropLowestN ?? 0;
    // assignment list + per-student stats together

    const assignments = await fetchGradebookAssignments(courseId);
    const enrollments = await fetchGradebookEnrollments(courseId);

    const assignmentMeta = buildAssignmentMeta(assignments);

    const students = await buildGradebookStudents(
      assignments,
      enrollments,
      dropLowestN,
      courseId
    );

    res.json({
      assignments: assignmentMeta,
      students,
    });
  } catch (error) {
    next(error);
  }
});

router.get(
  '/gradebook/assignments',
  [courseIdParam, handleValidationResult],
  async (req, res, next) => {
  try {
    const { courseId } = req.query;
    if (!(await requireInstructorOrAdmin(courseId, req.user.id))) {
      return res.status(403).json({ message: 'Instructor or admin access required' });
    }

    //  list of assignment records for headers/columns
    const assignments = await fetchGradebookAssignments(courseId);

    res.json(buildAssignmentMeta(assignments));
  } catch (error) {
    next(error);
  }
});

router.get(
  '/gradebook/students',
  [courseIdParam, dropLowestNParam, handleValidationResult],
  async (req, res, next) => {
  try {
    const { courseId } = req.query;
    if (!(await requireInstructorOrAdmin(courseId, req.user.id))) {
      return res.status(403).json({ message: 'Instructor or admin access required' });
    }
    const dropLowestN = req.query.dropLowestN ?? 0;

    // student rows + per-assignment scores
    const assignments = await fetchGradebookAssignments(courseId);
    const enrollments = await fetchGradebookEnrollments(courseId);

    const students = await buildGradebookStudents(
      assignments,
      enrollments,
      dropLowestN,
      courseId
    );
    res.json(students);
  } catch (error) {
    next(error);
  }
});

// same policy as your grade: unlocked only, drop two lowest when three or more (not when two)
async function computeClassAvgWithDrop(courseId, rows) {
  const unlocked = (rows || []).filter((r) => r.is_locked === false);
  const unlockedIds = unlocked.map((r) => r.id);
  if (unlockedIds.length === 0) return null;

  // with 1 or 2 unlocked there is no drop: use assignment-level avg_percent (same as before)
  if (unlocked.length < 3) {
    const vals = unlocked
      .map((r) => r.avg_percent)
      .filter((v) => v != null && v !== undefined);
    if (vals.length === 0) return null;
    return (vals.reduce((s, v) => s + v, 0) / vals.length) * 100;
  }

  const enrollments = await CourseEnrollment.findAll({
    where: { course_id: courseId, role: 'student' },
    attributes: ['user_id'],
  });
  const studentIds = enrollments.map((e) => e.user_id);
  if (studentIds.length === 0) return null;

  const grades = await AssignmentGrade.findAll({
    where: {
      assignment_id: unlockedIds,
      user_id: studentIds,
    },
    attributes: ['user_id', 'assignment_id', 'final_score', 'max_score'],
  });

  const gradeByKey = new Map(
    grades.map((g) => [
      `${g.user_id}-${g.assignment_id}`,
      g.max_score > 0 ? (g.final_score / g.max_score) * 100 : 0,
    ])
  );

  let sum = 0;
  let count = 0;
  for (const e of enrollments) {
    const uid = e.user_id;
    const percents = unlockedIds.map(
      (aid) => gradeByKey.get(`${uid}-${aid}`) ?? 0
    );
    const hasAnyGrade = percents.some((p) => p > 0);
    if (!hasAnyGrade) continue;
    // percents only from unlocked assignments, dropped ones are always unlocked
    const sorted = percents.slice().sort((a, b) => a - b);
    const afterDrop = sorted.slice(2);
    const studentAvg =
      afterDrop.length > 0
        ? afterDrop.reduce((s, p) => s + p, 0) / afterDrop.length
        : 0;
    sum += studentAvg;
    count += 1;
  }
  return count > 0 ? sum / count : null;
}

router.get('/gradebook-summary', [courseIdParam, handleValidationResult], async (req, res, next) => {
  try {
    const courseId = Number(req.query.courseId);
    const userId = Number(req.user?.id);
    if (!Number.isInteger(courseId) || courseId < 1 || !Number.isInteger(userId)) {
      return res.status(400).json({ message: 'Invalid courseId or user' });
    }
    const enrollment = await CourseEnrollment.findOne({
      where: { course_id: courseId, user_id: userId },
    });
    if (!enrollment && !isSystemAdmin(req.user)) {
      return res.status(403).json({ message: 'Enrollment required' });
    }
    const rows = await fetchAssignmentGradeSummary(sequelize, courseId);
    const class_avg_with_drop = await computeClassAvgWithDrop(courseId, rows);
    res.json({
      assignments: rows,
      class_avg_with_drop: class_avg_with_drop != null ? class_avg_with_drop : null,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Returns grades from DB plus synthetic 0 grades for (user, assignment) where
 * the student has no grade and either the assignment is unlocked or past cutoff.
 * No DB writes.
 */
async function effectiveGradesForGradebook(assignments, enrollments, grades, courseId) {
  const assignmentIds = assignments.map((a) => a.id);
  const userIds = enrollments.map((e) => e.user_id);
  if (!assignmentIds.length || !userIds.length) return grades;

  const hasGrade = new Set(
    grades.map((g) => `${g.user_id}-${g.assignment_id}`)
  );

  const [extensions, accommodations] = await Promise.all([
    AssignmentExtension.findAll({
      where: {
        assignment_id: assignmentIds,
        user_id: userIds,
      },
      attributes: ['assignment_id', 'user_id', 'extended_due_date'],
    }),
    Accommodation.findAll({
      where: { course_id: courseId, user_id: userIds },
      attributes: ['user_id', 'extra_late_days'],
    }),
  ]);

  const extensionByKey = new Map(
    extensions.map((e) => [`${e.assignment_id}-${e.user_id}`, e])
  );
  const accommodationByUser = new Map(
    accommodations.map((a) => [a.user_id, a])
  );

  const now = new Date();
  const synthetic = [];

  for (const enrollment of enrollments) {
    const userId = enrollment.user_id;
    const accommodation = accommodationByUser.get(userId) ?? null;

    for (const assignment of assignments) {
      if (hasGrade.has(`${userId}-${assignment.id}`)) continue;

      const isUnlocked = assignment.is_locked === false;
      let includeAsZero = isUnlocked;

      if (!includeAsZero && assignment.due_date) {
        const extension = extensionByKey.get(`${assignment.id}-${userId}`) ?? null;
        const policy = computeDeadlinePolicy({
          assignment: { due_date: assignment.due_date, late_window_days: assignment.late_window_days },
          extension,
          accommodation,
        });
        includeAsZero = policy.cutoff_at != null && now > policy.cutoff_at;
      }

      if (!includeAsZero) continue;

      synthetic.push({
        user_id: userId,
        assignment_id: assignment.id,
        final_score: 0,
        max_score: assignment.total_points ?? 0,
      });
    }
  }

  return [...grades, ...synthetic];
}

async function buildGradebookStudents(assignments, enrollments, dropLowestN, courseId) {
  const assignmentIds = assignments.map((assignment) => assignment.id);
  const userIds = enrollments.map((enrollment) => enrollment.user_id);

  const gradesFromDb =
    assignmentIds.length && userIds.length
      ? await AssignmentGrade.findAll({
          where: { assignment_id: assignmentIds, user_id: userIds },
        })
      : [];

  const grades = await effectiveGradesForGradebook(
    assignments,
    enrollments,
    gradesFromDb,
    courseId
  );

  return computeGradebookStudents(assignments, enrollments, grades, dropLowestN);
}

async function attachDerivedPoints(assignments) {
  const assignmentIds = assignments.map((assignment) => assignment.id);
  if (!assignmentIds.length) return assignments;
  const rows = await AssignmentQuestion.findAll({
    where: { assignment_id: assignmentIds },
    attributes: [
      'assignment_id',
      [sequelize.fn('COUNT', sequelize.col('id')), 'question_count'],
    ],
    group: ['assignment_id'],
    raw: true,
  });
  const countMap = new Map(
    rows.map((row) => [Number(row.assignment_id), Number(row.question_count) || 0])
  );
  assignments.forEach((assignment) => {
    const count = countMap.get(assignment.id) ?? 0;
    assignment.setDataValue('total_points', count * 100);
  });
  return assignments;
}

async function fetchGradebookAssignments(courseId) {
  const assignments = await Assignment.findAll({
    where: { course_id: courseId, kind: 'assignment' },
    order: [['due_date', 'ASC'], ['id', 'ASC']],
  });
  return attachDerivedPoints(assignments);
}

function fetchGradebookEnrollments(courseId) {
  return CourseEnrollment.findAll({
    where: {
      course_id: courseId,
      role: { [Op.in]: ['student', 'ta'] },
    },
    attributes: ['id', 'user_id', 'course_id', 'role'],
    include: [{ model: User, attributes: ['id', 'username'] }],
    order: [[User, 'username', 'ASC']],
  });
}

function buildAssignmentMeta(assignments) {
  return assignments.map((assignment) => ({
    id: assignment.id,
    title: assignment.title,
    total_points: assignment.total_points,
    due_date: assignment.due_date,
    due_at: assignment.due_at ?? assignment.due_date ?? null,
  }));
}

export function computeGradebookStudents(assignments, enrollments, grades, dropLowestN) {
  const gradeMap = new Map();
  grades.forEach((grade) => {
    if (!gradeMap.has(grade.user_id)) {
      gradeMap.set(grade.user_id, new Map());
    }
    gradeMap.get(grade.user_id).set(grade.assignment_id, grade);
  });

  return enrollments.map((enrollment) => {
    const user = enrollment.User;
    const perAssignment = assignments.map((assignment) => {
      const grade = gradeMap.get(user.id)?.get(assignment.id) || null;
      const maxScore = Number(
        grade?.max_score ?? assignment.total_points ?? 0
      );
      const finalScore = Number(grade?.final_score ?? 0);
      const percent = maxScore > 0 ? finalScore / maxScore : 0;

      return {
        assignment_id: assignment.id,
        title: assignment.title,
        final_score: finalScore,
        max_score: maxScore,
        percent,
        has_grade: Boolean(grade),
        has_submission: Boolean(grade?.id),
      };
    });

    const totalScore = perAssignment.reduce((sum, item) => sum + item.final_score, 0);
    const totalPoints = perAssignment.reduce((sum, item) => sum + item.max_score, 0);
    const averagePercent = totalPoints > 0 ? totalScore / totalPoints : null;

    const dropCount = Math.min(dropLowestN, perAssignment.length);
    const remaining = perAssignment
      .slice()
      .sort((a, b) => a.percent - b.percent || a.assignment_id - b.assignment_id)
      .slice(dropCount);
    const droppedTotalScore = remaining.reduce((sum, item) => sum + item.final_score, 0);
    const droppedTotalPoints = remaining.reduce((sum, item) => sum + item.max_score, 0);
    const droppedAveragePercent = droppedTotalPoints > 0
      ? droppedTotalScore / droppedTotalPoints
      : null;

    const rawRole = enrollment.dataValues?.role ?? enrollment.get?.('role') ?? enrollment.role;
    const role = String(rawRole).toLowerCase() === 'ta' ? 'ta' : 'student';
    return {
      user_id: user.id,
      username: user.username,
      role,
      totals: {
        total_score: totalScore,
        total_points: totalPoints,
        average_percent: averagePercent,
      },
      dropped: {
        drop_lowest_n: dropCount,
        total_score: droppedTotalScore,
        total_points: droppedTotalPoints,
        average_percent: droppedAveragePercent,
      },
      assignments: perAssignment,
    };
  });
}

export default router;
