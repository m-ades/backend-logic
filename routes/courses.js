import { createCrudRouter } from './crud.js';
import { Course, Assignment, CourseEnrollment, User } from '../models/index.js';
import { handleValidationResult } from '../middleware/validation.js';
import { courseIdParam } from '../validators/common.js';
import { isSystemAdmin } from '../utils/authorization.js';
import { requireInstructorOrAdmin } from './instructor.js';

const router = createCrudRouter(Course);

async function requireEnrollmentOrAdmin(courseId, user) {
  if (isSystemAdmin(user)) {
    return true;
  }
  const enrollment = await CourseEnrollment.findOne({
    where: { course_id: courseId, user_id: user.id },
  });
  return Boolean(enrollment);
}

router.get('/:id/assignments', [courseIdParam, handleValidationResult], async (req, res, next) => {
  try {
    if (!(await requireEnrollmentOrAdmin(req.params.id, req.user))) {
      return res.status(403).json({ message: 'Enrollment required' });
    }
    const assignments = await Assignment.findAll({
      where: { course_id: req.params.id },
      order: [['created_at', 'DESC']],
    });
    res.json(assignments);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/enrollments', [courseIdParam, handleValidationResult], async (req, res, next) => {
  try {
    if (!(await requireInstructorOrAdmin(req.params.id, req.user.id))) {
      return res.status(403).json({ message: 'Instructor or admin access required' });
    }
    const enrollments = await CourseEnrollment.findAll({
      where: { course_id: req.params.id },
      include: [{ model: User }],
    });
    res.json(enrollments);
  } catch (error) {
    next(error);
  }
});

export default router;
