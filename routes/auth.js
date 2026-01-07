import express from 'express';
import { User } from '../models/index.js';
import { verifyPassword } from '../utils/passwords.js';
import { signUserToken } from '../utils/jwt.js';

const router = express.Router();
const COOKIE_NAME = 'auth_token';
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const getCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: COOKIE_MAX_AGE_MS,
  path: '/',
});

const sanitizeUser = (user) => {
  const data = user.toJSON ? user.toJSON() : user;
  delete data.password_hash;
  return data;
};

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'username & password required' });
    }

    const user = await User.findOne({
      where: {
        username,
      },
    });

    if (!user) {
      return res.status(401).json({ message: 'invalid credentials' });
    }

    const isValid = await verifyPassword(user.password_hash, password);
    if (!isValid) {
      return res.status(401).json({ message: 'invalid credentials' });
    }

    // issue jwt 
    const token = signUserToken(user);
    res.cookie(COOKIE_NAME, token, getCookieOptions());
    res.json({ user: sanitizeUser(user) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/logout', (_req, res) => {
  // jwt logout drop the token
  res.clearCookie(COOKIE_NAME, getCookieOptions());
  res.json({ ok: true });
});

router.post('/logout-all', async (req, res) => {
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
    res.clearCookie(COOKIE_NAME, getCookieOptions());
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
