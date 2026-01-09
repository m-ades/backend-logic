import express from 'express';
import { body, param } from 'express-validator';
import {
  Assignment,
  AssignmentExtension,
  AssignmentQuestionOverride,
  CourseEnrollment,
  Accommodation,
  AssignmentGrade,
  AssignmentQuestion,
  Submission,
  User,
} from '../models/index.js';
import { computeDeadlinePolicy } from '../utils/assignmentPolicy.js';
import { hashPassword } from '../utils/passwords.js';
import { handleValidationResult } from '../middleware/validation.js';
import {
  assignmentIdParam,
  courseIdParam,
} from '../validators/common.js';

const router = express.Router();
const courseAccessValidators = [courseIdParam, handleValidationResult];
const assignmentAccessValidators = [assignmentIdParam, handleValidationResult];

export async function requireInstructor(courseId, userId) {
  const enrollment = await CourseEnrollment.findOne({
    where: { course_id: courseId, user_id: userId },
  });
  return enrollment?.role === 'instructor' || enrollment?.role === 'ta';
}

export async function requireInstructorOrAdmin(courseId, userId) {
  const user = await User.findByPk(userId, { attributes: ['is_system_admin'] });
  if (user?.is_system_admin) {
    return true;
  }
  return requireInstructor(courseId, userId);
}

const sanitizeUser = (user) => {
  const data = user.toJSON ? user.toJSON() : user;
  delete data.password_hash;
  return data;
};

router.post(
  '/courses/:id/students',
  [
    courseIdParam,
    body('username').isString().trim().notEmpty().withMessage('username is required'),
    body('password').isString().notEmpty().withMessage('password is required'),
    handleValidationResult,
  ],
  async (req, res, next) => {
  try {
    const courseId = req.params.id;
    const userId = req.user.id;

    if (!(await requireInstructorOrAdmin(courseId, userId))) {
      return res.status(403).json({ message: 'Instructor or admin access required' });
    }

    const { username, password } = req.body;

    const existing = await User.findOne({
      where: {
        username,
      },
    });
    if (existing) {
      return res.status(409).json({ message: 'Username already in use' });
    }

    const password_hash = await hashPassword(password);
    const newUser = await User.create({
      username,
      password_hash,
    });

    await CourseEnrollment.create({
      course_id: courseId,
      user_id: newUser.id,
      role: 'student',
    });

    res.status(201).json({ user: sanitizeUser(newUser) });
  } catch (error) {
    next(error);
  }
});

router.get('/courses/:id/roster', courseAccessValidators, async (req, res, next) => {
  try {
    const courseId = req.params.id;
    const userId = req.user.id;

    if (!(await requireInstructor(courseId, userId))) {
      return res.status(403).json({ message: 'Instructor access required' });
    }

    const roster = await CourseEnrollment.findAll({
      where: { course_id: courseId },
      include: [{ model: User }],
      order: [['role', 'ASC']],
    });

    res.json(roster);
  } catch (error) {
    next(error);
  }
});

router.get('/courses/:id/accommodations', courseAccessValidators, async (req, res, next) => {
  try {
    const courseId = req.params.id;
    const userId = req.user.id;

    if (!(await requireInstructor(courseId, userId))) {
      return res.status(403).json({ message: 'Instructor access required' });
    }

    const accommodations = await Accommodation.findAll({
      where: { course_id: courseId },
      include: [{ model: User }],
      order: [['id', 'ASC']],
    });

    res.json(accommodations);
  } catch (error) {
    next(error);
  }
});

router.post('/courses/:id/accommodations', courseAccessValidators, async (req, res, next) => {
  try {
    const courseId = req.params.id;
    const userId = req.user.id;

    if (!(await requireInstructor(courseId, userId))) {
      return res.status(403).json({ message: 'Instructor access required' });
    }

    const targetUserId = Number(req.body.user_id ?? req.body.student_id);
    if (!targetUserId) {
      return res.status(400).json({ message: 'target user_id is required' });
    }

    const payload = {
      user_id: targetUserId,
      course_id: courseId,
      late_penalty_waived: Boolean(req.body.late_penalty_waived),
      extra_late_days: Number.isFinite(Number(req.body.extra_late_days))
        ? Number(req.body.extra_late_days)
        : 0,
    };

    const existing = await Accommodation.findOne({
      where: { user_id: targetUserId, course_id: courseId },
    });

    const record = existing ? await existing.update(payload) : await Accommodation.create(payload);
    res.status(existing ? 200 : 201).json(record);
  } catch (error) {
    next(error);
  }
});

