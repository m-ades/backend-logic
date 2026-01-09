import { createCrudRouter } from './crud.js';
import { body } from 'express-validator';
import { handleValidationResult } from '../middleware/validation.js';
import {
  assignmentQuestionIdBody,
  userIdBody,
} from '../validators/common.js';
import { AssignmentDraft } from '../models/index.js';
import { ensureSelfOrAdmin, isSystemAdmin } from '../utils/authorization.js';

const router = createCrudRouter(AssignmentDraft, {
  listFilter: (req) => (isSystemAdmin(req.user) ? {} : { where: { user_id: req.user.id } }),
  authorizeRecord: (req, record) => (
    isSystemAdmin(req.user) || Number(record.user_id) === Number(req.user?.id)
  ),
  authorizeCreate: (req) => Boolean(req.user),
  beforeCreate: (req, payload) => (
    isSystemAdmin(req.user) ? payload : { ...payload, user_id: req.user.id }
  ),
  beforeUpdate: (req, payload, record) => (
    isSystemAdmin(req.user) ? payload : { ...payload, user_id: record.user_id }
  ),
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

    const existing = await AssignmentDraft.findOne({
      where: { assignment_question_id, user_id },
    });

    if (existing) {
      await existing.update({ draft_data, updated_at: new Date() });
      return res.json(existing);
    }

    const created = await AssignmentDraft.create({
      assignment_question_id,
      user_id: isSystemAdmin(req.user) ? user_id : req.user.id,
      draft_data,
      updated_at: new Date(),
    });
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

export default router;
