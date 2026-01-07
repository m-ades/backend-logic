import { createCrudRouter } from './crud.js';
import { User, AssignmentGrade, Assignment, CourseEnrollment, Course } from '../models/index.js';
import { hashPassword } from '../utils/passwords.js';
import { handleValidationResult } from '../middleware/validation.js';
import { userIdParam } from '../validators/common.js';

const sanitizeUser = (user) => {
  const data = user.toJSON ? user.toJSON() : user;
  delete data.password_hash;
  return data;
};

const router = createCrudRouter(User, {
  sanitize: sanitizeUser,
  allowCreate: false,
  beforeCreate: async (payload) => {
    const data = { ...payload };
    if (data.password) {
      data.password_hash = await hashPassword(data.password);
      delete data.password;
    }
    return data;
  },
  beforeUpdate: async (payload) => {
    const data = { ...payload };
    if (data.password) {
      data.password_hash = await hashPassword(data.password);
      delete data.password;
    }
    return data;
  },
});

router.get('/:id/grades', [userIdParam, handleValidationResult], async (req, res, next) => {
  try {
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
