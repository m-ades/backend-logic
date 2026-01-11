import {
  AssignmentDraft,
  AssignmentExtension,
  AssignmentQuestion,
  Accommodation,
  CourseEnrollment,
  Submission,
} from '../models/index.js';
import { validateLogicPenguin } from '../validators/logicpenguin.js';
import { computeDeadlinePolicy } from './assignmentPolicy.js';
import { recomputeAssignmentGrade } from './grades.js';

export async function autoSubmitIfPastDeadline(assignment, userId) {
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
      points: 100,
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

  if (created.length) {
    await recomputeAssignmentGrade({ assignmentId: assignment.id, userId });
  }

  return { ran: true, created };
}
