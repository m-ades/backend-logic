import { jest } from '@jest/globals';
import errorHandler from '../middleware/error-handler.js';

const courseFindByPk = jest.fn();
const courseCreate = jest.fn();
const courseEnrollmentFindOne = jest.fn();
const assignmentFindByPk = jest.fn();
const assignmentCreate = jest.fn();
const assignmentQuestionFindAll = jest.fn();
const assignmentDraftFindOne = jest.fn();
const submissionFindAll = jest.fn();
const requireInstructorOrAdmin = jest.fn();
const autoSubmitIfPastDeadline = jest.fn();
const sequelizeFn = jest.fn((name, value) => ({ name, value }));
const sequelizeCol = jest.fn((value) => value);
const sequelizeQuery = jest.fn();
const assignmentExtensionFindAll = jest.fn();
const accommodationFindOne = jest.fn();

jest.unstable_mockModule('../models/index.js', () => ({
  Course: { findByPk: courseFindByPk, create: courseCreate },
  Assignment: { findByPk: assignmentFindByPk, create: assignmentCreate },
  AssignmentDraft: { findOne: assignmentDraftFindOne },
  AssignmentExtension: { findOne: jest.fn(), findAll: assignmentExtensionFindAll },
  AssignmentGrade: {},
  AssignmentQuestion: { findAll: assignmentQuestionFindAll },
  AssignmentQuestionOverride: { findAll: jest.fn() },
  Accommodation: { findOne: accommodationFindOne },
  CourseEnrollment: { findOne: courseEnrollmentFindOne },
  Submission: { findAll: submissionFindAll },
  User: {},
  sequelize: { fn: sequelizeFn, col: sequelizeCol, query: sequelizeQuery },
}));

jest.unstable_mockModule('../routes/instructor.js', () => ({
  requireInstructorOrAdmin,
}));

