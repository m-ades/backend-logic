import { User } from '../models/index.js';
import { verifyUserToken } from '../utils/jwt.js';

const COOKIE_NAME = 'auth_token';

const parseCookies = (cookieHeader) => {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((acc, part) => {
    const trimmed = part.trim();
    if (!trimmed) return acc;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) return acc;
    const name = trimmed.slice(0, eqIndex);
    const value = trimmed.slice(eqIndex + 1);
    acc[name] = decodeURIComponent(value);
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
    // verify jwt 
    payload = verifyUserToken(token);
  } catch (error) {
    return res.status(401).json({ message: 'invalid token' });
  }

  const user = await User.findByPk(payload.user_id);
  if (!user) {
    return res.status(401).json({ message: 'unauthorized' });
  }

  if ((user.token_version || 0) !== (payload.token_version || 0)) {
    // token revoked via logout-all?
    return res.status(401).json({ message: 'token revoked' });
  }

  req.user = { id: user.id, username: user.username };
  return next();
}
