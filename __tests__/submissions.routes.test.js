import { jest } from '@jest/globals';
import errorHandler from '../middleware/error-handler.js';

const findAll = jest.fn();
const findByPk = jest.fn();
const create = jest.fn();

jest.unstable_mockModule('../models/index.js', () => ({
  Submission: { findAll, findByPk, create },
}));

jest.unstable_mockModule('../utils/authorization.js', () => ({
  isSystemAdmin: (user) => Boolean(user?.is_system_admin),
}));

const submissionsRouter = (await import('../routes/submissions.js')).default;

const getRouteHandlers = (path, method) => {
  const layer = submissionsRouter.stack.find(
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
  ended: false,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
  end() {
    this.ended = true;
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

describe('submission routes', () => {
  beforeEach(() => {
    findAll.mockReset();
    findByPk.mockReset();
    create.mockReset();
  });

  it('limits student lists to their own submissions', async () => {
    findAll.mockResolvedValueOnce([]);
    const handlers = getRouteHandlers('/', 'get');
    const req = { user: { id: 42, is_system_admin: false } };
    const res = await runHandlers(handlers, req, createRes());

    expect(res.statusCode).toBe(200);
    expect(findAll).toHaveBeenCalledWith({
      order: [['id', 'ASC']],
      where: { user_id: 42 },
    });
  });

  it('allows students to read their own submission', async () => {
    const submission = { id: 9, user_id: 42 };
    findByPk.mockResolvedValueOnce(submission);
    const handlers = getRouteHandlers('/:id', 'get');
    const req = { params: { id: '9' }, user: { id: 42, is_system_admin: false } };
    const res = await runHandlers(handlers, req, createRes());

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(submission);
  });

  it('rejects forged student submissions', async () => {
    const handlers = getRouteHandlers('/', 'post');
    const req = {
      body: {
        assignment_question_id: 10,
        attempt: 999,
        score: 100,
        is_correct: true,
        submission_data: {},
      },
      user: { id: 42, is_system_admin: false },
    };
    const res = await runHandlers(handlers, req, createRes());

    expect(res.statusCode).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects student updates to owned submissions', async () => {
    const update = jest.fn();
    findByPk.mockResolvedValueOnce({ id: 9, user_id: 42, update });
    const handlers = getRouteHandlers('/:id', 'put');
    const req = {
      params: { id: '9' },
      body: { score: 100, is_correct: true },
      user: { id: 42, is_system_admin: false },
    };
    const res = await runHandlers(handlers, req, createRes());

    expect(res.statusCode).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects student deletion of attempts', async () => {
    const destroy = jest.fn();
    findByPk.mockResolvedValueOnce({ id: 9, user_id: 42, destroy });
    const handlers = getRouteHandlers('/:id', 'delete');
    const req = {
      params: { id: '9' },
      user: { id: 42, is_system_admin: false },
    };
    const res = await runHandlers(handlers, req, createRes());

    expect(res.statusCode).toBe(403);
    expect(destroy).not.toHaveBeenCalled();
  });

  it('allows system administrators to create submissions', async () => {
    const payload = {
      assignment_question_id: 10,
      user_id: 42,
      score: 100,
      is_correct: true,
    };
    const saved = { id: 9, ...payload };
    create.mockResolvedValueOnce(saved);
    const handlers = getRouteHandlers('/', 'post');
    const req = { body: payload, user: { id: 1, is_system_admin: true } };
    const res = await runHandlers(handlers, req, createRes());

    expect(res.statusCode).toBe(201);
    expect(create).toHaveBeenCalledWith(payload);
    expect(res.body).toBe(saved);
  });

  it('allows system administrators to update submissions', async () => {
    const update = jest.fn().mockResolvedValueOnce();
    const submission = { id: 9, user_id: 42, update };
    findByPk.mockResolvedValueOnce(submission);
    const handlers = getRouteHandlers('/:id', 'put');
    const payload = { score: 75, is_correct: false };
    const req = {
      params: { id: '9' },
      body: payload,
      user: { id: 1, is_system_admin: true },
    };
    const res = await runHandlers(handlers, req, createRes());

    expect(res.statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith(payload);
    expect(res.body).toBe(submission);
  });

  it('allows system administrators to delete submissions', async () => {
    const destroy = jest.fn().mockResolvedValueOnce();
    findByPk.mockResolvedValueOnce({ id: 9, user_id: 42, destroy });
    const handlers = getRouteHandlers('/:id', 'delete');
    const req = {
      params: { id: '9' },
      user: { id: 1, is_system_admin: true },
    };
    const res = await runHandlers(handlers, req, createRes());

    expect(res.statusCode).toBe(204);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(res.ended).toBe(true);
  });
});
