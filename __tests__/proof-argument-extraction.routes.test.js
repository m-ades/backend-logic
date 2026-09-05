import { jest } from '@jest/globals';
import errorHandler from '../middleware/error-handler.js';

const assignmentFindByPk = jest.fn();
const assignmentQuestionBulkCreate = jest.fn();
const assignmentQuestionCreate = jest.fn();
const assignmentQuestionDestroy = jest.fn();
const assignmentQuestionFindByPk = jest.fn();
const assignmentGradeFindAll = jest.fn();
const accommodationFindOne = jest.fn();
const courseEnrollmentFindOne = jest.fn();
const extensionFindOne = jest.fn();
const overrideFindOne = jest.fn();
const submissionCount = jest.fn();
const submissionCreate = jest.fn();
const requireInstructorOrAdmin = jest.fn();
const recomputeAssignmentGrade = jest.fn();
const databaseTransaction = {};
const transaction = jest.fn(async (callback) => callback(databaseTransaction));

jest.unstable_mockModule('../models/index.js', () => ({
  Accommodation: { findOne: accommodationFindOne },
  Assignment: { findByPk: assignmentFindByPk },
  AssignmentExtension: { findOne: extensionFindOne },
  AssignmentGrade: { findAll: assignmentGradeFindAll },
  AssignmentQuestion: {
    bulkCreate: assignmentQuestionBulkCreate,
    create: assignmentQuestionCreate,
    destroy: assignmentQuestionDestroy,
    findByPk: assignmentQuestionFindByPk,
  },
  AssignmentQuestionOverride: { findOne: overrideFindOne },
  Course: {},
  CourseEnrollment: { findOne: courseEnrollmentFindOne },
  Submission: { count: submissionCount, create: submissionCreate },
  User: {},
  sequelize: { transaction },
}));

jest.unstable_mockModule('../routes/instructor.js', () => ({
  requireInstructorOrAdmin,
}));

jest.unstable_mockModule('../utils/grades.js', () => ({
  ensureZeroGradesForPastDue: jest.fn(),
  ensureZeroGradesForUnlocked: jest.fn(),
  recomputeAssignmentGrade,
}));

const assignmentQuestionsRouter = (await import('../routes/assignment-questions.js')).default;
const validateRouter = (await import('../routes/validate.js')).default;

const getRouteHandlers = (router, path, method) => {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods[method]
  );
  if (!layer) throw new Error(`route not found: ${method.toUpperCase()} ${path}`);
  return layer.route.stack.map((entry) => entry.handle);
};

const getCrudRouter = (router) => {
  const layer = router.stack.find((entry) => Array.isArray(entry.handle?.stack));
  if (!layer) throw new Error('CRUD router not found');
  return layer.handle;
};

const createRes = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

const runHandlers = async (handlers, req, res) => {
  let index = 0;
  let error = null;
  while (index < handlers.length && !error) {
    let nextCalled = false;
    await handlers[index](req, res, (nextError) => {
      nextCalled = true;
      if (nextError) error = nextError;
      else index += 1;
    });
    if (!nextCalled) break;
  }
  if (error) await errorHandler(error, req, res, () => {});
  return res;
};

const assignment = {
  id: 9,
  course_id: 3,
  Course: { logic_system: 'fitch' },
};

const invalidScopeQuestion = {
  type: 'proof-argument-extraction',
  prems: ['P ∧ Q'],
  lines: ['P'],
  assumptionScopes: [{ start: 0, end: 0 }],
};

const validQuestion = {
  type: 'proof-argument-extraction',
  prems: ['P ∧ Q'],
  lines: ['P'],
  justifications: ['∧E 1'],
};

