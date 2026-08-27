import { jest } from '@jest/globals';
import errorHandler from '../middleware/error-handler.js';

const findOne = jest.fn();
const findAll = jest.fn();
const createEnrollment = jest.fn();
const findByPk = jest.fn();
const userFindOne = jest.fn();
const userCreate = jest.fn();
const hashPassword = jest.fn();
const assignmentFindByPk = jest.fn();
const assignmentFindAll = jest.fn();
const accommodationFindOne = jest.fn();
const accommodationCreate = jest.fn();
const extensionFindOne = jest.fn();
const extensionCreate = jest.fn();
const assignmentQuestionFindByPk = jest.fn();
const overrideFindOne = jest.fn();
const overrideCreate = jest.fn();
const recomputeAssignmentGrade = jest.fn();

jest.unstable_mockModule('../models/index.js', () => ({
  Assignment: { findByPk: assignmentFindByPk, findAll: assignmentFindAll },
  AssignmentExtension: { findOne: extensionFindOne, create: extensionCreate },
  Accommodation: { findOne: accommodationFindOne, create: accommodationCreate },
  AssignmentGrade: {},
  AssignmentQuestion: { findByPk: assignmentQuestionFindByPk },
  AssignmentQuestionOverride: { findOne: overrideFindOne, create: overrideCreate },
  Submission: {},
  CourseEnrollment: { findOne, findAll, create: createEnrollment },
  User: { findByPk, findOne: userFindOne, create: userCreate },
}));

jest.unstable_mockModule('../utils/passwords.js', () => ({
  hashPassword,
  isStrongPassword: () => true,
  PASSWORD_POLICY_MESSAGE: 'password policy',
  verifyPassword: jest.fn(),
}));

jest.unstable_mockModule('../utils/grades.js', () => ({
  recomputeAssignmentGrade,
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
    assignmentFindByPk.mockReset();
    assignmentFindAll.mockReset();
    accommodationFindOne.mockReset();
    accommodationCreate.mockReset();
    extensionFindOne.mockReset();
    extensionCreate.mockReset();
    assignmentQuestionFindByPk.mockReset();
    overrideFindOne.mockReset();
    overrideCreate.mockReset();
    recomputeAssignmentGrade.mockReset().mockResolvedValue(undefined);
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

  describe('POST /courses/:id/accommodations', () => {
    it('rejects granting an accommodation to a user not enrolled in the course', async () => {
      findOne
        .mockResolvedValueOnce({ role: 'instructor' }) // requireInstructor
        .mockResolvedValueOnce(null); // target enrollment check

      const handlers = getRouteHandlers('/courses/:id/accommodations', 'post');
      const req = {
        params: { id: '3' },
        body: { user_id: 55, late_penalty_waived: true },
        user: { id: 2 },
      };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(403);
      expect(accommodationCreate).not.toHaveBeenCalled();
    });

    it('grants an accommodation to an enrolled user', async () => {
      findOne
        .mockResolvedValueOnce({ role: 'instructor' })
        .mockResolvedValueOnce({ id: 1 });
      accommodationFindOne.mockResolvedValueOnce(null);
      accommodationCreate.mockResolvedValueOnce({ id: 10, user_id: 55, course_id: 3 });
      assignmentFindAll.mockResolvedValueOnce([]);

      const handlers = getRouteHandlers('/courses/:id/accommodations', 'post');
      const req = {
        params: { id: '3' },
        body: { user_id: 55, late_penalty_waived: true },
        user: { id: 2 },
      };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(201);
      expect(accommodationCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /assignments/:id/extensions', () => {
    it('rejects granting an extension to a user not enrolled in the course', async () => {
      assignmentFindByPk.mockResolvedValueOnce({ id: 9, course_id: 3 });
      findOne
        .mockResolvedValueOnce({ role: 'instructor' })
        .mockResolvedValueOnce(null);

      const handlers = getRouteHandlers('/assignments/:id/extensions', 'post');
      const req = {
        params: { id: '9' },
        body: { user_id: 55, extended_due_date: '2026-05-01T00:00:00Z' },
        user: { id: 2 },
      };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(403);
      expect(extensionCreate).not.toHaveBeenCalled();
    });

    it('grants an extension to an enrolled user', async () => {
      assignmentFindByPk.mockResolvedValueOnce({ id: 9, course_id: 3 });
      findOne
        .mockResolvedValueOnce({ role: 'instructor' })
        .mockResolvedValueOnce({ id: 1 });
      extensionFindOne.mockResolvedValueOnce(null);
      extensionCreate.mockResolvedValueOnce({ id: 11, assignment_id: 9, user_id: 55 });

      const handlers = getRouteHandlers('/assignments/:id/extensions', 'post');
      const req = {
        params: { id: '9' },
        body: { user_id: 55, extended_due_date: '2026-05-01T00:00:00Z' },
        user: { id: 2 },
      };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(201);
      expect(extensionCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /assignment-questions/:id/overrides', () => {
    it('rejects granting an attempt override to a user not enrolled in the course', async () => {
      assignmentQuestionFindByPk.mockResolvedValueOnce({ id: 20, Assignment: { course_id: 3 } });
      findOne
        .mockResolvedValueOnce({ role: 'instructor' })
        .mockResolvedValueOnce(null);

      const handlers = getRouteHandlers('/assignment-questions/:id/overrides', 'post');
      const req = {
        params: { id: '20' },
        body: { user_id: 55, extra_attempts: 2 },
        user: { id: 2 },
      };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(403);
      expect(overrideCreate).not.toHaveBeenCalled();
    });

    it('grants an attempt override to an enrolled user', async () => {
      assignmentQuestionFindByPk.mockResolvedValueOnce({ id: 20, Assignment: { course_id: 3 } });
      findOne
        .mockResolvedValueOnce({ role: 'instructor' })
        .mockResolvedValueOnce({ id: 1 });
      overrideFindOne.mockResolvedValueOnce(null);
      overrideCreate.mockResolvedValueOnce({ id: 12, assignment_question_id: 20, user_id: 55 });

      const handlers = getRouteHandlers('/assignment-questions/:id/overrides', 'post');
      const req = {
        params: { id: '20' },
        body: { user_id: 55, extra_attempts: 2 },
        user: { id: 2 },
      };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(201);
      expect(overrideCreate).toHaveBeenCalledTimes(1);
    });
  });
});
