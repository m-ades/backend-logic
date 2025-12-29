import { createCrudRouter } from './crud.js';
import { Course, Assignment, CourseEnrollment, User } from '../models/index.js';

const router = createCrudRouter(Course);

router.get('/:id/assignments', async (req, res) => {
  try {
    const assignments = await Assignment.findAll({
      where: { course_id: req.params.id },
      order: [['created_at', 'DESC']],
    });
    res.json(assignments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id/enrollments', async (req, res) => {
  try {
    const enrollments = await CourseEnrollment.findAll({
      where: { course_id: req.params.id },
      include: [{ model: User }],
    });
    res.json(enrollments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
