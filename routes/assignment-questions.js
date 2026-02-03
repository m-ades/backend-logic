import express from 'express';
import { body } from 'express-validator';
import { createCrudRouter } from './crud.js';
import { Assignment, AssignmentQuestion, CourseEnrollment, sequelize } from '../models/index.js';
import { handleValidationResult } from '../middleware/validation.js';
import { requireUser } from '../middleware/auth.js';
import {
  assignmentIdBody,
} from '../validators/common.js';
import { requireInstructorOrAdmin } from './instructor.js';

const router = express.Router();

// require auth. 401 if no user.
router.use(requireUser);

async function ensureInstructorForAssignment(assignmentId, userId) {
  if (!assignmentId || !userId) return false;
  const assignment = await Assignment.findByPk(assignmentId, { attributes: ['course_id'] });
  return assignment ? requireInstructorOrAdmin(assignment.course_id, userId) : false;
}

// read: instructor/admin or enrolled in course. write: instructor only.
async function canAccessAssignment(assignmentId, userId) {
  if (!assignmentId || !userId) return false;
  const assignment = await Assignment.findByPk(assignmentId, { attributes: ['course_id'] });
  if (!assignment) return false;
  if (await requireInstructorOrAdmin(assignment.course_id, userId)) return true;
  const enrollment = await CourseEnrollment.findOne({
    where: { course_id: assignment.course_id, user_id: userId },
  });
  return Boolean(enrollment);
}

// assignment must exist. 404 if not. run before auth.
async function requireAssignmentExists(assignmentId) {
  if (!assignmentId) return null;
  return Assignment.findByPk(assignmentId, { attributes: ['id'] });
}

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
    const assignment = await requireAssignmentExists(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }
    if (!(await ensureInstructorForAssignment(assignmentId, req.user.id))) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const questions = Array.isArray(req.body.questions) ? req.body.questions : null;

    const payload = questions.map((question) => ({
      assignment_id: assignmentId,
      question_snapshot: question.question_snapshot,
      order_index: question.order_index,
      points_value: question.points_value ?? 100,
      attempt_limit: question.attempt_limit ?? 3,
    }));

    if (payload.some((item) => item.question_snapshot == null || item.order_index == null)) {
      return res.status(400).json({
        message: 'Each question requires question_snapshot and order_index',
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
    const assignment = await requireAssignmentExists(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }
    if (!(await ensureInstructorForAssignment(assignmentId, req.user.id))) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const order = Array.isArray(req.body.order) ? req.body.order : null;

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
    const assignment = await requireAssignmentExists(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }
    if (!(await ensureInstructorForAssignment(assignmentId, req.user.id))) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const ids = Array.isArray(req.body.ids) ? req.body.ids : null;

    const deleted = await AssignmentQuestion.destroy({
      where: { id: ids, assignment_id: assignmentId },
    });

    res.json({ deleted });
  } catch (error) {
    next(error);
  }
});

router.use(
  '/',
  createCrudRouter(AssignmentQuestion, {
    beforeUpdate: (req, body, record) => {
      const payload = {}
      if (body.question_snapshot !== undefined) payload.question_snapshot = body.question_snapshot
      if (body.attempt_limit !== undefined) {
        const n = Number(body.attempt_limit)
        if (Number.isInteger(n) && n >= 0) payload.attempt_limit = n
      }
      if (Object.keys(payload).length === 0) {
        const err = new Error('no valid fields to update')
        err.status = 400
        throw err
      }
      return payload
    },
    authorizeCreate: async (req) => {
      const assignmentId = req.body?.assignment_id
      if (assignmentId == null || assignmentId === '' || !Number.isFinite(Number(assignmentId))) {
        const err = new Error('assignment_id required')
        err.status = 400
        throw err
      }
      const assignment = await requireAssignmentExists(Number(assignmentId))
      if (!assignment) {
        const err = new Error('Assignment not found')
        err.status = 404
        throw err
      }
      return ensureInstructorForAssignment(Number(assignmentId), req.user.id)
    },
    authorizeRecord: async (req, record, action) => {
      if (action === 'read') return canAccessAssignment(record.assignment_id, req.user.id)
      return ensureInstructorForAssignment(record.assignment_id, req.user.id)
    },
  })
);

export default router;
