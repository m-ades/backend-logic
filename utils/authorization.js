export function isSystemAdmin(user) {
  return Boolean(user?.is_system_admin);
}

export function isSelfOrAdmin(user, targetUserId) {
  if (!user) return false;
  if (isSystemAdmin(user)) return true;
  return Number(user.id) === Number(targetUserId);
}

export function ensureSelfOrAdmin(req, res, targetUserId) {
  if (isSelfOrAdmin(req.user, targetUserId)) {
    return true;
  }
  res.status(403).json({ message: 'Forbidden' });
  return false;
}
