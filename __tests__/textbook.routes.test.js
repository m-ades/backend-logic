import { jest } from '@jest/globals';
import errorHandler from '../middleware/error-handler.js';

const courseEnrollmentFindOne = jest.fn();
const courseFindByPk = jest.fn();
const structureFindByPk = jest.fn();
const structureCreate = jest.fn();
const structureUpdate = jest.fn();
const structureDestroy = jest.fn();
const linksFindByPk = jest.fn();
const linksCreate = jest.fn();
const linksUpdate = jest.fn();
const linksDestroy = jest.fn();
const requireInstructorOrAdmin = jest.fn();

jest.unstable_mockModule('../models/index.js', () => ({
  Course: { findByPk: courseFindByPk },
  Assignment: {},
  AssignmentDraft: {},
  AssignmentExtension: { findOne: jest.fn() },
  AssignmentGrade: {},
  AssignmentQuestion: {},
  AssignmentQuestionOverride: {},
  Accommodation: { findOne: jest.fn() },
  CourseEnrollment: { findOne: courseEnrollmentFindOne },
  CourseTextbookStructure: {
    findByPk: structureFindByPk,
    create: structureCreate,
    update: structureUpdate,
    destroy: structureDestroy,
  },
  CourseTextbookPracticeLinks: {
    findByPk: linksFindByPk,
    create: linksCreate,
    update: linksUpdate,
    destroy: linksDestroy,
  },
  Submission: {},
  User: {},
  sequelize: { query: jest.fn(), fn: jest.fn(), col: jest.fn() },
}));

jest.unstable_mockModule('../routes/instructor.js', () => ({
  requireInstructorOrAdmin,
}));

const coursesRouter = (await import('../routes/courses.js')).default;

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

