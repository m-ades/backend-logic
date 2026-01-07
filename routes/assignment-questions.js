import express from 'express';
import { body } from 'express-validator';
import { createCrudRouter } from './crud.js';
import { AssignmentQuestion, sequelize } from '../models/index.js';
import { handleValidationResult } from '../middleware/validation.js';
import {
  assignmentIdBody,
} from '../validators/common.js';

const router = express.Router();

router.post(
  '/bulk',
  [
    assignmentIdBody,
    body('questions').isArray({ min: 1 }).withMessage('questions must be a non-empty array'),
    handleValidationResult,
  ],
  async (req, res, next) => {
  try {
    const assignmentId = req.body.assignment_id;
    const questions = Array.isArray(req.body.questions) ? req.body.questions : null;

    // keep everything tied to one assignment + confirm correct format
    const payload = questions.map((question) => ({
      assignment_id: assignmentId,
      question_snapshot: question.question_snapshot,
      order_index: question.order_index,
      points_value: question.points_value,
      attempt_limit: question.attempt_limit ?? 3,
    }));

    if (payload.some((item) => item.question_snapshot == null || item.order_index == null || item.points_value == null)) {
      return res.status(400).json({
        message: 'Each question requires question_snapshot, order_index, and points_value',
      });
    }

    const created = await sequelize.transaction(async (transaction) => {
      return AssignmentQuestion.bulkCreate(payload, { returning: true, transaction });
    });
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

router.put(
  '/reorder',
  [
    assignmentIdBody,
    body('order').isArray({ min: 1 }).withMessage('order must be a non-empty array'),
    handleValidationResult,
  ],
  async (req, res, next) => {
  try {
    const assignmentId = req.body.assignment_id;
    const order = Array.isArray(req.body.order) ? req.body.order : null;

    // only accept id & new order_index here.
    const updates = order.map((item) => ({
      id: Number(item.id),
      order_index: item.order_index,
    }));

    if (updates.some((item) => !item.id || item.order_index == null)) {
      return res.status(400).json({ message: 'Each order item requires id and order_index' });
    }

    const questionIds = updates.map((item) => item.id);
    const existing = await AssignmentQuestion.findAll({
      where: { id: questionIds, assignment_id: assignmentId },
      attributes: ['id'],
    });

    if (existing.length !== updates.length) {
      return res.status(400).json({ message: 'All questions must belong to the assignment' });
    }

    /* 
    transaction wrapper to make db operations succeed as a unit.
    this shld be ok for now but replace with bulk CASE update later.
    */
    await sequelize.transaction(async (transaction) => {
      await Promise.all(
        updates.map((item) =>
          AssignmentQuestion.update(
            { order_index: item.order_index },
            { where: { id: item.id, assignment_id: assignmentId }, transaction }
          )
        )
      );
    });

    res.json({ updated: updates.length });
  } catch (error) {
    next(error);
  }
});

router.delete(
  '/',
  [
    assignmentIdBody,
    body('ids').isArray({ min: 1 }).withMessage('ids must be a non-empty array'),
    handleValidationResult,
  ],
  async (req, res, next) => {
  try {
    const assignmentId = req.body.assignment_id;
    const ids = Array.isArray(req.body.ids) ? req.body.ids : null;

    // delete multiple question ids in one go
    const deleted = await AssignmentQuestion.destroy({
      where: { id: ids, assignment_id: assignmentId },
    });

    res.json({ deleted });
  } catch (error) {
    next(error);
  }
});

router.use('/', createCrudRouter(AssignmentQuestion));

export default router;
