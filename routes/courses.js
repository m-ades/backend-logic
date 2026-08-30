import { createCrudRouter } from './crud.js';
import { QueryTypes } from 'sequelize';
import {
  Accommodation,
  AssignmentExtension,
  Course,
  CourseEnrollment,
  CourseTextbookPracticeLinks,
  CourseTextbookStructure,
  User,
  sequelize,
} from '../models/index.js';
import { formatDueDateEastern } from '../utils/easternDate.js';
import { addDays, computeDeadlinePolicy } from '../utils/assignmentPolicy.js';
import { handleValidationResult } from '../middleware/validation.js';
import { courseIdParam } from '../validators/common.js';
import {
  textbookPracticeLinksBody,
  textbookStructureBody,
} from '../validators/textbook.js';
import { isSystemAdmin } from '../utils/authorization.js';
import { requireInstructorOrAdmin } from './instructor.js';

function formatPolicyDates(policy) {
  if (!policy) return null;
  return {
    ...policy,
    due_at: policy.due_at ? formatDueDateEastern(policy.due_at) : policy.due_at,
    cutoff_at: policy.cutoff_at ? formatDueDateEastern(policy.cutoff_at) : policy.cutoff_at,
  };
}

async function requireInstructorInAnyCourseOrAdmin(user) {
  if (isSystemAdmin(user)) {
    return true;
  }
  const enrollment = await CourseEnrollment.findOne({
    where: {
      user_id: user.id,
      role: 'instructor',
    },
  });
  return Boolean(enrollment);
}

async function canAccessCourse(courseId, user) {
  if (isSystemAdmin(user)) {
    return true;
  }
  if (!user?.id) {
    return false;
  }
  const enrollment = await CourseEnrollment.findOne({
    where: { course_id: courseId, user_id: user.id },
  });
  return Boolean(enrollment);
}

// course mutation contract
// instructors may update courses they control
// only system administrators may permanently delete courses
const router = createCrudRouter(Course, {
  authorizeCreate: (req) => requireInstructorInAnyCourseOrAdmin(req.user),
  authorizeRecord: (req, record, action) => {
    if (action === 'read') {
      return true;
    }
    if (action === 'delete') {
      return isSystemAdmin(req.user);
    }
    return requireInstructorOrAdmin(record.id, req.user.id);
  },
});

router.get('/:id/assignments', [courseIdParam, handleValidationResult], async (req, res, next) => {
  try {
    const courseId = req.params.id;
    const userId = req.user?.id ?? null;
    const admin = isSystemAdmin(req.user);
    // single enrollment lookup covers both "may view this course" and "may see locked assignments"
    const enrollment = admin
      ? null
      : await CourseEnrollment.findOne({ where: { course_id: courseId, user_id: userId } });
    if (!admin && !enrollment) {
      return res.status(403).json({ message: 'Enrollment required' });
    }
    const canSeeLocked = admin || enrollment?.role === 'instructor' || enrollment?.role === 'ta';
    // one query. assignments and counts.
    const rows = await sequelize.query(
      `
      SELECT
        a.id,
        a.course_id,
        a.title,
        a.description,
        a.kind,
        a.chapter,
        a.subchapter,
        a.due_date,
        a.late_window_days,
        a.late_penalty_percent,
        a.total_points,
        a.is_locked,
        a.group_questions_by_type,
        a.created_at,
        COALESCE(stats.question_count, 0) AS question_count,
        COALESCE(stats.answered_count, 0) AS answered_count
      FROM assignments a
      LEFT JOIN (
        SELECT
          aq.assignment_id,
          COUNT(DISTINCT aq.id) AS question_count,
          COUNT(DISTINCT CASE WHEN s.user_id = :userId THEN s.assignment_question_id END) AS answered_count
        FROM assignment_questions aq
        LEFT JOIN submissions s
          ON s.assignment_question_id = aq.id
          AND s.user_id = :userId
        GROUP BY aq.assignment_id
      ) stats ON stats.assignment_id = a.id
      WHERE a.course_id = :courseId
      ORDER BY a.created_at DESC
      `,
      {
        replacements: { courseId, userId },
        type: QueryTypes.SELECT,
      }
    );
    const visibleRows = canSeeLocked ? rows : rows.filter((row) => !row.is_locked);
    const accommodation = userId
      ? await Accommodation.findOne({
        where: { course_id: courseId, user_id: userId },
      })
      : null;
    const assignmentIds = visibleRows.map((row) => row.id);
    const extensions = userId && assignmentIds.length
      ? await AssignmentExtension.findAll({
        where: { user_id: userId, assignment_id: assignmentIds },
      })
      : [];
    const extensionByAssignment = new Map(
      extensions.map((extension) => [extension.assignment_id, extension])
    );

    const payload = visibleRows.map((row) => {
      const question_count = Number(row.question_count) || 0;
      const answered_count = Number(row.answered_count) || 0;
      const completed =
        question_count > 0 && answered_count === question_count;
      const extension = extensionByAssignment.get(row.id) ?? null;
      const accommodationDueAt = accommodation?.extra_late_days && row.due_date
        ? addDays(new Date(row.due_date), accommodation.extra_late_days)
        : null;
      const policy = userId && row.kind !== 'practice' && row.due_date
        ? {
          ...formatPolicyDates(computeDeadlinePolicy({
            assignment: {
              due_date: row.due_date,
              late_window_days: row.late_window_days,
              late_penalty_percent: row.late_penalty_percent,
            },
            extension,
            accommodation,
          })),
          has_extension: Boolean(extension),
          extension_due_at: extension?.extended_due_date
            ? formatDueDateEastern(extension.extended_due_date)
            : null,
          accommodation_due_at: accommodationDueAt
            ? formatDueDateEastern(accommodationDueAt)
            : null,
        }
        : null;
      const data = {
        id: row.id,
        course_id: row.course_id,
        title: row.title,
        description: row.description,
        kind: row.kind,
        chapter: row.chapter,
        subchapter: row.subchapter,
        due_date:
          row.due_date != null ? formatDueDateEastern(row.due_date) : row.due_date,
        late_window_days: row.late_window_days,
        late_penalty_percent: row.late_penalty_percent,
        total_points: question_count * 100,
        is_locked: row.is_locked,
        group_questions_by_type: row.group_questions_by_type,
        created_at: row.created_at,
        question_count,
        answered_count,
        completed,
        policy,
      };
      return data;
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
      include: [{ model: User, attributes: ['id', 'username'] }],
    });
    res.json(enrollments);
  } catch (error) {
    next(error);
  }
});

