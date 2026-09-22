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
const extensionFindAll = jest.fn();
const extensionCreate = jest.fn();
const extensionBulkCreate = jest.fn();
const assignmentQuestionFindByPk = jest.fn();
const overrideFindOne = jest.fn();
const overrideCreate = jest.fn();
const recomputeAssignmentGrade = jest.fn();
const submissionFindAll = jest.fn();

jest.unstable_mockModule('../models/index.js', () => ({
  Assignment: { findByPk: assignmentFindByPk, findAll: assignmentFindAll },
  AssignmentExtension: {
    findOne: extensionFindOne,
    findAll: extensionFindAll,
    create: extensionCreate,
    bulkCreate: extensionBulkCreate,
  },
  Accommodation: { findOne: accommodationFindOne, create: accommodationCreate },
  AssignmentGrade: {},
  AssignmentQuestion: { findByPk: assignmentQuestionFindByPk },
  AssignmentQuestionOverride: { findOne: overrideFindOne, create: overrideCreate },
  Submission: { findAll: submissionFindAll },
  CourseEnrollment: { findOne, findAll, create: createEnrollment },
  User: { findByPk, findOne: userFindOne, create: userCreate },
}));

jest.unstable_mockModule('../utils/passwords.js', () => ({
  hashPassword,
  verifyPassword: jest.fn(),
  PASSWORD_POLICY_MESSAGE:
    'Password must be at least 12 characters and include at least one uppercase letter, one lowercase letter, one number, and one symbol.',
  isStrongPassword: jest.fn(() => true),
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
    extensionFindAll.mockReset();
    extensionCreate.mockReset();
    extensionBulkCreate.mockReset().mockResolvedValue([]);
    assignmentQuestionFindByPk.mockReset();
    overrideFindOne.mockReset();
    overrideCreate.mockReset();
    recomputeAssignmentGrade.mockReset().mockResolvedValue(undefined);
    submissionFindAll.mockReset();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy?.mockRestore();
  });

  describe('GET /courses/:id/deadlines', () => {
    const handlers = getRouteHandlers('/courses/:id/deadlines', 'get');
    const request = () => ({ params: { id: '8' }, user: { id: 2 } });

    it('returns deadlines using the current user extensions and accommodation', async () => {
      findOne.mockResolvedValueOnce({ role: 'instructor' });
      assignmentFindAll.mockResolvedValueOnce([{
        id: 4,
        title: 'Derivations',
        due_date: '2026-09-15T16:00:00Z',
        late_window_days: 2,
        late_penalty_percent: 10,
      }]);
      extensionFindAll.mockResolvedValueOnce([{
        assignment_id: 4,
        extended_due_date: '2026-09-16T16:00:00Z',
      }]);
      accommodationFindOne.mockResolvedValueOnce({ extra_late_days: 1 });

      const res = await runHandlers(handlers, request(), createRes());

      expect(res.statusCode).toBe(200);
      expect(extensionFindAll).toHaveBeenCalledWith({
        where: { assignment_id: [4], user_id: 2 },
      });
      expect(accommodationFindOne).toHaveBeenCalledWith({
        where: { course_id: 8, user_id: 2 },
      });
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toEqual(expect.objectContaining({
        assignment_id: 4,
        title: 'Derivations',
        has_extension: true,
        extra_late_days: 1,
      }));
      expect(new Date(res.body[0].due_at).toISOString()).toBe('2026-09-17T16:00:00.000Z');
      expect(new Date(res.body[0].cutoff_at).toISOString()).toBe('2026-09-19T16:00:00.000Z');
    });

    it('returns an empty list when the course has no assignments', async () => {
      findOne.mockResolvedValueOnce({ role: 'instructor' });
      assignmentFindAll.mockResolvedValueOnce([]);
      extensionFindAll.mockResolvedValueOnce([]);
      accommodationFindOne.mockResolvedValueOnce(null);

      const res = await runHandlers(handlers, request(), createRes());

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /assignments/:id/submissions', () => {
    const request = (query = {}) => ({ params: { id: '4' }, query, user: { id: 2 } });
    const handlers = getRouteHandlers('/assignments/:id/submissions', 'get');

    it('scopes selected student attempts to the assignment', async () => {
      assignmentFindByPk.mockResolvedValueOnce({ id: 4, course_id: 8 });
      findOne.mockResolvedValueOnce({ role: 'instructor' });
      const submissions = [{ id: 12, user_id: 9, assignment_question_id: 3 }];
      submissionFindAll.mockResolvedValueOnce(submissions);

      const res = await runHandlers(handlers, request({ userId: '9' }), createRes());

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(submissions);
      expect(findOne).toHaveBeenCalledWith({ where: { course_id: 8, user_id: 2 } });
      expect(submissionFindAll).toHaveBeenCalledWith(expect.objectContaining({
        where: { user_id: 9 },
        include: expect.arrayContaining([expect.objectContaining({ where: { assignment_id: 4 } })]),
        order: [['submitted_at', 'DESC']],
      }));
    });

    it('preserves the whole assignment view when no student is selected', async () => {
      assignmentFindByPk.mockResolvedValueOnce({ id: 4, course_id: 8 });
      findOne.mockResolvedValueOnce({ role: 'instructor' });
      submissionFindAll.mockResolvedValueOnce([]);

      const res = await runHandlers(handlers, request(), createRes());

      expect(res.statusCode).toBe(200);
      expect(submissionFindAll.mock.calls[0][0]).not.toHaveProperty('where');
    });

    it.each(['0', '-1', 'invalid', '1.5'])('rejects invalid student id %s', async (userId) => {
      const res = await runHandlers(handlers, request({ userId }), createRes());

      expect(res.statusCode).toBe(400);
      expect(submissionFindAll).not.toHaveBeenCalled();
    });

    it.each(['student', 'ta', null])('rejects access without course instructor enrollment %s', async (role) => {
      assignmentFindByPk.mockResolvedValueOnce({ id: 4, course_id: 8 });
      findOne.mockResolvedValueOnce(role ? { role } : null);

      const res = await runHandlers(handlers, request({ userId: '9' }), createRes());

      expect(res.statusCode).toBe(403);
      expect(submissionFindAll).not.toHaveBeenCalled();
    });

    it('returns not found for a missing assignment', async () => {
      assignmentFindByPk.mockResolvedValueOnce(null);
      const res = await runHandlers(handlers, request({ userId: '9' }), createRes());
      expect(res.statusCode).toBe(404);
      expect(submissionFindAll).not.toHaveBeenCalled();
    });
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
  describe('POST /assignments/:id/extensions/classwide', () => {
    const request = (body, method = 'post') => ({
      params: { id: '9' },
      body,
      user: { id: 2 },
      method,
    });

    it('applies the classwide date and keeps later individual extensions', async () => {
      assignmentFindByPk.mockResolvedValueOnce({ id: 9, course_id: 3 });
      findOne.mockResolvedValueOnce({ role: 'instructor' });
      findAll.mockResolvedValueOnce([{ user_id: 55 }, { user_id: 56 }, { user_id: 57 }]);
      extensionFindAll.mockResolvedValueOnce([
        // later than the classwide date, so it must be preserved
        { user_id: 55, extended_due_date: new Date('2026-06-01T00:00:00Z') },
        // earlier than the classwide date, so it is overwritten
        { user_id: 56, extended_due_date: new Date('2026-04-01T00:00:00Z') },
      ]);

      const handlers = getRouteHandlers('/assignments/:id/extensions/classwide', 'post');
      const res = await runHandlers(
        handlers,
        request({ extended_due_date: '2026-05-01T00:00:00Z', reason: '  snow day  ' }),
        createRes()
      );

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ updated: 2, preserved: 1, total: 3 });
      expect(extensionBulkCreate).toHaveBeenCalledTimes(1);
      const [rows, options] = extensionBulkCreate.mock.calls[0];
      expect(rows.map((row) => row.user_id)).toEqual([56, 57]);
      expect(rows.every((row) => row.reason === 'snow day' && row.granted_by === 2)).toBe(true);
      expect(options).toEqual({ updateOnDuplicate: ['extended_due_date', 'reason', 'granted_by'] });
      // only students whose deadline moved get a grade recompute
      expect(recomputeAssignmentGrade.mock.calls.map(([args]) => args.userId)).toEqual([56, 57]);
    });

    it('returns zero counts and skips writes when the course has no students', async () => {
      assignmentFindByPk.mockResolvedValueOnce({ id: 9, course_id: 3 });
      findOne.mockResolvedValueOnce({ role: 'instructor' });
      findAll.mockResolvedValueOnce([]);

      const handlers = getRouteHandlers('/assignments/:id/extensions/classwide', 'post');
      const res = await runHandlers(
        handlers,
        request({ extended_due_date: '2026-05-01T00:00:00Z' }),
        createRes()
      );

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ updated: 0, preserved: 0, total: 0 });
      expect(extensionBulkCreate).not.toHaveBeenCalled();
      expect(recomputeAssignmentGrade).not.toHaveBeenCalled();
    });

    it.each(['', 'not-a-date', '2026-13-45'])('rejects invalid extended_due_date %p', async (value) => {
      const handlers = getRouteHandlers('/assignments/:id/extensions/classwide', 'post');
      const res = await runHandlers(handlers, request({ extended_due_date: value }), createRes());

      expect(res.statusCode).toBe(400);
      expect(assignmentFindByPk).not.toHaveBeenCalled();
      expect(extensionBulkCreate).not.toHaveBeenCalled();
    });

    it('rejects a reason longer than 500 characters', async () => {
      const handlers = getRouteHandlers('/assignments/:id/extensions/classwide', 'post');
      const res = await runHandlers(
        handlers,
        request({ extended_due_date: '2026-05-01T00:00:00Z', reason: 'x'.repeat(501) }),
        createRes()
      );

      expect(res.statusCode).toBe(400);
      expect(extensionBulkCreate).not.toHaveBeenCalled();
    });

    it('requires course instructor access', async () => {
      assignmentFindByPk.mockResolvedValueOnce({ id: 9, course_id: 3 });
      findOne.mockResolvedValueOnce({ role: 'ta' });

      const handlers = getRouteHandlers('/assignments/:id/extensions/classwide', 'post');
      const res = await runHandlers(
        handlers,
        request({ extended_due_date: '2026-05-01T00:00:00Z' }),
        createRes()
      );

      expect(res.statusCode).toBe(403);
      expect(extensionBulkCreate).not.toHaveBeenCalled();
    });

    it('is exposed as PUT with the same handler', () => {
      const postHandlers = getRouteHandlers('/assignments/:id/extensions/classwide', 'post');
      const putHandlers = getRouteHandlers('/assignments/:id/extensions/classwide', 'put');
      expect(putHandlers).toEqual(postHandlers);
    });
  });

  describe('GET /assignments/:id/extensions', () => {
    it('serializes the student and granting instructor and sorts by username', async () => {
      assignmentFindByPk.mockResolvedValueOnce({ id: 9, course_id: 3 });
      findByPk.mockResolvedValueOnce({ is_system_admin: false });
      findOne.mockResolvedValueOnce({ role: 'instructor' });
      extensionFindAll.mockResolvedValueOnce([
        {
          id: 1, assignment_id: 9, user_id: 56, extended_due_date: '2026-05-01T00:00:00Z',
          reason: null, created_at: '2026-04-01T00:00:00Z',
          User: { id: 56, username: 'zoe', password_hash: 'x' }, grantedBy: { id: 2, username: 'prof' },
        },
        {
          id: 2, assignment_id: 9, user_id: 55, extended_due_date: '2026-05-02T00:00:00Z',
          reason: 'illness', created_at: '2026-04-02T00:00:00Z',
          User: { id: 55, username: 'Adam' }, grantedBy: null,
        },
      ]);

      const handlers = getRouteHandlers('/assignments/:id/extensions', 'get');
      const res = await runHandlers(handlers, { params: { id: '9' }, user: { id: 2 } }, createRes());

      expect(res.statusCode).toBe(200);
      expect(res.body.map((row) => row.User.username)).toEqual(['Adam', 'zoe']);
      expect(res.body[1]).toEqual({
        id: 1, assignment_id: 9, user_id: 56, extended_due_date: '2026-05-01T00:00:00Z',
        reason: null, created_at: '2026-04-01T00:00:00Z',
        User: { id: 56, username: 'zoe' }, grantedBy: { id: 2, username: 'prof' },
      });
      expect(res.body[0].grantedBy).toBeNull();
    });
  });
});
