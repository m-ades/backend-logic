import { jest } from '@jest/globals';
import errorHandler from '../middleware/error-handler.js';

const findOne = jest.fn();
const findAll = jest.fn();

jest.unstable_mockModule('../models/index.js', () => ({
  Assignment: {},
  AssignmentExtension: {},
  Accommodation: {},
  AssignmentGrade: {},
  AssignmentQuestion: {},
  Submission: {},
  CourseEnrollment: { findOne, findAll },
  User: { findByPk: jest.fn() },
}));

const instructorRouter = (await import('../routes/instructor.js')).default;

const getRouteHandlers = (path, method) => {
  const layer = instructorRouter.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods[method]
  );
  if (!layer) {
    throw new Error(`route not found: ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack.map((entry) => entry.handle);
};

const createRes = () => {
  const res = {
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
  };
  return res;
};

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

describe('instructor routes', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    findOne.mockReset();
    findAll.mockReset();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy?.mockRestore();
  });

  describe('GET /courses/:id/roster', () => {
    it('returns 400 when userId is missing', async () => {
      const handlers = getRouteHandlers('/courses/:id/roster', 'get');
      const req = { params: { id: '1' }, query: {} };
      const res = await runHandlers(handlers, req, createRes());
      expect(res.statusCode).toBe(400);
    });

    it('returns roster for instructors', async () => {
      findOne.mockResolvedValueOnce({ role: 'instructor' });
      findAll.mockResolvedValueOnce([{ id: 1, role: 'student' }]);

      const handlers = getRouteHandlers('/courses/:id/roster', 'get');
      const req = { params: { id: '1' }, query: { userId: '2' } };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([{ id: 1, role: 'student' }]);
    });

    it('returns 500 on model errors', async () => {
      findOne.mockResolvedValueOnce({ role: 'instructor' });
      findAll.mockRejectedValueOnce(new Error('db down'));

      const handlers = getRouteHandlers('/courses/:id/roster', 'get');
      const req = { params: { id: '1' }, query: { userId: '2' } };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBe('internal server error');
    });
  });
});