router.get('/assignments/:id/extensions', assignmentAccessValidators, async (req, res, next) => {
  try {
    const assignmentId = req.params.id;
    const userId = req.user.id;

    const assignment = await Assignment.findByPk(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    if (!(await requireInstructor(assignment.course_id, userId))) {
      return res.status(403).json({ message: 'Instructor access required' });
    }

    const extensions = await AssignmentExtension.findAll({
      where: { assignment_id: assignmentId },
      include: [{ model: User }],
      order: [['id', 'ASC']],
    });

    res.json(extensions);
  } catch (error) {
    next(error);
  }
});

router.post('/assignments/:id/extensions', assignmentAccessValidators, async (req, res, next) => {
  try {
    const assignmentId = req.params.id;
    const userId = req.user.id;

    const assignment = await Assignment.findByPk(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    if (!(await requireInstructor(assignment.course_id, userId))) {
      return res.status(403).json({ message: 'Instructor access required' });
    }

    const targetUserId = Number(req.body.user_id ?? req.body.student_id);
    const extendedDueDate = req.body.extended_due_date;
    if (!targetUserId || !extendedDueDate) {
      return res.status(400).json({ message: 'user_id and extended_due_date are required' });
    }

    const payload = {
      assignment_id: assignmentId,
      user_id: targetUserId,
      extended_due_date: extendedDueDate,
      reason: req.body.reason ?? null,
      granted_by: userId,
    };

    const existing = await AssignmentExtension.findOne({
      where: { assignment_id: assignmentId, user_id: targetUserId },
    });

    const record = existing ? await existing.update(payload) : await AssignmentExtension.create(payload);
    res.status(existing ? 200 : 201).json(record);
  } catch (error) {
    next(error);
  }
});

router.post('/assignment-questions/:id/overrides', [
  param('id').isInt({ gt: 0 }).toInt().withMessage('assignment_question_id is required'),
  body('user_id').isInt({ gt: 0 }).toInt().withMessage('user_id is required'),
  body('extra_attempts').isInt({ min: 0 }).toInt().withMessage('extra_attempts is required'),
  handleValidationResult,
], async (req, res, next) => {
  try {
    const assignmentQuestionId = Number(req.params.id);
    const userId = req.user.id;

    const question = await AssignmentQuestion.findByPk(assignmentQuestionId, {
      include: [{ model: Assignment }],
    });
    if (!question) {
      return res.status(404).json({ message: 'Assignment question not found' });
    }

    if (!(await requireInstructor(question.Assignment?.course_id, userId))) {
      return res.status(403).json({ message: 'Instructor access required' });
    }

    const targetUserId = Number(req.body.user_id);
    const extraAttempts = Number(req.body.extra_attempts);

    const payload = {
      assignment_question_id: assignmentQuestionId,
      user_id: targetUserId,
      extra_attempts: extraAttempts,
      reason: req.body.reason ?? null,
      granted_by: userId,
    };

    const existing = await AssignmentQuestionOverride.findOne({
      where: { assignment_question_id: assignmentQuestionId, user_id: targetUserId },
    });

    const record = existing ? await existing.update(payload) : await AssignmentQuestionOverride.create(payload);
    res.status(existing ? 200 : 201).json(record);
  } catch (error) {
    next(error);
  }
});

router.post('/assignments/:id/extensions/classwide', assignmentAccessValidators, async (req, res, next) => {
  try {
    const assignmentId = req.params.id;
    const userId = req.user.id;

    const assignment = await Assignment.findByPk(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    if (!(await requireInstructor(assignment.course_id, userId))) {
      return res.status(403).json({ message: 'Instructor access required' });
    }

    const extendedDueDate = req.body.extended_due_date;
    if (!extendedDueDate) {
      return res.status(400).json({ message: 'extended_due_date is required' });
    }

    const enrollments = await CourseEnrollment.findAll({
      where: { course_id: assignment.course_id, role: 'student' },
      attributes: ['user_id'],
    });

    if (enrollments.length === 0) {
      return res.status(200).json({ updated: 0 });
    }

    const payload = enrollments.map((enrollment) => ({
      assignment_id: assignmentId,
      user_id: enrollment.user_id,
      extended_due_date: extendedDueDate,
      reason: req.body.reason ?? null,
      granted_by: userId,
    }));

    await AssignmentExtension.bulkCreate(payload, {
      updateOnDuplicate: ['extended_due_date', 'reason', 'granted_by'],
    });

    res.status(200).json({ updated: payload.length });
  } catch (error) {
    next(error);
  }
});

router.get('/assignments/:id/submissions', assignmentAccessValidators, async (req, res, next) => {
  try {
    const assignmentId = req.params.id;
    const userId = req.user.id;

    const assignment = await Assignment.findByPk(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    if (!(await requireInstructor(assignment.course_id, userId))) {
      return res.status(403).json({ message: 'Instructor access required' });
    }

    const submissions = await Submission.findAll({
      include: [
        {
          model: AssignmentQuestion,
          where: { assignment_id: assignmentId },
        },
        { model: User },
      ],
      order: [['submitted_at', 'DESC']],
    });

    res.json(submissions);
  } catch (error) {
    next(error);
  }
});

router.get('/assignments/:id/grades', assignmentAccessValidators, async (req, res, next) => {
  try {
    const assignmentId = req.params.id;
    const userId = req.user.id;

    const assignment = await Assignment.findByPk(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    if (!(await requireInstructor(assignment.course_id, userId))) {
      return res.status(403).json({ message: 'Instructor access required' });
    }

    const grades = await AssignmentGrade.findAll({
      where: { assignment_id: assignmentId },
      include: [{ model: User }],
      order: [['graded_at', 'DESC']],
    });

    res.json(grades);
  } catch (error) {
    next(error);
  }
});

router.get('/courses/:id/deadlines', courseAccessValidators, async (req, res, next) => {
  try {
    const courseId = req.params.id;
    const userId = req.user.id;

    if (!(await requireInstructor(courseId, userId))) {
      return res.status(403).json({ message: 'Instructor access required' });
    }

    const assignments = await Assignment.findAll({
      where: { course_id: courseId },
      order: [['due_date', 'ASC']],
    });

    const policies = await Promise.all(
      assignments.map(async (assignment) => {
        const extension = await AssignmentExtension.findOne({
          where: { assignment_id: assignment.id, user_id: userId },
        });
        const accommodation = await Accommodation.findOne({
          where: { course_id: courseId, user_id },
        });
        return {
          assignment_id: assignment.id,
          title: assignment.title,
          ...computeDeadlinePolicy({ assignment, extension, accommodation }),
        };
      })
    );

    res.json(policies);
  } catch (error) {
    next(error);
  }
});

export default router;
