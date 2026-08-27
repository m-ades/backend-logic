import { createCrudRouter } from './crud.js';
import { QuestionSession } from '../models/index.js';
import { isSystemAdmin } from '../utils/authorization.js';
import { requireEnrollmentForAssignmentQuestion } from '../utils/enrollment.js';

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

    await requireEnrollmentForAssignmentQuestion(req.user, assignmentQuestionId);
    return isSystemAdmin(req.user) ? payload : { ...payload, user_id: req.user.id };
  },
  beforeUpdate: async (req, payload, record) => {
    const effective = isSystemAdmin(req.user) ? payload : { ...payload, user_id: record.user_id };
    const assignmentQuestionId = effective.assignment_question_id ?? record.assignment_question_id;
    await requireEnrollmentForAssignmentQuestion(req.user, assignmentQuestionId);
    return effective;
  },
});

export default router;
