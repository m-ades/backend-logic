import errorHandler from '../middleware/error-handler.js';

function createResponse() {
  return {
    statusCode: null,
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
}

describe('errorHandler', () => {
  it('keeps explicit http errors', () => {
    const res = createResponse();

    errorHandler(
      {
        status: 403,
        message: 'forbidden',
      },
      {},
      res,
      () => {}
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ message: 'forbidden' });
  });

  it('maps a lost unique key race to a conflict', () => {
    const res = createResponse();
    const error = new Error('Validation error');
    error.name = 'SequelizeUniqueConstraintError';

    errorHandler(error, {}, res, () => {});

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ message: 'conflict' });
  });

  it('falls back to 500 for unknown errors', () => {
    const res = createResponse();

    errorHandler(new Error('boom'), {}, res, () => {});

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ message: 'internal server error' });
  });
});
