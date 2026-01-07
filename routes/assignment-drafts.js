import { createCrudRouter } from './crud.js';
import { body } from 'express-validator';
import { handleValidationResult } from '../middleware/validation.js';
import {
  assignmentQuestionIdBody,
  userIdBody,
} from '../validators/common.js';
import { AssignmentDraft } from '../models/index.js';

const router = createCrudRouter(AssignmentDraft);

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

    const existing = await AssignmentDraft.findOne({
      where: { assignment_question_id, user_id },
    });

    if (existing) {
      await existing.update({ draft_data, updated_at: new Date() });
      return res.json(existing);
    }

    const created = await AssignmentDraft.create({
      assignment_question_id,
      user_id,
      draft_data,
      updated_at: new Date(),
    });
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

export default router;
