import { jest } from '@jest/globals';
import errorHandler from '../middleware/error-handler.js';

const create = jest.fn();
const assignmentQuestionFindByPk = jest.fn();
const courseEnrollmentFindOne = jest.fn();

jest.unstable_mockModule('../models/index.js', () => ({
  QuestionSession: { create },
  AssignmentQuestion: { findByPk: assignmentQuestionFindByPk },
  Assignment: {},
  CourseEnrollment: { findOne: courseEnrollmentFindOne },
}));

jest.unstable_mockModule('../utils/authorization.js', () => ({
  isSystemAdmin: (user) => Boolean(user?.is_system_admin),
}));

const questionSessionsRouter = (await import('../routes/question-sessions.js')).default;

const getRouteHandlers = (path, method) => {
  const layer = questionSessionsRouter.stack.find(
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
  end() {
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

describe('question sessions routes', () => {
  beforeEach(() => {
    create.mockReset();
    assignmentQuestionFindByPk.mockReset();
    courseEnrollmentFindOne.mockReset().mockResolvedValue({ id: 1 });
  });

  describe('POST /', () => {
    it('returns 400 when assignment_question_id is missing', async () => {
      const handlers = getRouteHandlers('/', 'post');
      const req = { body: {}, user: { id: 42 } };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe('assignment_question_id is required');
      expect(create).not.toHaveBeenCalled();
    });

    it('returns 404 when assignment question does not exist', async () => {
      assignmentQuestionFindByPk.mockResolvedValueOnce(null);

      const handlers = getRouteHandlers('/', 'post');
      const req = { body: { assignment_question_id: 999 }, user: { id: 42 } };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toBe('assignment_question_id not found');
      expect(create).not.toHaveBeenCalled();
    });

    it('creates a session with current user id for non-admins', async () => {
      assignmentQuestionFindByPk.mockResolvedValueOnce({ id: 10, Assignment: { course_id: 3 } });
      create.mockResolvedValueOnce({ id: 1, assignment_question_id: 10, user_id: 42 });

      const handlers = getRouteHandlers('/', 'post');
      const req = {
        body: { assignment_question_id: 10, user_id: 999, started_at: '2026-04-09T00:00:00Z' },
        user: { id: 42, is_system_admin: false },
      };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(201);
      expect(create).toHaveBeenCalledWith({
        assignment_question_id: 10,
        user_id: 42,
        started_at: '2026-04-09T00:00:00Z',
      });
    });

    it('preserves payload user_id for system admins', async () => {
      assignmentQuestionFindByPk.mockResolvedValueOnce({ id: 10, Assignment: { course_id: 3 } });
      create.mockResolvedValueOnce({ id: 1, assignment_question_id: 10, user_id: 7 });

      const handlers = getRouteHandlers('/', 'post');
      const req = {
        body: { assignment_question_id: 10, user_id: 7, started_at: '2026-04-09T00:00:00Z' },
        user: { id: 1, is_system_admin: true },
      };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(201);
      expect(create).toHaveBeenCalledWith({
        assignment_question_id: 10,
        user_id: 7,
        started_at: '2026-04-09T00:00:00Z',
      });
    });

    it('rejects a session for a course the caller is not enrolled in', async () => {
      assignmentQuestionFindByPk.mockResolvedValueOnce({ id: 10, Assignment: { course_id: 3 } });
      courseEnrollmentFindOne.mockResolvedValueOnce(null);

      const handlers = getRouteHandlers('/', 'post');
      const req = {
        body: { assignment_question_id: 10, started_at: '2026-04-09T00:00:00Z' },
        user: { id: 42, is_system_admin: false },
      };
      const res = await runHandlers(handlers, req, createRes());

      expect(res.statusCode).toBe(403);
      expect(create).not.toHaveBeenCalled();
    });
  });
});