describe('textbook course routes', () => {
  beforeEach(() => {
    courseFindByPk.mockReset();
    courseFindByPk.mockResolvedValue({ id: 3, logic_system: 'fitch' });
    courseEnrollmentFindOne.mockReset();
    structureFindByPk.mockReset();
    structureCreate.mockReset();
    structureUpdate.mockReset();
    structureDestroy.mockReset();
    linksFindByPk.mockReset();
    linksCreate.mockReset();
    linksUpdate.mockReset();
    linksDestroy.mockReset();
    requireInstructorOrAdmin.mockReset();
  });

  test('GET textbook-structure is unavailable for Hurley courses', async () => {
    courseFindByPk.mockResolvedValue({ id: 3, logic_system: 'hurley' });
    const handlers = getRouteHandlers(coursesRouter, '/:id/textbook-structure', 'get');
    const res = await runHandlers(
      handlers,
      { params: { id: 3 }, user: { id: 9 } },
      createRes()
    );

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ message: 'Textbook not available for this course' });
    expect(courseEnrollmentFindOne).not.toHaveBeenCalled();
    expect(structureFindByPk).not.toHaveBeenCalled();
  });

  test('PUT textbook-practice-links cannot write to Hurley courses', async () => {
    courseFindByPk.mockResolvedValue({ id: 3, logic_system: 'hurley' });
    const handlers = getRouteHandlers(coursesRouter, '/:id/textbook-practice-links', 'put');
    const res = await runHandlers(
      handlers,
      {
        params: { id: 3 },
        user: { id: 9 },
        body: { links: 'invalid' },
      },
      createRes()
    );

    expect(res.statusCode).toBe(404);
    expect(requireInstructorOrAdmin).not.toHaveBeenCalled();
    expect(linksCreate).not.toHaveBeenCalled();
    expect(linksUpdate).not.toHaveBeenCalled();
  });

  test('GET textbook-structure uses the default logic system when the course omits one', async () => {
    courseFindByPk.mockResolvedValue({ id: 3, logic_system: null });
    courseEnrollmentFindOne.mockResolvedValue({ role: 'student' });
    structureFindByPk.mockResolvedValue(null);
    const handlers = getRouteHandlers(coursesRouter, '/:id/textbook-structure', 'get');
    const res = await runHandlers(
      handlers,
      { params: { id: 3 }, user: { id: 9 } },
      createRes()
    );

    expect(res.statusCode).toBe(200);
  });

  test('GET textbook-structure requires enrollment', async () => {
    courseEnrollmentFindOne.mockResolvedValue(null);
    const handlers = getRouteHandlers(coursesRouter, '/:id/textbook-structure', 'get');
    const res = await runHandlers(
      handlers,
      { params: { id: 3 }, user: { id: 9 } },
      createRes()
    );
    expect(res.statusCode).toBe(403);
  });

  test('GET textbook-structure returns defaults when missing', async () => {
    courseEnrollmentFindOne.mockResolvedValue({ role: 'student' });
    structureFindByPk.mockResolvedValue(null);
    const handlers = getRouteHandlers(coursesRouter, '/:id/textbook-structure', 'get');
    const res = await runHandlers(
      handlers,
      { params: { id: 3 }, user: { id: 9 } },
      createRes()
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      courseId: 3,
      nodes: null,
      usingDefaults: true,
      updatedAt: null,
    });
  });

  test('PUT textbook-structure requires instructor', async () => {
    requireInstructorOrAdmin.mockResolvedValue(false);
    const handlers = getRouteHandlers(coursesRouter, '/:id/textbook-structure', 'put');
    const res = await runHandlers(
      handlers,
      {
        params: { id: 3 },
        user: { id: 9 },
        body: {
          nodes: [
            {
              id: 'tn-1',
              slug: 'Ch1',
              file: 'Ch1.html',
              kind: 'chapter',
              displayTitle: 'Arguments',
              parentId: null,
              sortIndex: 0,
              hidden: false,
            },
          ],
        },
      },
      createRes()
    );
    expect(res.statusCode).toBe(403);
  });

  test('PUT textbook-practice-links creates an override for instructor', async () => {
    requireInstructorOrAdmin.mockResolvedValue(true);
    const links = [
      {
        id: 'link-1',
        textbookSlug: 'Ch1',
        sectionId: null,
        practiceId: 12,
        label: 'Practice',
        match: null,
      },
    ];
    linksCreate.mockResolvedValue({
      links,
      updated_at: '2026-01-01T00:00:00.000Z',
    });

    const handlers = getRouteHandlers(coursesRouter, '/:id/textbook-practice-links', 'put');
    const res = await runHandlers(
      handlers,
      {
        params: { id: 3 },
        user: { id: 9 },
        body: { links, updatedAt: null },
      },
      createRes()
    );

    expect(linksCreate).toHaveBeenCalledWith(expect.objectContaining({
      course_id: 3,
      links,
      updated_by: 9,
    }));
    expect(linksUpdate).not.toHaveBeenCalled();
    expect(linksFindByPk).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.usingDefaults).toBe(false);
    expect(res.body.links).toEqual(links);
  });

  test('PUT textbook-practice-links updates only the loaded revision', async () => {
    requireInstructorOrAdmin.mockResolvedValue(true);
    const links = [];
    const saved = {
      links,
      updated_at: '2026-01-02T00:00:00.000Z',
    };
    linksUpdate.mockResolvedValue([1, [saved]]);

    const handlers = getRouteHandlers(coursesRouter, '/:id/textbook-practice-links', 'put');
    const res = await runHandlers(
      handlers,
      {
        params: { id: 3 },
        user: { id: 9 },
        body: { links, updatedAt: '2026-01-01T00:00:00.000Z' },
      },
      createRes()
    );

    expect(linksUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ links, updated_by: 9 }),
      expect.objectContaining({
        where: {
          course_id: 3,
          updated_at: new Date('2026-01-01T00:00:00.000Z'),
        },
        returning: true,
      })
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.updatedAt).toBe(saved.updated_at);
  });

  test('PUT textbook-practice-links rejects a stale revision', async () => {
    requireInstructorOrAdmin.mockResolvedValue(true);
    linksUpdate.mockResolvedValue([0, []]);

    const handlers = getRouteHandlers(coursesRouter, '/:id/textbook-practice-links', 'put');
    const res = await runHandlers(
      handlers,
      {
        params: { id: 3 },
        user: { id: 9 },
        body: { links: [], updatedAt: '2026-01-01T00:00:00.000Z' },
      },
      createRes()
    );

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      message: 'Textbook resource changed since it was loaded',
    });
  });

  test('PUT textbook-practice-links rejects a concurrent first save', async () => {
    requireInstructorOrAdmin.mockResolvedValue(true);
    const conflict = new Error('duplicate key');
    conflict.name = 'SequelizeUniqueConstraintError';
    linksCreate.mockRejectedValue(conflict);

    const handlers = getRouteHandlers(coursesRouter, '/:id/textbook-practice-links', 'put');
    const res = await runHandlers(
      handlers,
      {
        params: { id: 3 },
        user: { id: 9 },
        body: { links: [], updatedAt: null },
      },
      createRes()
    );

    expect(res.statusCode).toBe(409);
  });
});
