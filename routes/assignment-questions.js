import express from 'express';
import { body } from 'express-validator';
import { createCrudRouter } from './crud.js';
import {
  Assignment,
  AssignmentGrade,
  AssignmentQuestion,
  Course,
  sequelize,
} from '../models/index.js';
import { handleValidationResult } from '../middleware/validation.js';
import { requireUser } from '../middleware/auth.js';
import { isSystemAdmin } from '../utils/authorization.js';
import {
  assignmentIdBody,
} from '../validators/common.js';
import { assertValidQuestionSnapshot } from '../validators/question-snapshot.js';
import { LEGACY_LOGIC_SYSTEM, normalizeLogicSystem } from '../lib/logicSystems.js';
import { recomputeAssignmentGrade } from '../utils/grades.js';
import { requireInstructorOrAdmin } from './instructor.js';

const router = express.Router();

// require auth. 401 if no user.
router.use(requireUser);

async function ensureInstructorForAssignment(assignmentId, userId) {
  if (!assignmentId || !userId) return false;
  const assignment = await Assignment.findByPk(assignmentId, { attributes: ['course_id'] });
  return assignment ? requireInstructorOrAdmin(assignment.course_id, userId) : false;
}

// assignment must exist. 404 if not. run before auth.
async function requireAssignmentExists(assignmentId) {
  if (!assignmentId) return null;
  return Assignment.findByPk(assignmentId, {
    attributes: ['id', 'course_id'],
    include: [{ model: Course, attributes: ['logic_system'] }],
  });
}

async function assertValidSnapshotForAssignment(questionSnapshot, assignmentOrId) {
  const type = questionSnapshot?.type
    || questionSnapshot?.problemType
    || questionSnapshot?.logic_problem_type;
  if (type !== 'proof-argument-extraction') return;

  const assignment = typeof assignmentOrId === 'object'
    ? assignmentOrId
    : await requireAssignmentExists(assignmentOrId);
  if (!assignment) {
    const error = new Error('Assignment not found');
    error.status = 404;
    throw error;
  }
  const logicSystem = normalizeLogicSystem(
    assignment.Course?.logic_system,
    LEGACY_LOGIC_SYSTEM
  );
  await assertValidQuestionSnapshot(questionSnapshot, { logicSystem });
}

function normalizeAttemptLimit(value) {
  const limit = Number(value);
  return Number.isInteger(limit) && limit >= 1 ? limit : 3;
}

// deletes assignment questions and restores every persisted grade in one transaction
// returns the number of questions deleted
// leaves grades unchanged when no matching question exists
// rolls back deletion when any grade cannot be restored
async function deleteQuestionsAndRecomputeGrades(assignmentId, ids) {
  return sequelize.transaction(async (transaction) => {
    const gradeRows = await AssignmentGrade.findAll({
      where: { assignment_id: assignmentId },
      attributes: ['user_id'],
      transaction,
    });
    const deleted = await AssignmentQuestion.destroy({
      where: { id: ids, assignment_id: assignmentId },
      transaction,
    });
    if (!deleted) return 0;

    for (const grade of gradeRows) {
      await recomputeAssignmentGrade({
        assignmentId,
        userId: grade.user_id,
        transaction,
      });
    }
    return deleted;
  });
}

// deep merge. source overwrites. arrays replace.
function deepMerge(target, source) {
  if (source == null) return target;
  if (Array.isArray(source)) return source;
  if (typeof source !== 'object') return source;
  const existing = target != null && typeof target === 'object' && !Array.isArray(target) ? target : {};
  const out = { ...existing };
  for (const key of Object.keys(source)) {
    out[key] = deepMerge(out[key], source[key]);
  }
  return out;
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
      attempt_limit: normalizeAttemptLimit(question.attempt_limit),
    }));

    if (payload.some((item) => item.question_snapshot == null || item.order_index == null)) {
      return res.status(400).json({
        message: 'Each question requires question_snapshot and order_index',
      });
    }

    for (const item of payload) {
      await assertValidSnapshotForAssignment(item.question_snapshot, assignment);
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

    const deleted = await deleteQuestionsAndRecomputeGrades(assignmentId, ids);

    res.json({ deleted });
  } catch (error) {
    next(error);
  }
});

router.use(
  '/',
  createCrudRouter(AssignmentQuestion, {
    beforeCreate: async (_req, body) => {
      await assertValidSnapshotForAssignment(body.question_snapshot, body.assignment_id);
      return {
        ...body,
        attempt_limit: normalizeAttemptLimit(body.attempt_limit),
      };
    },
    beforeUpdate: async (req, body, record) => {
      const payload = {}
      if (body.question_snapshot !== undefined) {
        const existing = record?.question_snapshot ?? {}
        let merged = deepMerge(
          typeof existing === 'object' && existing !== null ? existing : {},
          body.question_snapshot
        )
        const t = merged?.type ?? merged?.logic_problem_type
        if (t === 'single-row-truth-table' && merged && typeof merged === 'object') {
          delete merged.singleRowTruthTable
        }
        await assertValidSnapshotForAssignment(merged, record.assignment_id)
        payload.question_snapshot = merged
      }
      if (body.attempt_limit !== undefined) {
        const n = Number(body.attempt_limit)
        if (Number.isInteger(n) && n >= 1) payload.attempt_limit = n
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
    // No product flow reads raw question_snapshot (with answer keys) through this
    // generic endpoint for students; restrict all record access to the assignment's
    // instructor/admin so answer keys can't be pulled directly by id.
    authorizeRecord: async (req, record) => ensureInstructorForAssignment(record.assignment_id, req.user.id),
    // The unfiltered collection route has no course scoping, so it's restricted to
    // system administrators. Instructors already load a course's questions through
    // /api/assignments/:id/questions and /bulk create above.
    authorizeList: async (req) => isSystemAdmin(req.user),
  })
);

export default router;
