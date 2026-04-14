import { createCrudRouter } from './crud.js';
import { AssignmentQuestion, QuestionSession } from '../models/index.js';
import { isSystemAdmin } from '../utils/authorization.js';

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

    const assignmentQuestion = await AssignmentQuestion.findByPk(assignmentQuestionId);
    if (!assignmentQuestion) {
      const error = new Error('assignment_question_id not found');
      error.status = 404;
      throw error;
    }

    return isSystemAdmin(req.user) ? payload : { ...payload, user_id: req.user.id };
  },
  beforeUpdate: (req, payload, record) => (
    isSystemAdmin(req.user) ? payload : { ...payload, user_id: record.user_id }
  ),
});

export default router;
