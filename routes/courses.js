import { createCrudRouter } from './crud.js';
import { Op, QueryTypes } from 'sequelize';
import { Course, Assignment, CourseEnrollment, User, sequelize } from '../models/index.js';
import { handleValidationResult } from '../middleware/validation.js';
import { courseIdParam } from '../validators/common.js';
import { isSystemAdmin } from '../utils/authorization.js';
import { requireInstructorOrAdmin } from './instructor.js';

async function requireInstructorInAnyCourseOrAdmin(user) {
  if (isSystemAdmin(user)) {
    return true;
  }
  const enrollment = await CourseEnrollment.findOne({
    where: {
      user_id: user.id,
      role: { [Op.in]: ['instructor', 'ta'] },
    },
  });
  return Boolean(enrollment);
}

const router = createCrudRouter(Course, {
  authorizeCreate: (req) => requireInstructorInAnyCourseOrAdmin(req.user),
  authorizeRecord: (req, record, action) => {
    if (action === 'read') {
      return true;
    }
    return requireInstructorOrAdmin(record.id, req.user.id);
  },
});

async function requireEnrollmentOrAdmin(courseId, user) {
  if (isSystemAdmin(user)) {
    return true;
  }
  const enrollment = await CourseEnrollment.findOne({
    where: { course_id: courseId, user_id: user.id },
  });
  return Boolean(enrollment);
}

router.get('/:id/assignments', [courseIdParam, handleValidationResult], async (req, res, next) => {
  try {
    if (!(await requireEnrollmentOrAdmin(req.params.id, req.user))) {
      return res.status(403).json({ message: 'Enrollment required' });
    }
    const assignments = await Assignment.findAll({
      attributes: [
        'id',
        'course_id',
        'title',
        'description',
        'kind',
        'chapter',
        'subchapter',
        'due_date',
        'late_window_days',
        'late_penalty_percent',
        'total_points',
        'is_locked',
        'created_at',
      ],
      where: { course_id: req.params.id },
      order: [['created_at', 'DESC']],
    });
    const assignmentIds = assignments.map((assignment) => assignment.id);
    const userId = req.user?.id;
    let statsMap = new Map();
    if (assignmentIds.length && userId) {
      const stats = await sequelize.query(
        `
        SELECT
          aq.assignment_id,
          COUNT(DISTINCT aq.id) AS question_count,
          COUNT(DISTINCT CASE WHEN s.user_id = :userId THEN s.assignment_question_id END) AS answered_count
        FROM assignment_questions aq
        LEFT JOIN submissions s
          ON s.assignment_question_id = aq.id
          AND s.user_id = :userId
        WHERE aq.assignment_id IN (:assignmentIds)
        GROUP BY aq.assignment_id
        `,
        {
          replacements: {
            assignmentIds,
            userId,
          },
          type: QueryTypes.SELECT,
        }
      );
      statsMap = new Map(
        stats.map((row) => [
          Number(row.assignment_id),
          {
            question_count: Number(row.question_count) || 0,
            answered_count: Number(row.answered_count) || 0,
          },
        ])
      );
    }
    const payload = assignments.map((assignment) => {
      const data = assignment.toJSON ? assignment.toJSON() : assignment;
      const stats = statsMap.get(assignment.id) || { question_count: 0, answered_count: 0 };
      const completed = stats.question_count > 0 && stats.answered_count >= stats.question_count;
      return { ...data, ...stats, completed };
    });
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/enrollments', [courseIdParam, handleValidationResult], async (req, res, next) => {
  try {
    if (!(await requireInstructorOrAdmin(req.params.id, req.user.id))) {
      return res.status(403).json({ message: 'Instructor or admin access required' });
    }
    const enrollments = await CourseEnrollment.findAll({
      where: { course_id: req.params.id },
      include: [{ model: User }],
    });
    res.json(enrollments);
  } catch (error) {
    next(error);
  }
});

export default router;
