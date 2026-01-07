import { createCrudRouter } from './crud.js';
import { Course, Assignment, CourseEnrollment, User } from '../models/index.js';
import { handleValidationResult } from '../middleware/validation.js';
import { courseIdParam } from '../validators/common.js';

const router = createCrudRouter(Course);

router.get('/:id/assignments', [courseIdParam, handleValidationResult], async (req, res, next) => {
  try {
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