jest.unstable_mockModule('../utils/autoSubmit.js', () => ({
  autoSubmitIfPastDeadline,
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

describe('course and assignment auth', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    courseFindByPk.mockReset();
    courseCreate.mockReset();
    courseEnrollmentFindOne.mockReset();
    assignmentFindByPk.mockReset();
    assignmentCreate.mockReset();
    assignmentQuestionFindAll.mockReset();
    assignmentDraftFindOne.mockReset();
    submissionFindAll.mockReset();
    requireInstructorOrAdmin.mockReset();
    autoSubmitIfPastDeadline.mockReset();
    sequelizeFn.mockClear();
    sequelizeCol.mockClear();
    sequelizeQuery.mockReset();
    assignmentExtensionFindAll.mockReset();
    accommodationFindOne.mockReset();
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

    it('rejects permanent course deletion for instructors', async () => {
      const destroy = jest.fn();
      courseFindByPk.mockResolvedValueOnce({ id: 5, destroy });

      const handlers = getRouteHandlers(coursesRouter, '/:id', 'delete');
      const req = {
        params: { id: '5' },
        user: { id: 7, is_system_admin: false },
      };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(403);
      expect(destroy).not.toHaveBeenCalled();
      expect(requireInstructorOrAdmin).not.toHaveBeenCalled();
    });

    it('allows system administrators to permanently delete courses', async () => {
      const destroy = jest.fn().mockResolvedValueOnce();
      courseFindByPk.mockResolvedValueOnce({ id: 5, destroy });

      const handlers = getRouteHandlers(coursesRouter, '/:id', 'delete');
      const req = {
        params: { id: '5' },
        user: { id: 1, is_system_admin: true },
      };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(204);
      expect(destroy).toHaveBeenCalledTimes(1);
      expect(res.ended).toBe(true);
    });

    const mockCourseAssignmentRows = () => sequelizeQuery.mockResolvedValueOnce([
      {
        id: 1, course_id: 3, title: 'Unlocked HW', kind: 'assignment', is_locked: false,
        due_date: null, chapter: 1, subchapter: 'A', late_window_days: null, late_penalty_percent: null,
        question_count: 2, answered_count: 0,
      },
      {
        id: 2, course_id: 3, title: 'Draft HW', kind: 'assignment', is_locked: true,
        due_date: null, chapter: 1, subchapter: 'A', late_window_days: null, late_penalty_percent: null,
        question_count: 0, answered_count: 0,
      },
    ]);

    it('excludes locked assignments from the course list for students', async () => {
      courseEnrollmentFindOne.mockResolvedValueOnce({ id: 14, role: 'student' });
      mockCourseAssignmentRows();
      accommodationFindOne.mockResolvedValueOnce(null);
      assignmentExtensionFindAll.mockResolvedValueOnce([]);

      const handlers = getRouteHandlers(coursesRouter, '/:id/assignments', 'get');
      const req = { params: { id: '3' }, user: { id: 7, is_system_admin: false } };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(200);
      expect(res.body.map((a) => a.id)).toEqual([1]);
    });

    it('includes locked assignments in the course list for TAs', async () => {
      courseEnrollmentFindOne.mockResolvedValueOnce({ id: 14, role: 'ta' });
      mockCourseAssignmentRows();
      accommodationFindOne.mockResolvedValueOnce(null);
      assignmentExtensionFindAll.mockResolvedValueOnce([]);

      const handlers = getRouteHandlers(coursesRouter, '/:id/assignments', 'get');
      const req = { params: { id: '3' }, user: { id: 8, is_system_admin: false } };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(200);
      expect(res.body.map((a) => a.id).sort()).toEqual([1, 2]);
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

    it('keeps course ownership unchanged during instructor updates', async () => {
      const update = jest.fn().mockResolvedValueOnce();
      assignmentFindByPk.mockResolvedValueOnce({ id: 9, course_id: 3, update });
      requireInstructorOrAdmin.mockResolvedValueOnce(true);

      const handlers = getRouteHandlers(assignmentsRouter, '/:id', 'put');
      const req = {
        params: { id: '9' },
        body: { course_id: 99, title: 'New title' },
        user: { id: 7, is_system_admin: false },
      };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(200);
      expect(requireInstructorOrAdmin).toHaveBeenCalledWith(3, 7);
      expect(update).toHaveBeenCalledWith({ title: 'New title' });
    });

    it('rejects assignment list reads for non-admins', async () => {
      const handlers = getRouteHandlers(assignmentsRouter, '/', 'get');
      const req = { user: { id: 7, is_system_admin: false } };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(403);
    });

    it('rejects assignment reads for users outside the course', async () => {
      assignmentFindByPk.mockResolvedValueOnce({ id: 9, course_id: 3, kind: 'assignment' });
      requireInstructorOrAdmin.mockResolvedValueOnce(false);
      courseEnrollmentFindOne.mockResolvedValueOnce(null);

      const handlers = getRouteHandlers(assignmentsRouter, '/:id', 'get');
      const req = { params: { id: '9' }, query: {}, user: { id: 7, is_system_admin: false } };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(403);
      expect(res.body).toEqual({ message: 'Enrollment required' });
    });

    it('keeps assignment reads side effect free after the due date', async () => {
      assignmentFindByPk.mockResolvedValueOnce({
        id: 9,
        course_id: 3,
        kind: 'assignment',
        due_date: '2026-01-01T00:00:00.000Z',
        late_window_days: 3,
        late_penalty_percent: 20,
      });
      requireInstructorOrAdmin.mockResolvedValueOnce(false);
      courseEnrollmentFindOne.mockResolvedValueOnce({ id: 14, role: 'student' });
      assignmentQuestionFindAll.mockResolvedValueOnce([]);

      const handlers = getRouteHandlers(assignmentsRouter, '/:id', 'get');
      const req = {
        params: { id: '9' },
        query: { userId: '7' },
        user: { id: 7, is_system_admin: false },
      };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(200);
      expect(autoSubmitIfPastDeadline).not.toHaveBeenCalled();
    });

    it('hides a locked assignment from an enrolled student', async () => {
      assignmentFindByPk.mockResolvedValueOnce({ id: 9, course_id: 3, kind: 'assignment', is_locked: true });
      requireInstructorOrAdmin.mockResolvedValueOnce(false);
      courseEnrollmentFindOne.mockResolvedValueOnce({ id: 14, role: 'student' });

      const handlers = getRouteHandlers(assignmentsRouter, '/:id', 'get');
      const req = { params: { id: '9' }, query: {}, user: { id: 7, is_system_admin: false } };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(403);
      expect(assignmentQuestionFindAll).not.toHaveBeenCalled();
    });

    it('hides a locked assignment\'s questions from an enrolled student', async () => {
      assignmentFindByPk.mockResolvedValueOnce({ id: 9, course_id: 3, kind: 'assignment', is_locked: true });
      requireInstructorOrAdmin.mockResolvedValueOnce(false);
      courseEnrollmentFindOne.mockResolvedValueOnce({ id: 14, role: 'student' });

      const handlers = getRouteHandlers(assignmentsRouter, '/:id/questions', 'get');
      const req = { params: { id: '9' }, query: {}, user: { id: 7, is_system_admin: false } };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(403);
      expect(assignmentQuestionFindAll).not.toHaveBeenCalled();
    });

    it('still lets a TA read a locked assignment', async () => {
      assignmentFindByPk.mockResolvedValueOnce({ id: 9, course_id: 3, kind: 'assignment', is_locked: true });
      requireInstructorOrAdmin.mockResolvedValueOnce(false);
      courseEnrollmentFindOne.mockResolvedValueOnce({ id: 14, role: 'ta' });
      assignmentQuestionFindAll.mockResolvedValueOnce([]);

      const handlers = getRouteHandlers(assignmentsRouter, '/:id', 'get');
      const req = { params: { id: '9' }, query: {}, user: { id: 7, is_system_admin: false } };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(200);
    });

    it('strips answers from question payloads for enrolled students', async () => {
      assignmentFindByPk.mockResolvedValueOnce({ id: 9, course_id: 3, kind: 'assignment' });
      requireInstructorOrAdmin.mockResolvedValueOnce(false);
      courseEnrollmentFindOne.mockResolvedValueOnce({ id: 14, role: 'student' });
      assignmentQuestionFindAll.mockResolvedValueOnce([
        {
          toJSON: () => ({
            id: 21,
            assignment_id: 9,
            attempt_limit: 3,
            question_snapshot: {
              prompt: 'Translate this.',
              answer: 'P',
              answerIndex: 1,
            },
          }),
        },
      ]);

      const handlers = getRouteHandlers(assignmentsRouter, '/:id/questions', 'get');
      const req = { params: { id: '9' }, query: {}, user: { id: 7, is_system_admin: false } };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([
        {
          id: 21,
          assignment_id: 9,
          attempt_limit: 3,
          question_snapshot: {
            prompt: 'Translate this.',
          },
        },
      ]);
    });
  });
});