router.get(
  '/:id/textbook-structure',
  [courseIdParam, handleValidationResult],
  async (req, res, next) => {
    try {
      const courseId = req.params.id;
      if (!(await canAccessCourse(courseId, req.user))) {
        return res.status(403).json({ message: 'Enrollment required' });
      }

      const row = await CourseTextbookStructure.findByPk(courseId);
      return res.json({
        courseId: Number(courseId),
        nodes: row?.nodes ?? null,
        usingDefaults: !row,
        updatedAt: row?.updated_at ?? null,
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.put(
  '/:id/textbook-structure',
  [courseIdParam, ...textbookStructureBody, handleValidationResult],
  async (req, res, next) => {
    try {
      const courseId = req.params.id;
      if (!(await requireInstructorOrAdmin(courseId, req.user.id))) {
        return res.status(403).json({ message: 'Instructor or admin access required' });
      }

      const nodes = Array.isArray(req.body.nodes) ? req.body.nodes : [];
      await CourseTextbookStructure.upsert({
        course_id: courseId,
        nodes,
        updated_at: new Date(),
        updated_by: req.user.id,
      });
      const row = await CourseTextbookStructure.findByPk(courseId);

      return res.json({
        courseId: Number(courseId),
        nodes: row?.nodes ?? nodes,
        usingDefaults: false,
        updatedAt: row?.updated_at ?? null,
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.delete(
  '/:id/textbook-structure',
  [courseIdParam, handleValidationResult],
  async (req, res, next) => {
    try {
      const courseId = req.params.id;
      if (!(await requireInstructorOrAdmin(courseId, req.user.id))) {
        return res.status(403).json({ message: 'Instructor or admin access required' });
      }

      await CourseTextbookStructure.destroy({ where: { course_id: courseId } });
      return res.json({
        courseId: Number(courseId),
        nodes: null,
        usingDefaults: true,
        updatedAt: null,
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.get(
  '/:id/textbook-practice-links',
  [courseIdParam, handleValidationResult],
  async (req, res, next) => {
    try {
      const courseId = req.params.id;
      if (!(await canAccessCourse(courseId, req.user))) {
        return res.status(403).json({ message: 'Enrollment required' });
      }

      const row = await CourseTextbookPracticeLinks.findByPk(courseId);
      return res.json({
        courseId: Number(courseId),
        links: row?.links ?? null,
        usingDefaults: !row,
        updatedAt: row?.updated_at ?? null,
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.put(
  '/:id/textbook-practice-links',
  [courseIdParam, ...textbookPracticeLinksBody, handleValidationResult],
  async (req, res, next) => {
    try {
      const courseId = req.params.id;
      if (!(await requireInstructorOrAdmin(courseId, req.user.id))) {
        return res.status(403).json({ message: 'Instructor or admin access required' });
      }

      const links = Array.isArray(req.body.links) ? req.body.links : [];
      await CourseTextbookPracticeLinks.upsert({
        course_id: courseId,
        links,
        updated_at: new Date(),
        updated_by: req.user.id,
      });
      const row = await CourseTextbookPracticeLinks.findByPk(courseId);

      return res.json({
        courseId: Number(courseId),
        links: row?.links ?? links,
        usingDefaults: false,
        updatedAt: row?.updated_at ?? null,
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.delete(
  '/:id/textbook-practice-links',
  [courseIdParam, handleValidationResult],
  async (req, res, next) => {
    try {
      const courseId = req.params.id;
      if (!(await requireInstructorOrAdmin(courseId, req.user.id))) {
        return res.status(403).json({ message: 'Instructor or admin access required' });
      }

      await CourseTextbookPracticeLinks.destroy({ where: { course_id: courseId } });
      return res.json({
        courseId: Number(courseId),
        links: null,
        usingDefaults: true,
        updatedAt: null,
      });
    } catch (error) {
      return next(error);
    }
  }
);

export default router;
