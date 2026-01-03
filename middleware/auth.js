import { User } from '../models/index.js';
import { verifyUserToken } from '../utils/jwt.js';

export default async function requireAuth(req, res, next) {
  const authHeader = req.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.replace('Bearer ', '').trim()
    : null;

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
