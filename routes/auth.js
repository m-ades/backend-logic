import express from 'express';
import { body } from 'express-validator';
import { User } from '../models/index.js';
import { verifyPassword } from '../utils/passwords.js';
import { signUserToken } from '../utils/jwt.js';
import { handleValidationResult } from '../middleware/validation.js';

const router = express.Router();
const COOKIE_NAME = 'auth_token';
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const getCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
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
    path: '/',
  };
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

    const user = await User.findOne({
      where: {
        username,
      },
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isValid = await verifyPassword(user.password_hash, password);
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // issue jwt 
    const token = signUserToken(user);
    res.cookie(COOKIE_NAME, token, getCookieOptions());
    res.json({ user: sanitizeUser(user) });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', (_req, res) => {
  // jwt logout drop the token
  res.clearCookie(COOKIE_NAME, getClearCookieOptions());
  res.json({ ok: true });
});

router.post('/logout-all', async (req, res, next) => {
  try {
    // bump token_version so all existing tokens become invalid
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'unauthorized' });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'user not found' });
    }

    await user.update({ token_version: user.token_version + 1 });
    res.clearCookie(COOKIE_NAME, getClearCookieOptions());
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
