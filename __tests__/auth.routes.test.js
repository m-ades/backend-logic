import { jest } from '@jest/globals';
import errorHandler from '../middleware/error-handler.js';

const userFindOne = jest.fn();
const verifyPassword = jest.fn();
const signUserToken = jest.fn();

jest.unstable_mockModule('../models/index.js', () => ({
  User: {
    unscoped: () => ({ findOne: userFindOne }),
    findByPk: jest.fn(),
  },
}));

jest.unstable_mockModule('../utils/passwords.js', () => ({
  verifyPassword,
}));

jest.unstable_mockModule('../utils/jwt.js', () => ({
  signUserToken,
  verifyUserToken: jest.fn(),
}));

const authRouter = (await import('../routes/auth.js')).default;

const getRouteHandlers = (path, method) => {
  const layer = authRouter.stack.find(
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
  cookie() {
    return this;
  },
  clearCookie() {
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

const login = (ip, username, password) => {
  const handlers = getRouteHandlers('/login', 'post');
  return runHandlers(handlers, { ip, body: { username, password } }, createRes());
};

describe('login rate limiting', () => {
  beforeEach(() => {
    userFindOne.mockReset();
    verifyPassword.mockReset();
    signUserToken.mockReset().mockReturnValue('token');
    jest.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('allows a correct login through', async () => {
    userFindOne.mockResolvedValueOnce({ id: 1, username: 'alice', password_hash: 'h', toJSON: () => ({ id: 1, username: 'alice' }) });
    verifyPassword.mockResolvedValueOnce(true);

    const res = await login('1.1.1.1', 'alice', 'correct-password');

    expect(res.statusCode).toBe(200);
    expect(res.body.user).toEqual({ id: 1, username: 'alice' });
  });

  it('locks out a username after the configured number of failures', async () => {
    userFindOne.mockResolvedValue({ id: 1, username: 'alice', password_hash: 'h' });
    verifyPassword.mockResolvedValue(false);

    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await login('1.1.1.2', 'alice', 'wrong');
      expect(res.statusCode).toBe(401);
    }

    // the 11th attempt is blocked even with the correct password
    verifyPassword.mockResolvedValueOnce(true);
    const blocked = await login('1.1.1.2', 'alice', 'correct-password');

    expect(blocked.statusCode).toBe(429);
  });

  it('locks out a username regardless of the casing used on each attempt', async () => {
    userFindOne.mockResolvedValue({ id: 1, username: 'dave', password_hash: 'h' });
    verifyPassword.mockResolvedValue(false);

    const casings = ['dave', 'Dave', 'DAVE', 'dAvE', 'daVE'];
    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await login('1.1.1.6', casings[i % casings.length], 'wrong');
      expect(res.statusCode).toBe(401);
    }

    verifyPassword.mockResolvedValueOnce(true);
    const blocked = await login('1.1.1.6', 'DAVE', 'correct-password');

    expect(blocked.statusCode).toBe(429);
  });

  it('does not lock out a different username from the same ip', async () => {
    userFindOne.mockResolvedValue({ id: 1, username: 'alice', password_hash: 'h' });
    verifyPassword.mockResolvedValue(false);

    for (let i = 0; i < 10; i += 1) {
      await login('1.1.1.3', 'alice', 'wrong');
    }

    userFindOne.mockResolvedValueOnce({ id: 2, username: 'bob', password_hash: 'h', toJSON: () => ({ id: 2, username: 'bob' }) });
    verifyPassword.mockResolvedValueOnce(true);
    const res = await login('1.1.1.3', 'bob', 'correct-password');

    // still under the broader per-ip credential-stuffing limit (50), so this succeeds
    expect(res.statusCode).toBe(200);
  });

  it('locks out one account even when the attacker rotates ips', async () => {
    userFindOne.mockResolvedValue({ id: 1, username: 'carol', password_hash: 'h' });
    verifyPassword.mockResolvedValue(false);

    for (let i = 0; i < 10; i += 1) {
      // a fresh source ip on every attempt, only the username repeats
      await login(`3.3.3.${i}`, 'carol', 'wrong');
    }

    // the 11th attempt, from yet another new ip, is blocked even with the correct password
    verifyPassword.mockResolvedValueOnce(true);
    const blocked = await login('3.3.3.99', 'carol', 'correct-password');

    expect(blocked.statusCode).toBe(429);
  });

  it('locks out an ip across many usernames once the credential-stuffing limit is hit', async () => {
    userFindOne.mockResolvedValue(null);

    for (let i = 0; i < 50; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await login('2.2.2.2', `user${i}`, 'guess');
    }

    const res = await login('2.2.2.2', 'yet-another-user', 'guess');

    expect(res.statusCode).toBe(429);
  });

  it('resets the account lockout window after it elapses', async () => {
    userFindOne.mockResolvedValue({ id: 1, username: 'alice', password_hash: 'h' });
    verifyPassword.mockResolvedValue(false);

    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await login('1.1.1.4', 'alice', 'wrong');
    }

    jest.advanceTimersByTime(15 * 60 * 1000 + 1);

    userFindOne.mockResolvedValueOnce({ id: 1, username: 'alice', password_hash: 'h', toJSON: () => ({ id: 1, username: 'alice' }) });
    verifyPassword.mockResolvedValueOnce(true);
    const res = await login('1.1.1.4', 'alice', 'correct-password');

    expect(res.statusCode).toBe(200);
  });

  it('clears the account lockout counter after a successful login', async () => {
    userFindOne.mockResolvedValue({ id: 1, username: 'alice', password_hash: 'h' });
    verifyPassword.mockResolvedValue(false);

    for (let i = 0; i < 5; i += 1) {
      await login('1.1.1.5', 'alice', 'wrong');
    }

    userFindOne.mockResolvedValueOnce({ id: 1, username: 'alice', password_hash: 'h', toJSON: () => ({ id: 1, username: 'alice' }) });
    verifyPassword.mockResolvedValueOnce(true);
    const success = await login('1.1.1.5', 'alice', 'correct-password');
    expect(success.statusCode).toBe(200);

    // failures resume counting from zero, so 5 more failures should not trip the 10-limit yet
    verifyPassword.mockResolvedValue(false);
    for (let i = 0; i < 5; i += 1) {
      const res = await login('1.1.1.5', 'alice', 'wrong');
      expect(res.statusCode).toBe(401);
    }
  });
});
