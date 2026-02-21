import { User } from '../models/index.js';
import { verifyUserToken } from '../utils/jwt.js';

const COOKIE_NAME = 'auth_token';

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

const parseCookies = (cookieHeader) => {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((acc, part) => {
    const trimmed = part.trim();
    if (!trimmed) return acc;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) return acc;
    const name = trimmed.slice(0, eqIndex);
    const value = trimmed.slice(eqIndex + 1);
    try {
      acc[name] = decodeURIComponent(value);
    } catch (error) {
      // Ignore malformed cookie values.
      return acc;
    }
    return acc;
  }, {});
};

export default async function requireAuth(req, res, next) {
  const authHeader = req.get('authorization') || '';
  const tokenFromHeader = authHeader.startsWith('Bearer ')
    ? authHeader.replace('Bearer ', '').trim()
    : null;
  const cookieHeader = req.get('cookie') || '';
  const tokenFromCookie = parseCookies(cookieHeader)[COOKIE_NAME] || null;
  const token = tokenFromHeader || tokenFromCookie;

  if (!token) {
    return res.status(401).json({ message: 'unauthorized' });
  }

  let payload;
  try {
    payload = verifyUserToken(token);
  } catch (error) {
    res.clearCookie(COOKIE_NAME, getClearCookieOptions());
    return res.status(401).json({ message: 'invalid token' });
  }

  try {
    const user = await User.findByPk(payload.user_id);
    if (!user) {
      return res.status(401).json({ message: 'unauthorized' });
    }

    if ((user.token_version || 0) !== (payload.token_version || 0)) {
      res.clearCookie(COOKIE_NAME, getClearCookieOptions());
      return res.status(401).json({ message: 'token revoked' });
    }

    req.user = { id: user.id, username: user.username, is_system_admin: user.is_system_admin };
    return next();
  } catch (error) {
    return next(error);
  }
}

// after requireAuth. 401 if no user.
export function requireUser(req, res, next) {
  if (!req.user?.id) {
    return res.status(401).json({ message: 'unauthorized' });
  }
  return next();
}
