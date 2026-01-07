import express from 'express';
import { createCrudRouter } from './crud.js';
import { AssignmentQuestion, sequelize } from '../models/index.js';

const router = express.Router();

router.post('/bulk', async (req, res) => {
  try {
    const assignmentId = Number(req.body.assignment_id);
    const questions = Array.isArray(req.body.questions) ? req.body.questions : null;
    if (!assignmentId || !questions?.length) {
      return res.status(400).json({ message: 'assignment_id and questions are required' });
    }

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
    res.status(400).json({ message: error.message });
  }
});

router.put('/reorder', async (req, res) => {
  try {
    const assignmentId = Number(req.body.assignment_id);
    const order = Array.isArray(req.body.order) ? req.body.order : null;
    if (!assignmentId || !order?.length) {
      return res.status(400).json({ message: 'assignment_id and order are required' });
    }

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
    res.status(400).json({ message: error.message });
  }
});

router.delete('/', async (req, res) => {
  try {
    const assignmentId = Number(req.body.assignment_id);
    const ids = Array.isArray(req.body.ids) ? req.body.ids : null;
    if (!assignmentId || !ids?.length) {
      return res.status(400).json({ message: 'assignment_id and ids are required' });
    }

    // delete multiple question ids in one go
    const deleted = await AssignmentQuestion.destroy({
      where: { id: ids, assignment_id: assignmentId },
    });

    res.json({ deleted });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.use('/', createCrudRouter(AssignmentQuestion));

export default router;
