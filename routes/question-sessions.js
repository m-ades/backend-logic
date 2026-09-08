import { param } from 'express-validator';
import { createCrudRouter } from './crud.js';
import { QuestionSession } from '../models/index.js';
import { isSystemAdmin } from '../utils/authorization.js';
import { requireEnrollmentForAssignmentQuestion } from '../utils/enrollment.js';
import { handleValidationResult } from '../middleware/validation.js';

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

/*
tab/browser close can't complete a normal PUT before the page unloads, so the
client fires this via navigator.sendBeacon (POST-only, no custom headers) as
a best-effort backstop. idempotent and tolerant of an already-gone record
since nothing reads the response.
*/
router.post(
  '/:id/close',
  [param('id').isInt({ gt: 0 }).toInt().withMessage('id must be a positive integer'), handleValidationResult],
  async (req, res, next) => {
    try {
      const record = await QuestionSession.findByPk(req.params.id);
      if (!record) {
        return res.status(204).end();
      }
      if (!isSystemAdmin(req.user) && Number(record.user_id) !== Number(req.user?.id)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      if (!record.ended_at) {
        await record.update({ ended_at: new Date() });
      }
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  }
);

export default router;
