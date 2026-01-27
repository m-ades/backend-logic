import { createCrudRouter } from './crud.js';
import { User, AssignmentGrade, Assignment, CourseEnrollment, Course } from '../models/index.js';
import { hashPassword, isStrongPassword, PASSWORD_POLICY_MESSAGE, verifyPassword } from '../utils/passwords.js';
import { isSelfOrAdmin, isSystemAdmin } from '../utils/authorization.js';
import { handleValidationResult } from '../middleware/validation.js';
import { userIdParam } from '../validators/common.js';
import { ensureZeroGradesForPastDue } from '../utils/grades.js';

const sanitizeUser = (user) => {
  const data = user.toJSON ? user.toJSON() : user;
  delete data.password_hash;
  return data;
};

const PASSWORD_CHANGE_WINDOW_MS = 60 * 60 * 1000;
const passwordChangeTracker = new Map();

const assertStrongPassword = (password) => {
  if (!isStrongPassword(password)) {
    const error = new Error(PASSWORD_POLICY_MESSAGE);
    error.status = 400;
    throw error;
  }
};

const assertPasswordChangeNotRateLimited = (userId) => {
  if (!userId) return;
  const lastChangeAt = passwordChangeTracker.get(userId);
  if (!lastChangeAt) return;
  const elapsed = Date.now() - lastChangeAt;
  if (elapsed >= PASSWORD_CHANGE_WINDOW_MS) return;
  const minutesRemaining = Math.ceil((PASSWORD_CHANGE_WINDOW_MS - elapsed) / 60000);
  const error = new Error(
    `Password can only be changed once per hour. Try again in ${minutesRemaining} minute${minutesRemaining === 1 ? '' : 's'}.`
  );
  error.status = 429;
  throw error;
};

const assertCurrentPasswordValid = async ({ req, record }) => {
  if (!req || !record) return;
  const isSystemAdmin = Boolean(req.user?.is_system_admin);
  const isSelf = Number(req.user?.id) === Number(record.id);
  if (isSystemAdmin && !isSelf) {
    return;
  }
  const currentPassword = req.body?.current_password;
  if (!currentPassword) {
    const error = new Error('current password is required');
    error.status = 400;
    throw error;
  }
  const isValid = await verifyPassword(record.password_hash, currentPassword);
  if (!isValid) {
    const error = new Error('current password is incorrect');
    error.status = 401;
    throw error;
  }
};

const router = createCrudRouter(User, {
  sanitize: sanitizeUser,
  allowCreate: false,
  authorizeList: (req) => isSystemAdmin(req.user),
  authorizeRecord: (req, record, action) => {
    if (action === 'delete') {
      return isSystemAdmin(req.user); // block self-delete; admin only
    }
    return isSelfOrAdmin(req.user, record.id);
  },
  beforeCreate: async (_req, payload) => {
    const data = { ...payload };
    if (data.password) {
      assertStrongPassword(data.password);
      data.password_hash = await hashPassword(data.password);
      delete data.password;
    }
    return data;
  },
  beforeUpdate: async (req, payload, record) => {
    const data = { ...payload };
    delete data.password_hash;
    delete data.token_version;
    delete data.is_system_admin;
    delete data.current_password;

    if (data.password) {
      assertPasswordChangeNotRateLimited(record?.id);
      await assertCurrentPasswordValid({ req, record });
      assertStrongPassword(data.password);
      data.password_hash = await hashPassword(data.password);
      delete data.password;
      data.token_version = (record?.token_version || 0) + 1;
      if (record?.id) {
        passwordChangeTracker.set(record.id, Date.now());
      }
    }
    return data;
  },
});

router.get('/:id/grades', [userIdParam, handleValidationResult], async (req, res, next) => {
  try {
    if (!isSelfOrAdmin(req.user, req.params.id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    await ensureZeroGradesForPastDue({ userId: req.params.id });
    const grades = await AssignmentGrade.findAll({
      where: { user_id: req.params.id },
      include: [{ model: Assignment }],
      order: [['graded_at', 'DESC']],
    });
    res.json(grades);
  } catch (error) {
    next(error);
  }
});

export default router;
