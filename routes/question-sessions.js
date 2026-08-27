import { createCrudRouter } from './crud.js';
import { AssignmentQuestion, Assignment, QuestionSession } from '../models/index.js';
import { isSystemAdmin } from '../utils/authorization.js';
import { requireEnrollmentForCourse } from '../utils/enrollment.js';

async function loadQuestionOrThrow(assignmentQuestionId) {
  const assignmentQuestion = await AssignmentQuestion.findByPk(assignmentQuestionId, {
    include: [{ model: Assignment }],
  });
  if (!assignmentQuestion) {
    const error = new Error('assignment_question_id not found');
    error.status = 404;
    throw error;
  }
  return assignmentQuestion;
}

const router = createCrudRouter(QuestionSession, {
  listFilter: (req) => (isSystemAdmin(req.user) ? {} : { where: { user_id: req.user.id } }),
  authorizeRecord: (req, record) => (
    isSystemAdmin(req.user) || Number(record.user_id) === Number(req.user?.id)
  ),
  authorizeCreate: (req) => Boolean(req.user),
  beforeCreate: async (req, payload) => {
    const assignmentQuestionId = Number(payload.assignment_question_id);
    if (!assignmentQuestionId) {
      const error = new Error('assignment_question_id is required');
      error.status = 400;
      throw error;
    }

    const assignmentQuestion = await loadQuestionOrThrow(assignmentQuestionId);
    const effective = isSystemAdmin(req.user) ? payload : { ...payload, user_id: req.user.id };
    if (!isSystemAdmin(req.user)) {
      await requireEnrollmentForCourse(effective.user_id, assignmentQuestion.Assignment?.course_id);
    }
    return effective;
  },
  beforeUpdate: async (req, payload, record) => {
    const effective = isSystemAdmin(req.user) ? payload : { ...payload, user_id: record.user_id };
    if (!isSystemAdmin(req.user)) {
      const assignmentQuestionId = effective.assignment_question_id ?? record.assignment_question_id;
      const assignmentQuestion = await loadQuestionOrThrow(assignmentQuestionId);
      await requireEnrollmentForCourse(effective.user_id, assignmentQuestion.Assignment?.course_id);
    }
    return effective;
  },
});

export default router;
