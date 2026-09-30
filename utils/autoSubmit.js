import {
  AssignmentDraft,
  AssignmentExtension,
  AssignmentQuestion,
  Accommodation,
  Course,
  CourseEnrollment,
  Submission,
  sequelize,
} from '../models/index.js';
import { validateLogicProblem, resolveSnapshotPartialCredit } from '../validators/logic-engine.js';
import { isInvalidQuestionError } from '../validators/question-snapshot.js';
import { LEGACY_LOGIC_SYSTEM, normalizeLogicSystem } from '@logic-app/logic-engine/logicSystems.js';
import { computeDeadlinePolicy } from './assignmentPolicy.js';
import { lockStudentGrades, recomputeAssignmentGrades } from './grades.js';

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
  const course = assignment.Course || await Course.findByPk(assignment.course_id, {
    attributes: ['id', 'logic_system'],
  });
  const logicSystem = normalizeLogicSystem(course?.logic_system, LEGACY_LOGIC_SYSTEM);

  const pending = [];

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
      logicSystem,
      partialcredit: resolveSnapshotPartialCredit(questionSnapshot),
    };

    let validation;
    try {
      validation = await validateLogicProblem({
        question: questionSnapshot,
        submission: draft.draft_data,
        options,
      });
    } catch (error) {
      if (!isInvalidQuestionError(error)) throw error;
      console.warn(`Skipping invalid question ${question.id} during automatic submission.`);
      continue;
    }

    pending.push({
      assignment_question_id: question.id,
      user_id: userId,
      attempt: 1,
      submission_data: draft.draft_data,
      score: validation.score,
      is_correct: validation.isCorrect,
      auto_submitted: true,
      validated_at: new Date(),
      validation_version: 'logic-engine-auto-v1',
    });
  }

  if (!pending.length) {
    return { ran: true, created: [] };
  }

  // recheck under the grade lock so a last second student attempt is never duplicated
  const created = await sequelize.transaction(async (transaction) => {
    await lockStudentGrades({ assignmentIds: [assignment.id], userId, transaction });
    const submitted = await Submission.findAll({
      where: {
        assignment_question_id: pending.map((row) => row.assignment_question_id),
        user_id: userId,
      },
      attributes: ['assignment_question_id'],
      transaction,
    });
    const submittedIds = new Set(submitted.map((row) => row.assignment_question_id));
    const saved = [];
    for (const row of pending.filter((item) => !submittedIds.has(item.assignment_question_id))) {
      saved.push(await Submission.create(row, { transaction }));
    }
    if (saved.length) {
      await recomputeAssignmentGrades({ assignmentIds: [assignment.id], userIds: [userId], transaction });
    }
    return saved;
  });

  return { ran: true, created };
}
