import { jest } from '@jest/globals';
import errorHandler from '../middleware/error-handler.js';

const findAll = jest.fn();
const findByPk = jest.fn();
const update = jest.fn();
const create = jest.fn();
const assignmentFindByPk = jest.fn();
const courseEnrollmentFindOne = jest.fn();

jest.unstable_mockModule('../models/index.js', () => ({
  AssignmentSession: { findAll, findByPk, update, create },
  Assignment: { findByPk: assignmentFindByPk },
  AssignmentQuestion: {},
  CourseEnrollment: { findOne: courseEnrollmentFindOne },
}));

const assignmentSessionsRouter = (await import('../routes/assignment-sessions.js')).default;

const getRouteHandlers = (path, method) => {
  const layer = assignmentSessionsRouter.stack.find(
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

describe('assignment session routes', () => {
  beforeEach(() => {
    findAll.mockReset();
    findByPk.mockReset();
    update.mockReset();
    create.mockReset();
    assignmentFindByPk.mockReset().mockResolvedValue({ id: 9, course_id: 3 });
    courseEnrollmentFindOne.mockReset().mockResolvedValue({ id: 1 });
  });

  describe('POST /', () => {
    it('creates a session for an enrolled caller', async () => {
      create.mockResolvedValueOnce({ id: 1, assignment_id: 9, user_id: 42 });

      const handlers = getRouteHandlers('/', 'post');
      const req = {
        body: { assignment_id: 9, started_at: '2026-04-09T00:00:00Z' },
        user: { id: 42, is_system_admin: false },
      };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(201);
      expect(create).toHaveBeenCalledWith({
        assignment_id: 9,
        started_at: '2026-04-09T00:00:00Z',
        user_id: 42,
      });
    });

    it('rejects a session for a nonexistent assignment', async () => {
      assignmentFindByPk.mockResolvedValueOnce(null);

      const handlers = getRouteHandlers('/', 'post');
      const req = {
        body: { assignment_id: 999, started_at: '2026-04-09T00:00:00Z' },
        user: { id: 42, is_system_admin: false },
      };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(404);
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects a session for a course the caller is not enrolled in', async () => {
      courseEnrollmentFindOne.mockResolvedValueOnce(null);

      const handlers = getRouteHandlers('/', 'post');
      const req = {
        body: { assignment_id: 9, started_at: '2026-04-09T00:00:00Z' },
        user: { id: 42, is_system_admin: false },
      };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(403);
      expect(create).not.toHaveBeenCalled();
    });

    it('allows system administrators to create a session without an enrollment check', async () => {
      create.mockResolvedValueOnce({ id: 1, assignment_id: 9, user_id: 7 });

      const handlers = getRouteHandlers('/', 'post');
      const req = {
        body: { assignment_id: 9, user_id: 7, started_at: '2026-04-09T00:00:00Z' },
        user: { id: 1, is_system_admin: true },
      };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(201);
      // the assignment must still exist (a friendly 404, not a raw DB error), but
      // the enrollment check itself is skipped for admins
      expect(assignmentFindByPk).toHaveBeenCalledTimes(1);
      expect(courseEnrollmentFindOne).not.toHaveBeenCalled();
      expect(create).toHaveBeenCalledWith({
        assignment_id: 9,
        user_id: 7,
        started_at: '2026-04-09T00:00:00Z',
      });
    });
  });

  describe('PUT /:id', () => {
    it('rejects moving a session to an assignment in a course the caller is not enrolled in', async () => {
      const update = jest.fn();
      findByPk.mockResolvedValueOnce({ id: 5, user_id: 42, assignment_id: 1, update });
      courseEnrollmentFindOne.mockResolvedValueOnce(null);

      const handlers = getRouteHandlers('/:id', 'put');
      const req = {
        params: { id: '5' },
        body: { assignment_id: 9, ended_at: '2026-04-09T01:00:00Z' },
        user: { id: 42, is_system_admin: false },
      };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(403);
      expect(update).not.toHaveBeenCalled();
    });
  });
});
