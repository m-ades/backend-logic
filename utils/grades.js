import { QueryTypes } from 'sequelize';
import {
  Accommodation,
  Assignment,
  AssignmentExtension,
  AssignmentGrade,
  AssignmentQuestion,
} from '../models/index.js';
import { sequelize } from '../config/sequelize.js';
import { computeDeadlinePolicy } from './assignmentPolicy.js';

const toNumber = (value) => (value === null || value === undefined ? 0 : Number(value));

export async function recomputeAssignmentGrade({ assignmentId, userId }) {
  const assignment = await Assignment.findByPk(assignmentId);
  if (!assignment) {
    return null;
  }

  const questions = await AssignmentQuestion.findAll({
    where: { assignment_id: assignmentId },
    attributes: ['id', 'points_value'],
  });
  if (!questions.length) {
    return null;
  }

  const questionIds = questions.map((question) => question.id);
  const submissionRows = await sequelize.query(
    `
      SELECT assignment_question_id, MAX(score) AS max_score, MAX(submitted_at) AS latest_submitted_at
      FROM submissions
      WHERE user_id = :userId
        AND assignment_question_id IN (:questionIds)
      GROUP BY assignment_question_id
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { userId, questionIds },
    }
  );

  if (!submissionRows.length) {
    return null;
  }

  const scoreByQuestion = new Map();
  let latestSubmissionAt = null;
  for (const row of submissionRows) {
    scoreByQuestion.set(row.assignment_question_id, toNumber(row.max_score));
    if (row.latest_submitted_at) {
      const candidateDate = new Date(row.latest_submitted_at);
      if (!latestSubmissionAt || candidateDate > latestSubmissionAt) {
        latestSubmissionAt = candidateDate;
      }
    }
  }

  const rawScore = questions.reduce(
    (sum, question) => sum + (scoreByQuestion.get(question.id) || 0),
    0
  );
  const maxScore = questions.reduce((sum, question) => sum + toNumber(question.points_value), 0);

  const extension = await AssignmentExtension.findOne({
    where: { assignment_id: assignmentId, user_id: userId },
  });
  const accommodation = await Accommodation.findOne({
    where: { course_id: assignment.course_id, user_id: userId },
  });
  const policy = computeDeadlinePolicy({ assignment, extension, accommodation });

  let penaltyPercent = 0;
  if (policy.due_at && latestSubmissionAt && latestSubmissionAt > policy.due_at) {
    penaltyPercent = policy.late_penalty_percent ?? 0;
  }

  const finalScore = Math.max(
    0,
    Math.round(rawScore * (1 - penaltyPercent / 100))
  );

  const existing = await AssignmentGrade.findOne({
    where: { assignment_id: assignmentId, user_id: userId },
  });

  const payload = {
    assignment_id: assignmentId,
    user_id: userId,
    raw_score: rawScore,
    max_score: maxScore,
    penalty_percent: penaltyPercent,
    final_score: finalScore,
    graded_at: new Date(),
    graded_by: null,
  };

  const grade = existing ? await existing.update(payload) : await AssignmentGrade.create(payload);
  return grade;
}
