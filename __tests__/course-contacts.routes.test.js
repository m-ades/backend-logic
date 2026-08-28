import { jest } from '@jest/globals';
import errorHandler from '../middleware/error-handler.js';

const contactFindAll = jest.fn();
const contactFindOne = jest.fn();
const contactCreate = jest.fn();
const enrollmentFindOne = jest.fn();
const userFindByPk = jest.fn();

jest.unstable_mockModule('../models/index.js', () => ({
  Assignment: {},
  AssignmentExtension: {},
  AssignmentQuestion: {},
  AssignmentQuestionOverride: {},
  Accommodation: {},
  AssignmentGrade: {},
  CourseContact: {
    findAll: contactFindAll,
    findOne: contactFindOne,
    create: contactCreate,
  },
  CourseEnrollment: { findOne: enrollmentFindOne },
  Submission: {},
  User: { findByPk: userFindByPk },
}));

const router = (await import('../routes/course-contacts.js')).default;

const getRouteHandlers = (path, method) => {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods[method]
  );
  if (!layer) throw new Error(`route not found: ${method.toUpperCase()} ${path}`);
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
      if (err) error = err;
      else index += 1;
    });
    if (!nextCalled) break;
  }
  if (error) await errorHandler(error, req, res, () => {});
  return res;
};

describe('course contacts routes', () => {
  beforeEach(() => {
    contactFindAll.mockReset();
    contactFindOne.mockReset();
    contactCreate.mockReset();
    enrollmentFindOne.mockReset();
    userFindByPk.mockReset();
  });

  it('returns contacts only to enrolled users', async () => {
    enrollmentFindOne.mockResolvedValueOnce({ id: 4, role: 'student' });
    contactFindAll.mockResolvedValueOnce([{ id: 8, course_id: 3 }]);

    const res = await runHandlers(
      getRouteHandlers('/:id/contacts', 'get'),
      { params: { id: '3' }, user: { id: 9, is_system_admin: false } },
      createRes()
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([{ id: 8, course_id: 3 }]);
    expect(contactFindAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { course_id: 3 },
      order: [['id', 'ASC']],
    }));
  });

  it('does not expose contacts to users outside the course', async () => {
    enrollmentFindOne.mockResolvedValueOnce(null);

    const res = await runHandlers(
      getRouteHandlers('/:id/contacts', 'get'),
      { params: { id: '3' }, user: { id: 9, is_system_admin: false } },
      createRes()
    );

    expect(res.statusCode).toBe(403);
    expect(contactFindAll).not.toHaveBeenCalled();
  });

  it('creates a contact for an instructor in the requested course', async () => {
    userFindByPk.mockResolvedValueOnce({ is_system_admin: false });
    enrollmentFindOne.mockResolvedValueOnce({ role: 'instructor' });
    contactCreate.mockResolvedValueOnce({ id: 12, name: 'Staff member', course_id: 3 });
    const req = {
      params: { id: '3' },
      user: { id: 9 },
      body: { name: 'Staff member', role: 'Tutor', email: 'staff@example.test' },
    };

    const res = await runHandlers(getRouteHandlers('/:id/contacts', 'post'), req, createRes());

    expect(res.statusCode).toBe(201);
    expect(contactCreate).toHaveBeenCalledWith(expect.objectContaining({
      course_id: 3,
      name: 'Staff member',
      role: 'Tutor',
      email: 'staff@example.test',
    }));
  });

  it('does not update a contact from another course', async () => {
    userFindByPk.mockResolvedValueOnce({ is_system_admin: false });
    enrollmentFindOne.mockResolvedValueOnce({ role: 'instructor' });
    contactFindOne.mockResolvedValueOnce(null);
    const req = {
      params: { id: '3', contactId: '12' },
      user: { id: 9 },
      body: { role: 'Tutor' },
    };

    const res = await runHandlers(getRouteHandlers('/:id/contacts/:contactId', 'put'), req, createRes());

    expect(res.statusCode).toBe(404);
    expect(contactFindOne).toHaveBeenCalledWith({ where: { id: 12, course_id: 3 } });
  });
});
