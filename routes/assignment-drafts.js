import { createCrudRouter } from './crud.js';
import { body } from 'express-validator';
import { handleValidationResult } from '../middleware/validation.js';
import {
  assignmentQuestionIdBody,
  userIdBody,
} from '../validators/common.js';
import { AssignmentDraft, AssignmentQuestion, Assignment } from '../models/index.js';
import { ensureSelfOrAdmin, isSystemAdmin } from '../utils/authorization.js';
import { requireEnrollmentForCourse } from '../utils/enrollment.js';

async function assertDraftEnrollment(req, userId, assignmentQuestionId) {
  if (isSystemAdmin(req.user)) return;
  const question = await AssignmentQuestion.findByPk(assignmentQuestionId, {
    include: [{ model: Assignment }],
  });
  if (!question) {
    const error = new Error('assignment_question_id not found');
    error.status = 404;
    throw error;
  }
  await requireEnrollmentForCourse(userId, question.Assignment?.course_id);
}

const router = createCrudRouter(AssignmentDraft, {
  listFilter: (req) => (isSystemAdmin(req.user) ? {} : { where: { user_id: req.user.id } }),
  authorizeRecord: (req, record) => (
    isSystemAdmin(req.user) || Number(record.user_id) === Number(req.user?.id)
  ),
  authorizeCreate: (req) => Boolean(req.user),
  beforeCreate: async (req, payload) => {
    const effective = isSystemAdmin(req.user) ? payload : { ...payload, user_id: req.user.id };
    await assertDraftEnrollment(req, effective.user_id, effective.assignment_question_id);
    return effective;
  },
  beforeUpdate: async (req, payload, record) => {
    const effective = isSystemAdmin(req.user) ? payload : { ...payload, user_id: record.user_id };
    const assignmentQuestionId = effective.assignment_question_id ?? record.assignment_question_id;
    await assertDraftEnrollment(req, effective.user_id, assignmentQuestionId);
    return effective;
  },
});

router.put(
  '/',
  [
    assignmentQuestionIdBody,
    userIdBody,
    body('draft_data').exists().withMessage('draft_data is required'),
    handleValidationResult,
  ],
  async (req, res, next) => {
  try {
    const { assignment_question_id, user_id, draft_data } = req.body;
    if (!ensureSelfOrAdmin(req, res, user_id)) {
      return;
    }
    const effectiveUserId = isSystemAdmin(req.user) ? user_id : req.user.id;
    await assertDraftEnrollment(req, effectiveUserId, assignment_question_id);
    const updated_at = new Date();
    const where = { assignment_question_id, user_id: effectiveUserId };

    // update first so repeat autosaves do not race on create
    const [updatedCount] = await AssignmentDraft.update(
      { draft_data, updated_at },
      { where }
    );

    if (updatedCount > 0) {
      const existing = await AssignmentDraft.findOne({ where });
      return res.json(existing);
    }

    try {
      const created = await AssignmentDraft.create({
        assignment_question_id,
        user_id: effectiveUserId,
        draft_data,
        updated_at,
      });
      return res.status(201).json(created);
    } catch (error) {
      if (error?.name !== 'SequelizeUniqueConstraintError') {
        throw error;
      }

      // another request won the insert so update that row instead
      const existing = await AssignmentDraft.findOne({ where });
      if (!existing) {
        throw error;
      }

      await existing.update({ draft_data, updated_at });
      return res.json(existing);
    }
  } catch (error) {
    next(error);
  }
});

export default router;
