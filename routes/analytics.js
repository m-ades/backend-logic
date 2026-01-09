import express from 'express';
import {
  Assignment,
  AssignmentGrade,
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
  fetchStudentTime,
  fetchAssignmentGradeSummary,
  fetchInstructorAssignmentStats,
  fetchInstructorGradeSummary,
  fetchInstructorTimeByCategory,
} from '../queries/analytics.js';
import { ensureSelfOrAdmin, isSystemAdmin } from '../utils/authorization.js';
import { requireInstructorOrAdmin } from './instructor.js';

const router = express.Router();

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

router.get(
  '/student',
  [userIdParam, courseIdOptionalParam, handleValidationResult],
  async (req, res, next) => {
  try {
    const { userId } = req.query;
    const courseId = req.query.courseId ?? null;
    if (!ensureSelfOrAdmin(req, res, userId)) {
      return;
    }

    const assignments = await fetchStudentAssignments(sequelize, userId, courseId);
    const performance = await fetchStudentPerformance(sequelize, userId, courseId);
    const submissionCount = await fetchStudentSubmissionCount(sequelize, userId, courseId);
    const time = await fetchStudentTime(sequelize, userId);

    const now = new Date();
    let upcoming = 0;
    let pending = 0;
    let overdue = 0;

    const upcomingList = assignments
      .map((assignment) => {
        const dueDate = assignment.due_date ? new Date(assignment.due_date) : null;
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
          total_points: assignment.total_points,
          status,
        };
      })
      .filter((item) => item.status === 'upcoming')
      .slice(0, 4);

    res.json({
      assignments: {
        upcoming,
        pending,
        overdue,
        upcomingList,
      },
      performance: performance || {
        avg_score: null,
        avg_attempt: null,
        correct_rate: null,
        first_try_correct_rate: null,
      },
      time: time || { avg_minutes_per_question: null },
      submissionCount: submissionCount?.submission_count || 0,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/instructor', [courseIdParam, handleValidationResult], async (req, res, next) => {
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

    const students = await buildGradebookStudents(assignments, enrollments, dropLowestN);

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

    const students = await buildGradebookStudents(assignments, enrollments, dropLowestN);
    res.json(students);
  } catch (error) {
    next(error);
  }
});

router.get('/gradebook-summary', [courseIdParam, handleValidationResult], async (req, res, next) => {
  try {
    const { courseId } = req.query;
    const enrollment = await CourseEnrollment.findOne({
      where: { course_id: courseId, user_id: req.user.id },
    });
    if (!enrollment && !isSystemAdmin(req.user)) {
      return res.status(403).json({ message: 'Enrollment required' });
    }
    const rows = await fetchAssignmentGradeSummary(sequelize, courseId);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

async function buildGradebookStudents(assignments, enrollments, dropLowestN) {
  // shared gradebook calculations here
  const assignmentIds = assignments.map((assignment) => assignment.id);
  const userIds = enrollments.map((enrollment) => enrollment.user_id);

  const grades = assignmentIds.length && userIds.length
    ? await AssignmentGrade.findAll({
      where: { assignment_id: assignmentIds, user_id: userIds },
    })
    : [];

  return computeGradebookStudents(assignments, enrollments, grades, dropLowestN);
}

function fetchGradebookAssignments(courseId) {
  return Assignment.findAll({
    where: { course_id: courseId, kind: 'assignment' },
    order: [['due_date', 'ASC'], ['id', 'ASC']],
  });
}

function fetchGradebookEnrollments(courseId) {
  return CourseEnrollment.findAll({
    where: { course_id: courseId, role: 'student' },
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

    return {
      user_id: user.id,
      username: user.username,
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
