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
    const submissions = await Submission.findAll({
      include: [
        {
          model: AssignmentQuestion,
          where: { assignment_id: req.params.id },
        },
      ],
      ...(req.query.userId ? { where: { user_id: req.query.userId } } : {}),
      order: [['submitted_at', 'DESC']],
    });
    res.json(submissions);
  } catch (error) {
    next(error);
  }
});

export default router;
