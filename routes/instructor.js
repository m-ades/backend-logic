import express from 'express';
import {
  Assignment,
  AssignmentExtension,
  CourseEnrollment,
  Accommodation,
  AssignmentGrade,
  AssignmentQuestion,
  Submission,
  User,
} from '../models/index.js';
import { computeDeadlinePolicy } from '../utils/assignmentPolicy.js';
import { hashPassword } from '../utils/passwords.js';

const router = express.Router();

async function requireInstructor(courseId, userId) {
  const enrollment = await CourseEnrollment.findOne({
    where: { course_id: courseId, user_id: userId },
  });
  return enrollment?.role === 'instructor' || enrollment?.role === 'ta';
}

async function requireInstructorOrAdmin(courseId, userId) {
  const user = await User.findByPk(userId, { attributes: ['is_system_admin'] });
  if (user?.is_system_admin) {
    return true;
  }
  return requireInstructor(courseId, userId);
}

const sanitizeUser = (user) => {
  const data = user.toJSON ? user.toJSON() : user;
  delete data.password_hash;
  return data;
};

router.post('/courses/:id/students', async (req, res) => {
  try {
    const courseId = Number(req.params.id);
    const userId = Number(req.query.userId);
    if (!courseId || !userId) {
      return res.status(400).json({ message: 'courseId and userId are required' });
    }

    if (!(await requireInstructorOrAdmin(courseId, userId))) {
      return res.status(403).json({ message: 'Instructor or admin access required' });
    }

    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'username and password are required' });
    }

    const existing = await User.findOne({
      where: {
        username,
      },
    });
    if (existing) {
      return res.status(409).json({ message: 'Username already in use' });
    }

    const password_hash = await hashPassword(password);
    const newUser = await User.create({
      username,
      password_hash,
    });

    await CourseEnrollment.create({
      course_id: courseId,
      user_id: newUser.id,
      role: 'student',
    });

    res.status(201).json({ user: sanitizeUser(newUser) });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.get('/courses/:id/roster', async (req, res) => {
  try {
    const courseId = Number(req.params.id);
    const userId = Number(req.query.userId);
    if (!courseId || !userId) {
      return res.status(400).json({ message: 'courseId and userId are required' });
    }

    if (!(await requireInstructor(courseId, userId))) {
      return res.status(403).json({ message: 'Instructor access required' });
    }

    const roster = await CourseEnrollment.findAll({
      where: { course_id: courseId },
      include: [{ model: User }],
      order: [['role', 'ASC']],
    });

    res.json(roster);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/courses/:id/accommodations', async (req, res) => {
  try {
    const courseId = Number(req.params.id);
    const userId = Number(req.query.userId);
    if (!courseId || !userId) {
      return res.status(400).json({ message: 'courseId and userId are required' });
    }

    if (!(await requireInstructor(courseId, userId))) {
      return res.status(403).json({ message: 'Instructor access required' });
    }

    const accommodations = await Accommodation.findAll({
      where: { course_id: courseId },
      include: [{ model: User }],
      order: [['id', 'ASC']],
    });

    res.json(accommodations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/assignments/:id/extensions', async (req, res) => {
  try {
    const assignmentId = Number(req.params.id);
    const userId = Number(req.query.userId);
    if (!assignmentId || !userId) {
      return res.status(400).json({ message: 'assignmentId and userId are required' });
    }

    const assignment = await Assignment.findByPk(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    if (!(await requireInstructor(assignment.course_id, userId))) {
      return res.status(403).json({ message: 'Instructor access required' });
    }

    const extensions = await AssignmentExtension.findAll({
      where: { assignment_id: assignmentId },
      include: [{ model: User }],
      order: [['id', 'ASC']],
    });

    res.json(extensions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/assignments/:id/submissions', async (req, res) => {
  try {
    const assignmentId = Number(req.params.id);
    const userId = Number(req.query.userId);
    if (!assignmentId || !userId) {
      return res.status(400).json({ message: 'assignmentId and userId are required' });
    }

    const assignment = await Assignment.findByPk(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    if (!(await requireInstructor(assignment.course_id, userId))) {
      return res.status(403).json({ message: 'Instructor access required' });
    }

    const submissions = await Submission.findAll({
      include: [
        {
          model: AssignmentQuestion,
          where: { assignment_id: assignmentId },
        },
        { model: User },
      ],
      order: [['submitted_at', 'DESC']],
    });

    res.json(submissions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/assignments/:id/grades', async (req, res) => {
  try {
    const assignmentId = Number(req.params.id);
    const userId = Number(req.query.userId);
    if (!assignmentId || !userId) {
      return res.status(400).json({ message: 'assignmentId and userId are required' });
    }

    const assignment = await Assignment.findByPk(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    if (!(await requireInstructor(assignment.course_id, userId))) {
      return res.status(403).json({ message: 'Instructor access required' });
    }

    const grades = await AssignmentGrade.findAll({
      where: { assignment_id: assignmentId },
      include: [{ model: User }],
      order: [['graded_at', 'DESC']],
    });

    res.json(grades);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/courses/:id/deadlines', async (req, res) => {
  try {
    const courseId = Number(req.params.id);
    const userId = Number(req.query.userId);
    if (!courseId || !userId) {
      return res.status(400).json({ message: 'courseId and userId are required' });
    }

    if (!(await requireInstructor(courseId, userId))) {
      return res.status(403).json({ message: 'Instructor access required' });
    }

    const assignments = await Assignment.findAll({
      where: { course_id: courseId },
      order: [['due_date', 'ASC']],
    });

    const policies = await Promise.all(
      assignments.map(async (assignment) => {
        const extension = await AssignmentExtension.findOne({
          where: { assignment_id: assignment.id, user_id: userId },
        });
        const accommodation = await Accommodation.findOne({
          where: { course_id: courseId, user_id },
        });
        return {
          assignment_id: assignment.id,
          title: assignment.title,
          ...computeDeadlinePolicy({ assignment, extension, accommodation }),
        };
      })
    );

    res.json(policies);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
