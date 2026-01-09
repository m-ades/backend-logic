import { createCrudRouter } from './crud.js';
import { handleValidationResult } from '../middleware/validation.js';
import { assignmentIdParam, userIdOptionalQuery } from '../validators/common.js';
import {
  Assignment,
  AssignmentQuestion,
  AssignmentExtension,
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
    if (userId) {
      if (!ensureSelfOrAdmin(req, res, userId)) {
        return;
      }
      const extension = await AssignmentExtension.findOne({
        where: { assignment_id: assignment.id, user_id: userId },
      });
      const accommodation = await Accommodation.findOne({
        where: { course_id: assignment.course_id, user_id: userId },
      });
      policy = computeDeadlinePolicy({
        assignment,
        extension,
        accommodation,
      });
      await autoSubmitIfPastDeadline(assignment, userId);
    }

    const questions = await AssignmentQuestion.findAll({
      where: { assignment_id: assignment.id },
      order: [['order_index', 'ASC']],
    });

    res.json({ assignment, questions, policy });
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
