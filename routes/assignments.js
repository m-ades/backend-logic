import { createCrudRouter } from './crud.js';
import {
  Assignment,
  AssignmentQuestion,
  AssignmentDraft,
  AssignmentExtension,
  Accommodation,
  CourseEnrollment,
  AssignmentGrade,
  User,
  Submission,
} from '../models/index.js';
import { validateLogicPenguin } from '../validators/logicpenguin.js';
import { computeDeadlinePolicy } from '../utils/assignmentPolicy.js';

const router = createCrudRouter(Assignment, { disableGetById: true });

async function autoSubmitIfPastDeadline(assignment, userId) {
  if (!assignment?.due_date || assignment?.kind === 'practice') {
    return { ran: false };
  }

  const enrollment = await CourseEnrollment.findOne({
    where: { user_id: userId, course_id: assignment.course_id },
  });
  if (!enrollment) {
    return { ran: false };
  }

  const extension = await AssignmentExtension.findOne({
    where: { assignment_id: assignment.id, user_id: userId },
  });
  const accommodation = await Accommodation.findOne({
    where: { course_id: assignment.course_id, user_id: userId },
  });

  const policy = computeDeadlinePolicy({
    assignment,
    extension,
    accommodation,
  });

  if (!policy.cutoff_at || new Date() <= policy.cutoff_at) {
    return { ran: false };
  }

  const questions = await AssignmentQuestion.findAll({
    where: { assignment_id: assignment.id },
  });

  const created = [];

  for (const question of questions) {
    const existing = await Submission.findOne({
      where: { assignment_question_id: question.id, user_id: userId },
    });
    if (existing) {
      continue;
    }

    const draft = await AssignmentDraft.findOne({
      where: { assignment_question_id: question.id, user_id: userId },
      order: [['updated_at', 'DESC']],
    });
    if (!draft) {
      continue;
    }

    const questionSnapshot = question.question_snapshot || {};
    const options = {
      notation: questionSnapshot.notation || 'hurley',
      ruleset: questionSnapshot.ruleset || 'hurley_default',
      partialcredit: questionSnapshot.partialCredit || false,
    };

    const validation = await validateLogicPenguin({
      question: questionSnapshot,
      submission: draft.draft_data,
      points: question.points_value,
      options,
    });

    const submission = await Submission.create({
      assignment_question_id: question.id,
      user_id: userId,
      attempt: 1,
      submission_data: draft.draft_data,
      score: validation.score,
      is_correct: validation.isCorrect,
      auto_submitted: true,
      validated_at: new Date(),
      validation_version: 'lp-auto-v1',
    });

    created.push(submission);
  }

  return { ran: true, created };
}

router.get('/:id', async (req, res) => {
  try {
    const assignment = await Assignment.findByPk(req.params.id);
    if (!assignment) {
      return res.status(404).json({ message: 'Not found' });
    }

    const userId = Number(req.query.userId);
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
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id/questions', async (req, res) => {
  try {
    const questions = await AssignmentQuestion.findAll({
      where: { assignment_id: req.params.id },
      order: [['order_index', 'ASC']],
    });
    res.json(questions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id/grades', async (req, res) => {
  try {
    const grades = await AssignmentGrade.findAll({
      where: { assignment_id: req.params.id },
      include: [{ model: User }],
      order: [['graded_at', 'DESC']],
    });
    res.json(grades);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id/submissions', async (req, res) => {
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
    res.status(500).json({ message: error.message });
  }
});

export default router;
