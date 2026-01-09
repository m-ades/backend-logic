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
} from '../models/index.js';
import { computeDeadlinePolicy } from '../utils/assignmentPolicy.js';
import { autoSubmitIfPastDeadline } from '../utils/autoSubmit.js';
import { ensureSelfOrAdmin, isSystemAdmin } from '../utils/authorization.js';

const router = createCrudRouter(Assignment, { disableGetById: true });

router.get('/:id', [assignmentIdParam, userIdOptionalQuery, handleValidationResult], async (req, res, next) => {
  try {
    const assignment = await Assignment.findByPk(req.params.id);
    if (!assignment) {
      return res.status(404).json({ message: 'Not found' });
    }

    const userId = req.query.userId;
    let policy = null;
    let accommodation = null;
    if (userId) {
      if (!ensureSelfOrAdmin(req, res, userId)) {
        return;
      }
      accommodation = await Accommodation.findOne({
        where: { course_id: assignment.course_id, user_id: userId },
      });
      if (assignment?.kind !== 'practice' && assignment?.due_date) {
        const extension = await AssignmentExtension.findOne({
          where: { assignment_id: assignment.id, user_id: userId },
        });
        policy = computeDeadlinePolicy({
          assignment,
          extension,
          accommodation,
        });
        await autoSubmitIfPastDeadline(assignment, userId);
      }
    }

    const questions = await AssignmentQuestion.findAll({
      where: { assignment_id: assignment.id },
      order: [['order_index', 'ASC']],
    });

    let questionsWithLimits = questions;
    if (userId && questions.length) {
      const questionIds = questions.map((question) => question.id);
      const overrides = await AssignmentQuestionOverride.findAll({
        where: { assignment_question_id: questionIds, user_id: userId },
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
