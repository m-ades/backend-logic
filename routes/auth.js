import express from 'express';
import { body } from 'express-validator';
import { User } from '../models/index.js';
import { verifyPassword } from '../utils/passwords.js';
import { signUserToken } from '../utils/jwt.js';
import { handleValidationResult } from '../middleware/validation.js';
import requireAuth from '../middleware/auth.js';

const router = express.Router();
const COOKIE_NAME = 'auth_token';
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;


const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_ACCOUNT = 10;
const MAX_FAILURES_PER_USERNAME = 10;
const MAX_FAILURES_PER_IP = 30; 
const accountFailureTracker = new Map();
const usernameFailureTracker = new Map();
const ipFailureTracker = new Map();

function isLockedOut(tracker, key, limit) {
  const entry = tracker.get(key);
  if (!entry) return false;
  if (Date.now() - entry.windowStart >= LOGIN_WINDOW_MS) {
    tracker.delete(key);
    return false;
  }
  return entry.count >= limit;
}

function recordLoginFailure(tracker, key) {
  const entry = tracker.get(key);
  if (!entry || Date.now() - entry.windowStart >= LOGIN_WINDOW_MS) {
    tracker.set(key, { count: 1, windowStart: Date.now() });
    return;
  }
  entry.count += 1;
}

const getCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    ...(isProduction ? { domain: '.hunterlogic.org' } : {}),
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/',
  };
};

const getClearCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    ...(isProduction ? { domain: '.hunterlogic.org' } : {}),
    path: '/',
  };
};

const clearAuthCookieVariants = (res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const base = {
    path: '/',
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
  };

  res.clearCookie(COOKIE_NAME);
  res.clearCookie(COOKIE_NAME, { ...base });
  res.clearCookie(COOKIE_NAME, { ...base, domain: 'hunterlogic.org' });
  res.clearCookie(COOKIE_NAME, { ...base, domain: '.hunterlogic.org' });
};

const sanitizeUser = (user) => {
  const data = user.toJSON ? user.toJSON() : user;
  delete data.password_hash;
  return data;
};

router.post(
  '/login',
  [
    body('username').isString().trim().notEmpty().withMessage('username is required'),
    body('password').isString().notEmpty().withMessage('password is required'),
    handleValidationResult,
  ],
  async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const ip = req.ip;
    const accountKey = `${ip}:${username}`;

    if (
      isLockedOut(accountFailureTracker, accountKey, MAX_FAILURES_PER_ACCOUNT)
      || isLockedOut(usernameFailureTracker, username, MAX_FAILURES_PER_USERNAME)
      || isLockedOut(ipFailureTracker, ip, MAX_FAILURES_PER_IP)
    ) {
      return res.status(429).json({ message: 'Too many login attempts. Try again later.' });
    }

    const user = await User.unscoped().findOne({
      where: {
        username,
      },
    });

    if (!user) {
      recordLoginFailure(accountFailureTracker, accountKey);
      recordLoginFailure(usernameFailureTracker, username);
      recordLoginFailure(ipFailureTracker, ip);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isValid = await verifyPassword(user.password_hash, password);
    if (!isValid) {
      recordLoginFailure(accountFailureTracker, accountKey);
      recordLoginFailure(usernameFailureTracker, username);
      recordLoginFailure(ipFailureTracker, ip);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    accountFailureTracker.delete(accountKey);
    usernameFailureTracker.delete(username);

    // issue jwt
    const token = signUserToken(user);
    clearAuthCookieVariants(res);
    res.cookie(COOKIE_NAME, token, getCookieOptions());
    res.json({ user: sanitizeUser(user) });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', (_req, res) => {
  // jwt logout drop the token
  clearAuthCookieVariants(res);
  res.json({ ok: true });
});

router.post('/logout-all', requireAuth, async (req, res, next) => {
  try {
    // bump token_version so all existing tokens become invalid
    const userId = req.user.id;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'user not found' });
    }

    await user.update({ token_version: user.token_version + 1 });
    clearAuthCookieVariants(res);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