describe('proof argument extraction question boundaries', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    requireInstructorOrAdmin.mockResolvedValue(true);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('rejects invalid question data before create', async () => {
    assignmentFindByPk.mockResolvedValue(assignment);
    const handlers = getRouteHandlers(getCrudRouter(assignmentQuestionsRouter), '/', 'post');
    const req = {
      body: {
        assignment_id: assignment.id,
        order_index: 0,
        points_value: 100,
        question_snapshot: invalidScopeQuestion,
      },
      user: { id: 7 },
    };

    const res = await runHandlers(handlers, req, createRes());

    expect(res.statusCode).toBe(422);
    expect(res.body.message).toContain('must end before the conclusion');
    expect(assignmentQuestionCreate).not.toHaveBeenCalled();
  });

  it('normalizes nonpositive attempt limits when creating questions', async () => {
    assignmentFindByPk.mockResolvedValueOnce(assignment);
    assignmentQuestionCreate.mockImplementationOnce(async (payload) => payload);
    const handlers = getRouteHandlers(getCrudRouter(assignmentQuestionsRouter), '/', 'post');
    const req = {
      body: {
        assignment_id: assignment.id,
        order_index: 0,
        points_value: 100,
        attempt_limit: 0,
        question_snapshot: {
          type: 'symbolic-translation',
          prompt: 'Translate.',
          answer: 'P',
        },
      },
      user: { id: 7 },
    };

    const res = await runHandlers(handlers, req, createRes());

    expect(res.statusCode).toBe(201);
    expect(assignmentQuestionCreate).toHaveBeenCalledWith(expect.objectContaining({
      attempt_limit: 3,
    }));
  });

  it('recomputes persisted grades after deleting a question', async () => {
    assignmentFindByPk.mockResolvedValue(assignment);
    assignmentGradeFindAll.mockResolvedValue([{ user_id: 7 }, { user_id: 8 }]);
    assignmentQuestionDestroy.mockResolvedValue(1);
    recomputeAssignmentGrade.mockResolvedValue({});
    const handlers = getRouteHandlers(assignmentQuestionsRouter, '/', 'delete');
    const req = {
      body: { assignment_id: assignment.id, ids: [21] },
      user: { id: 4 },
    };

    const res = await runHandlers(handlers, req, createRes());

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ deleted: 1 });
    expect(assignmentQuestionDestroy).toHaveBeenCalledWith({
      where: { id: [21], assignment_id: assignment.id },
      transaction: databaseTransaction,
    });
    expect(recomputeAssignmentGrade).toHaveBeenCalledTimes(2);
    expect(recomputeAssignmentGrade).toHaveBeenCalledWith({
      assignmentId: assignment.id,
      userId: 7,
      transaction: databaseTransaction,
    });
  });

  it('rejects invalid provided citations before update', async () => {
    const update = jest.fn();
    assignmentQuestionFindByPk.mockResolvedValue({
      id: 21,
      assignment_id: assignment.id,
      question_snapshot: validQuestion,
      update,
    });
    assignmentFindByPk
      .mockResolvedValueOnce({ id: assignment.id, course_id: assignment.course_id })
      .mockResolvedValueOnce(assignment);
    const handlers = getRouteHandlers(getCrudRouter(assignmentQuestionsRouter), '/:id', 'put');
    const req = {
      params: { id: '21' },
      body: { question_snapshot: { justifications: ['∧E 2'] } },
      user: { id: 7 },
    };

    const res = await runHandlers(handlers, req, createRes());

    expect(res.statusCode).toBe(422);
    expect(res.body.message).toContain('Provided justification for line 2 is invalid');
    expect(update).not.toHaveBeenCalled();
  });

  it('does not record an attempt for legacy invalid question data', async () => {
    assignmentQuestionFindByPk.mockResolvedValue({
      id: 21,
      attempt_limit: 3,
      question_snapshot: invalidScopeQuestion,
      Assignment: {
        ...assignment,
        is_locked: false,
        kind: 'assignment',
      },
    });
    accommodationFindOne.mockResolvedValue(null);
    extensionFindOne.mockResolvedValue(null);
    overrideFindOne.mockResolvedValue(null);
    courseEnrollmentFindOne.mockResolvedValue({ id: 5 });
    submissionCount.mockResolvedValue(0);
    const handlers = getRouteHandlers(validateRouter, '/submission', 'post');
    const req = {
      body: {
        assignment_question_id: 21,
        user_id: 7,
        submission_data: {
          argumentLine: 'P ∧ Q ∴ P',
          justifications: ['∧E 1'],
        },
      },
      user: { id: 7 },
    };

    const res = await runHandlers(handlers, req, createRes());

    expect(res.statusCode).toBe(422);
    expect(res.body.message).toContain('must end before the conclusion');
    expect(submissionCreate).not.toHaveBeenCalled();
  });

  it('allows validation after a schedule is reached despite a stale lock flag', async () => {
    assignmentQuestionFindByPk.mockResolvedValue({
      id: 21,
      attempt_limit: 3,
      question_snapshot: invalidScopeQuestion,
      Assignment: {
        ...assignment,
        is_locked: true,
        publish_at: '2000-01-01T00:00:00Z',
        kind: 'assignment',
      },
    });
    accommodationFindOne.mockResolvedValue(null);
    extensionFindOne.mockResolvedValue(null);
    overrideFindOne.mockResolvedValue(null);
    courseEnrollmentFindOne.mockResolvedValue({ id: 5 });
    submissionCount.mockResolvedValue(0);
    const handlers = getRouteHandlers(validateRouter, '/submission', 'post');
    const req = {
      body: {
        assignment_question_id: 21,
        user_id: 7,
        submission_data: {
          argumentLine: 'P ∧ Q ∴ P',
          justifications: ['∧E 1'],
        },
      },
      user: { id: 7 },
    };

    const res = await runHandlers(handlers, req, createRes());

    expect(res.statusCode).toBe(422);
    expect(res.body.message).toContain('must end before the conclusion');
  });

  it('blocks validation before a schedule despite a stale unlocked flag', async () => {
    assignmentQuestionFindByPk.mockResolvedValue({
      id: 21,
      attempt_limit: 3,
      question_snapshot: validQuestion,
      Assignment: {
        ...assignment,
        is_locked: false,
        publish_at: '2999-01-01T00:00:00Z',
        kind: 'assignment',
      },
    });
    const handlers = getRouteHandlers(validateRouter, '/submission', 'post');
    const req = {
      body: {
        assignment_question_id: 21,
        user_id: 7,
        submission_data: {},
      },
      user: { id: 7 },
    };

    const res = await runHandlers(handlers, req, createRes());

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ message: 'assignment is locked' });
    expect(accommodationFindOne).not.toHaveBeenCalled();
  });
});
