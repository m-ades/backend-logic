import { jest } from '@jest/globals';
import errorHandler from '../middleware/error-handler.js';

const findOne = jest.fn();
const findAll = jest.fn();
const createEnrollment = jest.fn();
const findByPk = jest.fn();
const userFindOne = jest.fn();
const userCreate = jest.fn();
const hashPassword = jest.fn();

jest.unstable_mockModule('../models/index.js', () => ({
  Assignment: {},
  AssignmentExtension: {},
  Accommodation: {},
  AssignmentGrade: {},
  AssignmentQuestion: {},
  AssignmentQuestionOverride: {},
  Submission: {},
  CourseEnrollment: { findOne, findAll, create: createEnrollment },
  User: { findByPk, findOne: userFindOne, create: userCreate },
}));

jest.unstable_mockModule('../utils/passwords.js', () => ({
  hashPassword,
  verifyPassword: jest.fn(),
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
    createEnrollment.mockReset();
    findByPk.mockReset();
    userFindOne.mockReset();
    userCreate.mockReset();
    hashPassword.mockReset();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy?.mockRestore();
  });

  describe('GET /courses/:id/roster', () => {
    it('returns 403 when user is not an instructor', async () => {
      findOne.mockResolvedValueOnce(null);

      const handlers = getRouteHandlers('/courses/:id/roster', 'get');
      const req = { params: { id: '1' }, user: { id: 2 } };
      const res = await runHandlers(handlers, req, createRes());
      expect(res.statusCode).toBe(403);
    });

    it('returns roster for instructors', async () => {
      findOne.mockResolvedValueOnce({ role: 'instructor' });
      findAll.mockResolvedValueOnce([{ id: 1, role: 'student' }]);

      const handlers = getRouteHandlers('/courses/:id/roster', 'get');
      const req = { params: { id: '1' }, user: { id: 2 } };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([{ id: 1, role: 'student' }]);
    });

    it('returns 500 on model errors', async () => {
      findOne.mockResolvedValueOnce({ role: 'instructor' });
      findAll.mockRejectedValueOnce(new Error('db down'));

      const handlers = getRouteHandlers('/courses/:id/roster', 'get');
      const req = { params: { id: '1' }, user: { id: 2 } };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(500);
      expect(res.body.message).toBe('internal server error');
    });
  });

  describe('POST /courses/:id/students/bulk', () => {
    it('imports students and skips duplicates', async () => {
      findByPk.mockResolvedValueOnce({ is_system_admin: true });
      userFindOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 12, username: 'dupe' });
      hashPassword.mockResolvedValue('hashed');
      userCreate.mockResolvedValueOnce({ id: 21, username: 'alice', password_hash: 'hashed' });
      createEnrollment.mockResolvedValueOnce({});

      const handlers = getRouteHandlers('/courses/:id/students/bulk', 'post');
      const req = {
        params: { id: '1' },
        body: {
          students: [
            { username: 'alice', password: 'pw' },
            { username: 'dupe', password: 'pw2' },
          ],
        },
        user: { id: 99 },
      };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(201);
      expect(res.body.imported).toBe(1);
      expect(res.body.skipped).toBe(1);
      expect(res.body.students).toEqual([{ id: 21, username: 'alice' }]);
      expect(res.body.errors).toEqual([{ username: 'dupe', reason: 'Username already in use' }]);
    });
  });

  describe('DELETE /courses/:id/students/:studentId', () => {
    it('removes student enrollment', async () => {
      findByPk.mockResolvedValueOnce({ is_system_admin: true });
      const destroy = jest.fn().mockResolvedValueOnce();
      findOne.mockResolvedValueOnce({ destroy });

      const handlers = getRouteHandlers('/courses/:id/students/:studentId', 'delete');
      const req = { params: { id: '1', studentId: '5' }, user: { id: 99 } };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ deleted: true, course_id: 1, user_id: 5 });
      expect(destroy).toHaveBeenCalledTimes(1);
    });
  });
});
