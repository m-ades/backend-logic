import { jest } from '@jest/globals';
import errorHandler from '../middleware/error-handler.js';

const findAll = jest.fn();
const findByPk = jest.fn();
const update = jest.fn();
const create = jest.fn();
const findOne = jest.fn();

jest.unstable_mockModule('../models/index.js', () => ({
  AssignmentDraft: { findAll, findByPk, update, create, findOne },
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
});
