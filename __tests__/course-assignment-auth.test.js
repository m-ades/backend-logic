import { jest } from '@jest/globals';
import errorHandler from '../middleware/error-handler.js';

const courseFindByPk = jest.fn();
const courseCreate = jest.fn();
const courseEnrollmentFindOne = jest.fn();
const assignmentFindByPk = jest.fn();
const assignmentCreate = jest.fn();
const assignmentDraftFindOne = jest.fn();
const requireInstructorOrAdmin = jest.fn();

jest.unstable_mockModule('../models/index.js', () => ({
  Course: { findByPk: courseFindByPk, create: courseCreate },
  Assignment: { findByPk: assignmentFindByPk, create: assignmentCreate },
  AssignmentDraft: { findOne: assignmentDraftFindOne },
  AssignmentExtension: {},
  AssignmentGrade: {},
  AssignmentQuestion: {},
  AssignmentQuestionOverride: {},
  Accommodation: {},
  CourseEnrollment: { findOne: courseEnrollmentFindOne },
  Submission: {},
  User: {},
}));

jest.unstable_mockModule('../routes/instructor.js', () => ({
  requireInstructorOrAdmin,
}));

const coursesRouter = (await import('../routes/courses.js')).default;
const assignmentsRouter = (await import('../routes/assignments.js')).default;

const getRouteHandlers = (router, path, method) => {
  const layer = router.stack.find(
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

describe('course and assignment auth', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    courseFindByPk.mockReset();
    courseCreate.mockReset();
    courseEnrollmentFindOne.mockReset();
    assignmentFindByPk.mockReset();
    assignmentCreate.mockReset();
    assignmentDraftFindOne.mockReset();
    requireInstructorOrAdmin.mockReset();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy?.mockRestore();
  });

  describe('courses', () => {
    it('rejects course creation for non-instructors', async () => {
      courseEnrollmentFindOne.mockResolvedValueOnce(null);

      const handlers = getRouteHandlers(coursesRouter, '/', 'post');
      const req = { body: { title: 'Logic 101' }, user: { id: 7, is_system_admin: false } };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(403);
      expect(courseCreate).not.toHaveBeenCalled();
    });

    it('allows course creation for instructors', async () => {
      courseEnrollmentFindOne.mockResolvedValueOnce({ id: 1, role: 'instructor' });
      courseCreate.mockResolvedValueOnce({ id: 12, title: 'Logic 101' });

      const handlers = getRouteHandlers(coursesRouter, '/', 'post');
      const req = { body: { title: 'Logic 101' }, user: { id: 7, is_system_admin: false } };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(201);
      expect(res.body.id).toBe(12);
    });

    it('rejects course updates for non-instructors', async () => {
      const update = jest.fn();
      courseFindByPk.mockResolvedValueOnce({ id: 5, update });
      requireInstructorOrAdmin.mockResolvedValueOnce(false);

      const handlers = getRouteHandlers(coursesRouter, '/:id', 'put');
      const req = { params: { id: '5' }, body: { title: 'New' }, user: { id: 7 } };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(403);
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('assignments', () => {
    it('rejects assignment creation for non-instructors', async () => {
      requireInstructorOrAdmin.mockResolvedValueOnce(false);

      const handlers = getRouteHandlers(assignmentsRouter, '/', 'post');
      const req = { body: { course_id: 3, title: 'HW 1' }, user: { id: 7 } };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(403);
      expect(assignmentCreate).not.toHaveBeenCalled();
    });

    it('allows assignment creation for instructors', async () => {
      requireInstructorOrAdmin.mockResolvedValueOnce(true);
      assignmentCreate.mockResolvedValueOnce({ id: 9, course_id: 3 });

      const handlers = getRouteHandlers(assignmentsRouter, '/', 'post');
      const req = { body: { course_id: 3, title: 'HW 1' }, user: { id: 7 } };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(201);
      expect(res.body.id).toBe(9);
    });

    it('rejects assignment updates for non-instructors', async () => {
      const update = jest.fn();
      assignmentFindByPk.mockResolvedValueOnce({ id: 9, course_id: 3, update });
      requireInstructorOrAdmin.mockResolvedValueOnce(false);

      const handlers = getRouteHandlers(assignmentsRouter, '/:id', 'put');
      const req = { params: { id: '9' }, body: { title: 'New' }, user: { id: 7 } };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(403);
      expect(update).not.toHaveBeenCalled();
    });
  });
});
