import { jest } from '@jest/globals';
import { createCsrfProtection, parseAllowedOrigins } from '../middleware/csrf.js';

const createReq = ({ method = 'POST', headers = {} } = {}) => ({
  method,
  get(name) {
    return headers[String(name).toLowerCase()] ?? headers[name] ?? undefined;
  },
});

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

describe('csrf protection', () => {
  it('parses configured origins consistently', () => {
    expect(parseAllowedOrigins(' https://app.example.com/, http://localhost:5173 ')).toEqual([
      'https://app.example.com',
      'http://localhost:5173',
    ]);
  });

  it('adds hunterlogic bare/www variants automatically', () => {
    expect(parseAllowedOrigins('https://www.hunterlogic.org')).toEqual([
      'https://www.hunterlogic.org',
      'https://hunterlogic.org',
    ]);
    expect(parseAllowedOrigins('https://hunterlogic.org')).toEqual([
      'https://hunterlogic.org',
      'https://www.hunterlogic.org',
    ]);
  });

  it('allows safe methods without origin headers', () => {
    const middleware = createCsrfProtection(['https://app.example.com']);
    const req = createReq({ method: 'GET' });
    const res = createRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  it('allows unsafe requests from an allowed origin', () => {
    const middleware = createCsrfProtection(['https://app.example.com']);
    const req = createReq({
      headers: { origin: 'https://app.example.com' },
    });
    const res = createRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  it('allows unsafe requests from an allowed referer origin', () => {
    const middleware = createCsrfProtection(['https://app.example.com']);
    const req = createReq({
      headers: { referer: 'https://app.example.com/dashboard?tab=1' },
    });
    const res = createRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  it('rejects unsafe requests from a disallowed origin', () => {
    const middleware = createCsrfProtection(['https://app.example.com']);
    const req = createReq({
      headers: { origin: 'https://evil.example.com' },
    });
    const res = createRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ message: 'Invalid request origin' });
  });

  it('rejects unsafe requests without origin metadata', () => {
    const middleware = createCsrfProtection(['https://app.example.com']);
    const req = createReq();
    const res = createRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ message: 'Invalid request origin' });
  });
});
