import { jest } from '@jest/globals';
import errorHandler from '../middleware/error-handler.js';

const databaseTransaction = { id: 'tx' };
const transaction = jest.fn(async (callback) => callback(databaseTransaction));
const extensionCreate = jest.fn();
const extensionFindByPk = jest.fn();
const accommodationFindByPk = jest.fn();
const assignmentFindAll = jest.fn();
// runs the write so tests see it land inside the regrade
const writeStudentGrades = jest.fn(async (_scope, write) => write());

jest.unstable_mockModule('../models/index.js', () => ({
  AssignmentExtension: {
    name: 'AssignmentExtension',
    create: extensionCreate,
    findByPk: extensionFindByPk,
    sequelize: { transaction },
  },
  Accommodation: {
    name: 'Accommodation',
    findByPk: accommodationFindByPk,
    sequelize: { transaction },
  },
  Assignment: { findAll: assignmentFindAll },
}));

jest.unstable_mockModule('../utils/authorization.js', () => ({
  isSystemAdmin: (user) => Boolean(user?.is_system_admin),
}));

jest.unstable_mockModule('../utils/grades.js', () => ({ writeStudentGrades }));

const { createCrudRouter } = await import('../routes/crud.js');
const extensionsRouter = (await import('../routes/assignment-extensions.js')).default;
const accommodationsRouter = (await import('../routes/accommodations.js')).default;

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
  end() {
    return this;
  },
});

const runHandlers = async (handlers, req, res) => {
  for (const handler of handlers) {
    let proceed = false;
    let failure = null;
    await handler(req, res, (err) => {
      if (err) failure = err;
      else proceed = true;
    });
    if (failure) {
      await errorHandler(failure, req, res, () => {});
      return res;
    }
    if (!proceed) return res;
  }
  return res;
};

const admin = { id: 1, is_system_admin: true };

describe('grade changing crud writes', () => {
  beforeEach(() => {
    extensionCreate.mockReset();
    extensionFindByPk.mockReset();
    accommodationFindByPk.mockReset();
    assignmentFindAll.mockReset();
    writeStudentGrades.mockClear();
    transaction.mockClear();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  it('fails the write when an around hook never calls it', async () => {
    const create = jest.fn();
    const router = createCrudRouter({ name: 'Thing', create, sequelize: { transaction } }, {
      authorizeRecord: () => true,
      authorizeCreate: () => true,
      authorizeList: () => true,
      aroundCreate: async () => {},
    });

    const res = await runHandlers(getRouteHandlers(router, '/', 'post'), { body: {}, user: admin }, createRes());

    expect(res.statusCode).toBe(500);
    expect(create).not.toHaveBeenCalled();
  });

  it('regrades the student when an admin grants an extension', async () => {
    const payload = { assignment_id: 9, user_id: 42, extended_due_date: '2026-02-01T00:00:00.000Z' };
    extensionCreate.mockImplementation(async (row) => ({ id: 5, ...row }));

    const res = await runHandlers(
      getRouteHandlers(extensionsRouter, '/', 'post'),
      { body: payload, user: admin },
      createRes()
    );

    expect(res.statusCode).toBe(201);
    expect(extensionCreate).toHaveBeenCalledWith(payload, { transaction: databaseTransaction });
    expect(writeStudentGrades).toHaveBeenCalledWith(
      { assignmentIds: [9], userId: 42, transaction: databaseTransaction },
      expect.any(Function)
    );
  });

  it('regrades the student when an admin removes an extension', async () => {
    const destroy = jest.fn().mockResolvedValue(undefined);
    extensionFindByPk.mockResolvedValue({ id: 5, assignment_id: 9, user_id: 42, destroy });

    const res = await runHandlers(
      getRouteHandlers(extensionsRouter, '/:id', 'delete'),
      { params: { id: '5' }, user: admin },
      createRes()
    );

    expect(res.statusCode).toBe(204);
    expect(destroy).toHaveBeenCalledWith({ transaction: databaseTransaction });
    expect(writeStudentGrades).toHaveBeenCalledWith(
      { assignmentIds: [9], userId: 42, transaction: databaseTransaction },
      expect.any(Function)
    );
  });

  it('keeps an extension on the student and assignment it was granted for', async () => {
    const record = { id: 5, assignment_id: 9, user_id: 42, set: jest.fn(), save: jest.fn() };
    extensionFindByPk.mockResolvedValue(record);

    const res = await runHandlers(
      getRouteHandlers(extensionsRouter, '/:id', 'put'),
      { params: { id: '5' }, body: { assignment_id: 10 }, user: admin },
      createRes()
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ message: 'assignment_id cannot change' });
    expect(record.save).not.toHaveBeenCalled();
  });

  it('regrades every course assignment when an admin edits an accommodation', async () => {
    const record = {
      id: 3,
      course_id: 7,
      user_id: 42,
      set: jest.fn(),
      changed: jest.fn(() => ['late_penalty_waived']),
      save: jest.fn().mockResolvedValue(undefined),
    };
    accommodationFindByPk.mockResolvedValue(record);
    assignmentFindAll.mockResolvedValue([{ id: 12 }, { id: 4 }]);

    const res = await runHandlers(
      getRouteHandlers(accommodationsRouter, '/:id', 'put'),
      { params: { id: '3' }, body: { late_penalty_waived: true }, user: admin },
      createRes()
    );

    expect(res.statusCode).toBe(200);
    expect(assignmentFindAll).toHaveBeenCalledWith({
      where: { course_id: 7, kind: 'assignment' },
      attributes: ['id'],
      transaction: databaseTransaction,
    });
    expect(record.save).toHaveBeenCalledWith({ transaction: databaseTransaction });
    expect(writeStudentGrades).toHaveBeenCalledWith(
      { assignmentIds: [12, 4], userId: 42, transaction: databaseTransaction },
      expect.any(Function)
    );
  });
});
