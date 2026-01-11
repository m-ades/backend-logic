import express from 'express';
import { body } from 'express-validator';
import {
  Assignment,
  AssignmentQuestion,
  AssignmentExtension,
  AssignmentQuestionOverride,
  Accommodation,
  CourseEnrollment,
  Submission,
} from '../models/index.js';
import { validateLogicPenguin } from '../validators/logicpenguin.js';
import { computeDeadlinePolicy } from '../utils/assignmentPolicy.js';
import { recomputeAssignmentGrade } from '../utils/grades.js';
import { handleValidationResult } from '../middleware/validation.js';
import { ensureSelfOrAdmin } from '../utils/authorization.js';

const router = express.Router();

router.post(
  '/submission',
  [
    body('assignment_question_id').isInt({ gt: 0 }).toInt().withMessage('assignment_question_id is required'),
    body('user_id').isInt({ gt: 0 }).toInt().withMessage('user_id is required'),
    body('submission_data').exists().withMessage('submission_data is required'),
    handleValidationResult,
  ],
  async (req, res, next) => {
  try {
    // pull fields from the request body
    const {
      assignment_question_id,
      attempt,
      user_id,
      submission_data,
      notation,
      ruleset,
      validation_version,
    } = req.body;
    if (!ensureSelfOrAdmin(req, res, user_id)) {
      return;
    }

    // require fields that are definitely needed to accept a submission
    // load the question and its assignment for policy checks
    const assignmentQuestion = await AssignmentQuestion.findByPk(assignment_question_id, {
      include: [{ model: Assignment }],
    });

    // 404
    if (!assignmentQuestion) {
      return res.status(404).json({ message: 'quetsion not found' });
    }

    // block submissions if the assignment is manually locked
    if (assignmentQuestion.Assignment?.is_locked) {
      return res.status(403).json({ message: 'assignment is locked' });
    }

    // apply due date, extensions, and accommodations for non-practice work
    const assignment = assignmentQuestion.Assignment;
    const accommodation = await Accommodation.findOne({
      where: { course_id: assignment.course_id, user_id },
    });
    const extension = await AssignmentExtension.findOne({
      where: { assignment_id: assignment.id, user_id },
    });
    const questionOverride = await AssignmentQuestionOverride.findOne({
      where: { assignment_question_id, user_id },
    });

    if (assignment?.kind !== 'practice' && assignment?.due_date) {
      const policy = computeDeadlinePolicy({
        assignment,
        extension,
        accommodation,
      });

      // block submissions after the computed cutoff
      if (policy.cutoff_at && new Date() > policy.cutoff_at) {
        return res.status(403).json({ message: 'submission window has closed' });
      }
    }

    // student is enrolled in the course
    const enrollment = await CourseEnrollment.findOne({
      where: {
        user_id,
        course_id: assignment.course_id,
      },
    });

    if (!enrollment) {
      return res.status(403).json({ message: 'user not enrolled in this course' });
    }

    // count how many submission the student made for this question
    const existingAttempts = await Submission.count({
      where: {
        assignment_question_id,
        user_id,
      },
    });

    const nextAttempt = existingAttempts + 1;
    const baseAttemptLimit = assignmentQuestion.attempt_limit;
    const extraAttempts = Number.isFinite(questionOverride?.extra_attempts)
      ? questionOverride.extra_attempts
      : 0;
    const effectiveAttemptLimit = Math.max(1, baseAttemptLimit + extraAttempts);

    const attemptToUse = attempt || nextAttempt;
    if (attemptToUse > effectiveAttemptLimit) {
      return res.status(400).json({ message: 'Attempt limit exceeded' });
    }

    if (attemptToUse !== nextAttempt) {
      return res.status(400).json({ message: `Next attempt must be ${nextAttempt}` });
    }

    // validator options from the question snapshot + request overrides
    const questionSnapshot = assignmentQuestion.question_snapshot || {};
    const options = {
      notation: notation || questionSnapshot.notation || 'hurley',
      ruleset: ruleset || questionSnapshot.ruleset || 'hurley_default',
      partialcredit: questionSnapshot.partialCredit || false,
    };

    // run the autograder to score the submission
    const validation = await validateLogicPenguin({
      question: questionSnapshot,
      submission: submission_data,
      points: 100,
      options,
    });

    // save the graded submission
    const submission = await Submission.create({
      assignment_question_id,
      user_id,
      attempt: attemptToUse,
      submission_data,
      score: validation.score,
      is_correct: validation.isCorrect,
      validated_at: new Date(),
      validation_version: validation_version || 'lp-v1',
    });

    await recomputeAssignmentGrade({ assignmentId: assignment.id, userId: user_id });

    // return the saved submission and the grading output
    res.json({
      ok: true,
      submission,
      validation: validation.result,
      attempt_limit: effectiveAttemptLimit,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
