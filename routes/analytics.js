import express from 'express';
import { Op } from 'sequelize';
import {
  Accommodation,
  Assignment,
  AssignmentExtension,
  AssignmentGrade,
  AssignmentQuestion,
  CourseEnrollment,
  Submission,
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
import { isAssignmentLocked } from '../utils/publicationPolicy.js';
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

/*
student dashboard analytics for a course or all courses when omitted
completion requires a submission to every current question regardless of score
empty and unpublished assignments do not count as completed
access failures reject the request and database failures pass to error handling
*/
router.get(
  ['/student', '/student-dashboard'],
  [userIdParam, courseIdOptionalParam, handleValidationResult],
  async (req, res, next) => {
  try {
    const { userId } = req.query;
    const courseId = req.query.courseId ?? null;
    if (!ensureSelfOrAdmin(req, res, userId)) {
      return;
    }

    const [assignmentsRaw, performance, submissionCount, submittedAssignments, time] = await Promise.all([
      fetchStudentAssignments(sequelize, userId, courseId),
      fetchStudentPerformance(sequelize, userId, courseId),
      fetchStudentSubmissionCount(sequelize, userId, courseId),
      fetchStudentSubmittedAssignments(sequelize, userId, courseId),
      fetchStudentTime(sequelize, userId, courseId),
    ]);
    // keep locked assignments out of view for students in assignments page
    let assignments = (assignmentsRaw || []).map((assignment) => ({
      ...assignment,
      is_locked: isAssignmentLocked(assignment),
    }));
    if (!isSystemAdmin(req.user)) {
      const staffEnrollments = await CourseEnrollment.findAll({
        where: { user_id: userId, role: { [Op.in]: ['instructor', 'ta'] } },
        attributes: ['course_id'],
      });
      const staffCourseIds = new Set(staffEnrollments.map((e) => e.course_id));
      assignments = assignments.filter((assignment) => (
        !assignment.is_locked || staffCourseIds.has(assignment.course_id)
      ));
    }

    const dashAssignmentIds = assignments.map((a) => a.id);
    const [dashExtensions, dashAccommodations, submissionCounts] = await Promise.all([
      dashAssignmentIds.length
        ? AssignmentExtension.findAll({
            where: { assignment_id: dashAssignmentIds, user_id: userId },
            attributes: ['assignment_id', 'extended_due_date'],
          })
        : [],
      Accommodation.findAll({
        where: { user_id: userId },
        attributes: ['course_id', 'extra_late_days'],
      }),
      fetchAssignmentSubmissionCounts(dashAssignmentIds, [userId]),
    ]);
    const completedAssignmentIds = new Set(assignments
      .filter((assignment) => (
        !assignment.is_locked && Number(assignment.question_count) > 0 &&
        submissionCounts.get(`${userId}:${assignment.id}`) === Number(assignment.question_count)
      ))
      .map((assignment) => assignment.id));

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
        const isComplete = completedAssignmentIds.has(assignment.id);
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

    const extensionByAssignment = new Map(
      dashExtensions.map((e) => [e.assignment_id, e])
    );
    const accommodationByCourse = new Map(
      dashAccommodations.map((a) => [a.course_id, a])
    );

    const assignmentGrades = assignments.map((a) => {
      const policy = computeDeadlinePolicy({
        assignment: {
          due_date: a.due_at ?? a.due_date,
          late_window_days: a.late_window_days,
        },
        extension: extensionByAssignment.get(a.id) ?? null,
        accommodation: accommodationByCourse.get(a.course_id) ?? null,
      });
      return {
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
          late_window_days: a.late_window_days ?? null,
          // computed server side so clients never reimplement the cutoff
          cutoff_at: policy.cutoff_at ?? null,
        },
      };
    });

    const safeTime = {
      avg_minutes_per_question: null,
      median_minutes_per_question: null,
      p75_minutes_per_question: null,
      cohort_median_minutes_per_question: null,
      ...(time || {}),
    };

    res.json({
      assignments: {
        completed: completedAssignmentIds.size,
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
router.get(['/instructor', '/instructor-dashboard'], [courseIdParam, handleValidationResult], async (req, res, next) => {
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
    const dropLowestN = req.query.dropLowestN ?? 2;
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
    const dropLowestN = req.query.dropLowestN ?? 2;

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

// class average over each student's past-cutoff work, missing counts as zero, two lowest drop
export async function computeClassAvgWithDrop(courseId, rows) {
  const now = new Date();
  const unlocked = (rows || []).filter((row) => !isAssignmentLocked(row));
  if (unlocked.length === 0) return null;

  const enrollments = await CourseEnrollment.findAll({
    where: { course_id: courseId, role: 'student' },
    attributes: ['user_id'],
  });
  const studentIds = enrollments.map((e) => e.user_id);
  if (studentIds.length === 0) return null;

  const assignmentIds = unlocked.map((row) => row.id);
  const [grades, extensions, accommodations] = await Promise.all([
    AssignmentGrade.findAll({
      where: { assignment_id: assignmentIds, user_id: studentIds },
      attributes: ['user_id', 'assignment_id', 'final_score', 'max_score'],
    }),
    AssignmentExtension.findAll({
      where: { assignment_id: assignmentIds, user_id: studentIds },
      attributes: ['assignment_id', 'user_id', 'extended_due_date'],
    }),
    Accommodation.findAll({
      where: { course_id: courseId, user_id: studentIds },
      attributes: ['user_id', 'extra_late_days'],
    }),
  ]);

  const gradeByKey = new Map(
    grades.map((g) => [
      `${g.user_id}-${g.assignment_id}`,
      g.max_score > 0 ? (g.final_score / g.max_score) * 100 : 0,
    ])
  );
  const extensionByKey = new Map(
    extensions.map((e) => [`${e.assignment_id}-${e.user_id}`, e])
  );
  const accommodationByUser = new Map(
    accommodations.map((a) => [a.user_id, a])
  );

  let sum = 0;
  let count = 0;
  for (const enrollment of enrollments) {
    const userId = enrollment.user_id;
    const accommodation = accommodationByUser.get(userId) ?? null;
    const percents = [];

    for (const assignment of unlocked) {
      // an assignment with no questions has nothing to score against
      if (!(Number(assignment.total_points) > 0)) continue;
      const policy = computeDeadlinePolicy({
        assignment: {
          due_date: assignment.due_at ?? assignment.due_date,
          late_window_days: assignment.late_window_days,
        },
        extension: extensionByKey.get(`${assignment.id}-${userId}`) ?? null,
        accommodation,
      });
      if (!policy.cutoff_at || now <= policy.cutoff_at) continue;
      percents.push(gradeByKey.get(`${userId}-${assignment.id}`) ?? 0);
    }

    if (percents.length === 0) continue;
    const sorted = percents.slice().sort((a, b) => a - b);
    const afterDrop = sorted.length >= 3 ? sorted.slice(2) : sorted;
    sum += afterDrop.reduce((s, p) => s + p, 0) / afterDrop.length;
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
    const effectiveRows = rows.map((row) => ({
      ...row,
      is_locked: isAssignmentLocked(row),
    }));
    const class_avg_with_drop = await computeClassAvgWithDrop(courseId, effectiveRows);
    const canSeeLocked = isSystemAdmin(req.user)
      || enrollment?.role === 'instructor'
      || enrollment?.role === 'ta';
    const visibleRows = canSeeLocked
      ? effectiveRows
      : effectiveRows.filter((row) => !row.is_locked);
    res.json({
      assignments: visibleRows,
      class_avg_with_drop: class_avg_with_drop != null ? class_avg_with_drop : null,
    });
  } catch (error) {
    next(error);
  }
});

// stored grades plus in-memory zeros past each student's own cutoff, no db writes
export async function effectiveGradesForGradebook(assignments, enrollments, grades, courseId) {
  const assignmentIds = assignments.map((a) => a.id);
  const userIds = enrollments.map((e) => e.user_id);
  if (!assignmentIds.length || !userIds.length) {
    return { grades, eligibleGradeKeys: new Set() };
  }

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
  const eligibleGradeKeys = new Set();

  for (const enrollment of enrollments) {
    const userId = enrollment.user_id;
    const accommodation = accommodationByUser.get(userId) ?? null;

    for (const assignment of assignments) {
      if (!assignment.due_date || isAssignmentLocked(assignment)) continue;

      const gradeKey = `${userId}-${assignment.id}`;
      const extension = extensionByKey.get(`${assignment.id}-${userId}`) ?? null;
      const policy = computeDeadlinePolicy({
        assignment: {
          due_date: assignment.due_date,
          late_window_days: assignment.late_window_days,
        },
        extension,
        accommodation,
      });
      if (!policy.cutoff_at || now <= policy.cutoff_at) continue;

      eligibleGradeKeys.add(gradeKey);
      if (hasGrade.has(gradeKey)) continue;

      synthetic.push({
        user_id: userId,
        assignment_id: assignment.id,
        final_score: 0,
        max_score: assignment.total_points ?? 0,
      });
    }
  }

  return {
    grades: [...grades, ...synthetic],
    eligibleGradeKeys,
  };
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

  const { grades, eligibleGradeKeys } = await effectiveGradesForGradebook(
    assignments,
    enrollments,
    gradesFromDb,
    courseId
  );
  const submissionCounts = await fetchAssignmentSubmissionCounts(assignmentIds, userIds);

  return computeGradebookStudents(
    assignments,
    enrollments,
    grades,
    dropLowestN,
    { submissionCounts, eligibleGradeKeys }
  );
}

/*
count distinct submitted questions for each user and assignment pair
repeated attempts count once and missing pairs have no entry
empty inputs return an empty map and database errors propagate
*/
async function fetchAssignmentSubmissionCounts(assignmentIds, userIds) {
  if (!assignmentIds.length || !userIds.length) return new Map();
  const rows = await Submission.findAll({
    include: [
      {
        model: AssignmentQuestion,
        attributes: ['assignment_id'],
        where: { assignment_id: assignmentIds },
      },
    ],
    where: { user_id: userIds },
    attributes: [
      'user_id',
      [sequelize.col('AssignmentQuestion.assignment_id'), 'assignment_id'],
      [
        sequelize.fn(
          'COUNT',
          sequelize.fn('DISTINCT', sequelize.col('assignment_question_id'))
        ),
        'submitted_count',
      ],
    ],
    group: ['Submission.user_id', 'AssignmentQuestion.assignment_id'],
    raw: true,
  });
  return new Map(
    rows.map((row) => [
      `${row.user_id}:${row.assignment_id}`,
      Number(row.submitted_count) || 0,
    ])
  );
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
    assignment.setDataValue('question_count', count);
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
    question_count: assignment.question_count,
    due_date: assignment.due_date,
    due_at: assignment.due_at ?? assignment.due_date ?? null,
  }));
}

// every assignment stays visible but rollups only count eligible past-cutoff work
export function computeGradebookStudents(
  assignments,
  enrollments,
  grades,
  dropLowestN,
  options = {}
) {
  const {
    submissionCounts = new Map(),
    eligibleGradeKeys = new Set(),
  } = options ?? {};
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
      const questionCount = Number(assignment.question_count ?? 0);
      const submittedCount =
        submissionCounts.get(`${user.id}:${assignment.id}`) ?? 0;

      return {
        assignment_id: assignment.id,
        title: assignment.title,
        is_locked: isAssignmentLocked(assignment),
        final_score: finalScore,
        max_score: maxScore,
        percent,
        question_count: questionCount,
        submitted_count: submittedCount,
        has_grade: Boolean(grade),
        has_submission: submittedCount > 0,
        has_late_submission: Number(grade?.penalty_percent ?? 0) > 0,
      };
    });
    const averageItems = perAssignment.filter((item) => (
      !item.is_locked && eligibleGradeKeys.has(`${user.id}-${item.assignment_id}`)
    ));

    const totalScore = averageItems.reduce((sum, item) => sum + item.final_score, 0);
    const totalPoints = averageItems.reduce((sum, item) => sum + item.max_score, 0);
    const averagePercent = totalPoints > 0 ? totalScore / totalPoints : null;

    const dropCount =
      averageItems.length >= 3 ? Math.min(dropLowestN, averageItems.length - 1) : 0;
    const remaining = averageItems
      .slice()
      .sort((a, b) => a.percent - b.percent || a.assignment_id - b.assignment_id)
      .slice(dropCount);
    const droppedTotalScore = remaining.reduce((sum, item) => sum + item.final_score, 0);
    const droppedTotalPoints = remaining.reduce((sum, item) => sum + item.max_score, 0);
    const droppedAveragePercent = remaining.length > 0
      ? remaining.reduce((sum, item) => sum + item.percent, 0) / remaining.length
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
