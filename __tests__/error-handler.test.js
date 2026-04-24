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
  it('maps database connectivity failures to 503', () => {
    const res = createResponse();

    errorHandler(
      {
        name: 'SequelizeConnectionError',
        parent: { code: 'EAI_AGAIN' },
      },
      {},
      res,
      () => {}
    );

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ message: 'database unavailable' });
  });

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

  it('falls back to 500 for unknown errors', () => {
    const res = createResponse();

    errorHandler(new Error('boom'), {}, res, () => {});

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ message: 'internal server error' });
  });
});
