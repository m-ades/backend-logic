import { jest } from '@jest/globals';
import errorHandler from '../middleware/error-handler.js';

const findAll = jest.fn();
const findByPk = jest.fn();
const update = jest.fn();
const create = jest.fn();
const findOne = jest.fn();
const assignmentQuestionFindByPk = jest.fn();
const courseEnrollmentFindOne = jest.fn();

jest.unstable_mockModule('../models/index.js', () => ({
  AssignmentDraft: { findAll, findByPk, update, create, findOne },
  AssignmentQuestion: { findByPk: assignmentQuestionFindByPk },
  Assignment: {},
  CourseEnrollment: { findOne: courseEnrollmentFindOne },
}));

jest.unstable_mockModule('../utils/authorization.js', () => ({
  ensureSelfOrAdmin: () => true,
  isSystemAdmin: (user) => Boolean(user?.is_system_admin),
}));

const assignmentDraftsRouter = (await import('../routes/assignment-drafts.js')).default;

const getRouteHandlers = (path, method) => {
  const layer = assignmentDraftsRouter.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods[method]
  );
  if (!layer) {
    throw new Error(`route not found: ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack.map((entry) => entry.handle);
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
    const handler = handlers[index];
    let nextCalled = false;

    await handler(req, res, (err) => {
      nextCalled = true;
      if (err) {
        error = err;
      } else {
        index += 1;
      }
    });

    if (!nextCalled) {
      break;
    }
  }

  if (error) {
    await errorHandler(error, req, res, () => {});
  }

  return res;
};

describe('assignment draft routes', () => {
  beforeEach(() => {
    findAll.mockReset();
    findByPk.mockReset();
    update.mockReset();
    create.mockReset();
    findOne.mockReset();
    assignmentQuestionFindByPk.mockReset().mockResolvedValue({
      id: 237,
      Assignment: { course_id: 3 },
    });
    courseEnrollmentFindOne.mockReset().mockResolvedValue({ id: 1 });
  });

  it('updates an existing draft without creating a duplicate row', async () => {
    // the common autosave path should stay on update and skip insert
    const saved = { id: 9, assignment_question_id: 237, user_id: 48 };
    update.mockResolvedValueOnce([1]);
    findOne.mockResolvedValueOnce(saved);

    const handlers = getRouteHandlers('/', 'put');
    const req = {
      body: { assignment_question_id: 237, user_id: 48, draft_data: { ans: 'p' } },
      user: { id: 48, is_system_admin: false },
    };
    const res = await runHandlers(handlers, req, createRes());

    expect(res.statusCode).toBe(200);
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(findOne).toHaveBeenCalledWith({
      where: { assignment_question_id: 237, user_id: 48 },
    });
    expect(res.body).toBe(saved);
  });

  it('recovers from a concurrent unique violation by returning the winning row', async () => {
    // if two saves race the loser should reuse the row that already won
    const saved = {
      id: 11,
      assignment_question_id: 237,
      user_id: 48,
      update: jest.fn().mockResolvedValueOnce(),
    };
    update.mockResolvedValueOnce([0]);
    create.mockRejectedValueOnce({ name: 'SequelizeUniqueConstraintError' });
    findOne.mockResolvedValueOnce(saved);

    const handlers = getRouteHandlers('/', 'put');
    const req = {
      body: { assignment_question_id: 237, user_id: 48, draft_data: { ans: 'q' } },
      user: { id: 48, is_system_admin: false },
    };
    const res = await runHandlers(handlers, req, createRes());

    expect(res.statusCode).toBe(200);
    expect(saved.update).toHaveBeenCalledTimes(1);
    expect(res.body).toBe(saved);
  });

  it('rejects a draft upsert for a question in a course the caller is not enrolled in', async () => {
    courseEnrollmentFindOne.mockResolvedValueOnce(null);

    const handlers = getRouteHandlers('/', 'put');
    const req = {
      body: { assignment_question_id: 237, user_id: 48, draft_data: { ans: 'p' } },
      user: { id: 48, is_system_admin: false },
    };
    const res = await runHandlers(handlers, req, createRes());

    expect(res.statusCode).toBe(403);
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a draft upsert for a nonexistent question', async () => {
    assignmentQuestionFindByPk.mockResolvedValueOnce(null);

    const handlers = getRouteHandlers('/', 'put');
    const req = {
      body: { assignment_question_id: 999, user_id: 48, draft_data: { ans: 'p' } },
      user: { id: 48, is_system_admin: false },
    };
    const res = await runHandlers(handlers, req, createRes());

    expect(res.statusCode).toBe(404);
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a generic draft create for a course the caller is not enrolled in', async () => {
    courseEnrollmentFindOne.mockResolvedValueOnce(null);

    const handlers = getRouteHandlers('/', 'post');
    const req = {
      body: { assignment_question_id: 237, draft_data: { ans: 'p' } },
      user: { id: 48, is_system_admin: false },
    };
    const res = await runHandlers(handlers, req, createRes());

    expect(res.statusCode).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it('allows a generic draft create for an enrolled caller', async () => {
    const saved = { id: 12, assignment_question_id: 237, user_id: 48 };
    create.mockResolvedValueOnce(saved);

    const handlers = getRouteHandlers('/', 'post');
    const req = {
      body: { assignment_question_id: 237, draft_data: { ans: 'p' } },
      user: { id: 48, is_system_admin: false },
    };
    const res = await runHandlers(handlers, req, createRes());

    expect(res.statusCode).toBe(201);
    expect(create).toHaveBeenCalledWith({
      assignment_question_id: 237,
      draft_data: { ans: 'p' },
      user_id: 48,
    });
  });

  it('allows a system administrator to create a draft for any question, skipping the enrollment check', async () => {
    const saved = { id: 13, assignment_question_id: 237, user_id: 99 };
    create.mockResolvedValueOnce(saved);

    const handlers = getRouteHandlers('/', 'post');
    const req = {
      body: { assignment_question_id: 237, user_id: 99, draft_data: { ans: 'p' } },
      user: { id: 1, is_system_admin: true },
    };
    const res = await runHandlers(handlers, req, createRes());

    expect(res.statusCode).toBe(201);
    /* the question must still exist (404 here), but
    the enrollment check itself is skipped for admins
    */
    expect(assignmentQuestionFindByPk).toHaveBeenCalledTimes(1);
    expect(courseEnrollmentFindOne).not.toHaveBeenCalled();
  });
});
