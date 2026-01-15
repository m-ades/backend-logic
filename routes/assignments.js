import { createCrudRouter } from './crud.js';
import { handleValidationResult } from '../middleware/validation.js';
import { assignmentIdParam, userIdOptionalQuery } from '../validators/common.js';
import {
  Assignment,
  AssignmentQuestion,
  AssignmentExtension,
  AssignmentQuestionOverride,
  Accommodation,
  AssignmentGrade,
  Submission,
  User,
  sequelize,
} from '../models/index.js';
import { computeDeadlinePolicy } from '../utils/assignmentPolicy.js';
import { autoSubmitIfPastDeadline } from '../utils/autoSubmit.js';
import { ensureSelfOrAdmin, isSystemAdmin } from '../utils/authorization.js';
import { requireInstructorOrAdmin } from './instructor.js';

const router = createCrudRouter(Assignment, {
  disableGetById: true,
  authorizeCreate: async (req) => {
    const courseId = Number(req.body?.course_id);
    if (!Number.isFinite(courseId)) {
      return false;
    }
    return requireInstructorOrAdmin(courseId, req.user.id);
  },
  authorizeRecord: (req, record, action) => {
    if (action === 'read') {
      return true;
    }
    return requireInstructorOrAdmin(record.course_id, req.user.id);
  },
});

router.get('/:id', [assignmentIdParam, userIdOptionalQuery, handleValidationResult], async (req, res, next) => {
  try {
    const assignment = await Assignment.findByPk(req.params.id);
    if (!assignment) {
      return res.status(404).json({ message: 'Not found' });
    }

    const requestedUserId = req.query.userId;
    let policy = null;
    let accommodation = null;
    if (requestedUserId) {
      if (!ensureSelfOrAdmin(req, res, requestedUserId)) {
        return;
      }
      accommodation = await Accommodation.findOne({
        where: { course_id: assignment.course_id, user_id: requestedUserId },
      });
      if (assignment?.kind !== 'practice' && assignment?.due_date) {
        const extension = await AssignmentExtension.findOne({
          where: { assignment_id: assignment.id, user_id: requestedUserId },
        });
        policy = computeDeadlinePolicy({
          assignment,
          extension,
          accommodation,
        });
        await autoSubmitIfPastDeadline(assignment, requestedUserId);
      }
    }

    const questions = await AssignmentQuestion.findAll({
      where: { assignment_id: assignment.id },
      order: [['order_index', 'ASC']],
    });

    let questionsWithLimits = questions;
    if (requestedUserId && questions.length) {
      const questionIds = questions.map((question) => question.id);
      const overrides = await AssignmentQuestionOverride.findAll({
        where: { assignment_question_id: questionIds, user_id: requestedUserId },
      });
      const overrideMap = new Map(
        overrides.map((override) => [override.assignment_question_id, override.extra_attempts])
      );
      questionsWithLimits = questions.map((question) => {
        const data = question.toJSON ? question.toJSON() : { ...question };
        const extraAttempts = Number.isFinite(overrideMap.get(question.id))
          ? overrideMap.get(question.id)
          : 0;
        data.attempt_limit = Math.max(1, data.attempt_limit + extraAttempts);
        return data;
      });
    }

    const userIdForFiltering = requestedUserId || req.user?.id;
    const canSeeAnswers = await requireInstructorOrAdmin(assignment.course_id, req.user.id);
    if (!canSeeAnswers && userIdForFiltering && questionsWithLimits.length) {
      const questionIds = questionsWithLimits.map((question) => question.id);
      const attemptCounts = await Submission.findAll({
        where: { assignment_question_id: questionIds, user_id: userIdForFiltering },
        attributes: [
          'assignment_question_id',
          [sequelize.fn('COUNT', sequelize.col('id')), 'attempt_count'],
        ],
        group: ['assignment_question_id'],
        raw: true,
      });
      const attemptCountMap = new Map(
        attemptCounts.map((row) => [row.assignment_question_id, Number(row.attempt_count)])
      );
      questionsWithLimits = questionsWithLimits.map((question) => {
        const data = question.toJSON ? question.toJSON() : { ...question };
        const attemptCount = attemptCountMap.get(data.id) ?? 0;
        if (attemptCount < data.attempt_limit) {
          const snapshot = data.question_snapshot;
          if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
            if (Object.prototype.hasOwnProperty.call(snapshot, 'answer')) {
              const sanitized = { ...snapshot };
              delete sanitized.answer;
              data.question_snapshot = sanitized;
            }
          }
        }
        return data;
      });
    }

    res.json({ assignment, questions: questionsWithLimits, policy });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/questions', [assignmentIdParam, handleValidationResult], async (req, res, next) => {
  try {
    const questions = await AssignmentQuestion.findAll({
      where: { assignment_id: req.params.id },
      order: [['order_index', 'ASC']],
    });
    res.json(questions);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/grades', [assignmentIdParam, handleValidationResult], async (req, res, next) => {
  try {
    if (!isSystemAdmin(req.user)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const grades = await AssignmentGrade.findAll({
      where: { assignment_id: req.params.id },
      include: [{ model: User }],
      order: [['graded_at', 'DESC']],
    });
    res.json(grades);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/submissions', [assignmentIdParam, userIdOptionalQuery, handleValidationResult], async (req, res, next) => {
  try {
    const requestedUserId = req.query.userId;
    if (requestedUserId && !ensureSelfOrAdmin(req, res, requestedUserId)) {
      return;
    }
    const scopedUserId = requestedUserId || (isSystemAdmin(req.user) ? null : req.user.id);
    const submissions = await Submission.findAll({
      include: [
        {
          model: AssignmentQuestion,
          where: { assignment_id: req.params.id },
        },
      ],
      ...(scopedUserId ? { where: { user_id: scopedUserId } } : {}),
      order: [['submitted_at', 'DESC']],
    });
    res.json(submissions);
  } catch (error) {
    next(error);
  }
});

export default router;
