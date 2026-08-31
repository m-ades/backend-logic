import { jest } from '@jest/globals';
import errorHandler from '../middleware/error-handler.js';

const courseEnrollmentFindOne = jest.fn();
const courseFindByPk = jest.fn();
const structureFindByPk = jest.fn();
const structureUpsert = jest.fn();
const structureDestroy = jest.fn();
const linksFindByPk = jest.fn();
const linksUpsert = jest.fn();
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
    upsert: structureUpsert,
    destroy: structureDestroy,
  },
  CourseTextbookPracticeLinks: {
    findByPk: linksFindByPk,
    upsert: linksUpsert,
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
    structureUpsert.mockReset();
    structureDestroy.mockReset();
    linksFindByPk.mockReset();
    linksUpsert.mockReset();
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
        body: { links: [] },
      },
      createRes()
    );

    expect(res.statusCode).toBe(404);
    expect(requireInstructorOrAdmin).not.toHaveBeenCalled();
    expect(linksUpsert).not.toHaveBeenCalled();
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

  test('PUT textbook-practice-links upserts for instructor', async () => {
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
    linksUpsert.mockResolvedValue([{
      links,
      updated_at: '2026-01-01T00:00:00.000Z',
    }]);

    const handlers = getRouteHandlers(coursesRouter, '/:id/textbook-practice-links', 'put');
    const res = await runHandlers(
      handlers,
      {
        params: { id: 3 },
        user: { id: 9 },
        body: { links },
      },
      createRes()
    );

    expect(linksUpsert).toHaveBeenCalled();
    expect(linksFindByPk).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.usingDefaults).toBe(false);
    expect(res.body.links).toEqual(links);
  });
});
