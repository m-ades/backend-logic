import express from 'express';
import { body, param } from 'express-validator';
import { CourseContact, CourseEnrollment } from '../models/index.js';
import { requireInstructorOrAdmin } from './instructor.js';
import { isSystemAdmin } from '../utils/authorization.js';
import { handleValidationResult } from '../middleware/validation.js';
import { courseIdParam } from '../validators/common.js';

// course contacts provide a public staff directory for one course

const router = express.Router();
const contactFields = [
  'name',
  'role',
  'email',
  'office_hours',
  'office_location',
];
const contactIdParam = param('contactId')
  .isInt({ gt: 0 })
  .toInt()
  .withMessage('contactId must be a positive integer');
const contactValueValidators = [
  body('name').optional().isString().trim().isLength({ min: 1, max: 120 })
    .withMessage('name must be between 1 and 120 characters'),
  body('role').optional().isString().trim().isLength({ min: 1, max: 120 })
    .withMessage('role must be between 1 and 120 characters'),
  body('email').optional().isString().trim().isEmail().normalizeEmail()
    .withMessage('email must be valid'),
  body('office_hours').optional({ nullable: true }).isString().trim().isLength({ max: 1000 })
    .withMessage('office_hours must be at most 1000 characters'),
  body('office_location').optional({ nullable: true }).isString().trim().isLength({ max: 255 })
    .withMessage('office_location must be at most 255 characters'),
];

const hasContactField = (value) => contactFields.some((field) => value[field] !== undefined);
const contactPayload = (bodyValue) => Object.fromEntries(
  contactFields
    .filter((field) => bodyValue[field] !== undefined)
    .map((field) => [field, bodyValue[field]])
);

async function canReadCourseContacts(courseId, user) {
  if (isSystemAdmin(user)) return true;
  return Boolean(await CourseEnrollment.findOne({
    where: { course_id: courseId, user_id: user.id },
  }));
}

router.get('/:id/contacts', [courseIdParam, handleValidationResult], async (req, res, next) => {
  try {
    const courseId = req.params.id;
    if (!(await canReadCourseContacts(courseId, req.user))) {
      return res.status(403).json({ message: 'Enrollment required' });
    }
    const contacts = await CourseContact.findAll({
      where: { course_id: courseId },
      order: [
        ['id', 'ASC'],
      ],
    });
    return res.json(contacts);
  } catch (error) {
    return next(error);
  }
});

router.post(
  '/:id/contacts',
  [
    courseIdParam,
    body('name').isString().trim().isLength({ min: 1, max: 120 }).withMessage('name is required'),
    body('role').isString().trim().isLength({ min: 1, max: 120 }).withMessage('role is required'),
    body('email').isString().trim().isEmail().normalizeEmail().withMessage('email must be valid'),
    ...contactValueValidators.slice(3),
    handleValidationResult,
  ],
  async (req, res, next) => {
    try {
      const courseId = req.params.id;
      if (!(await requireInstructorOrAdmin(courseId, req.user.id))) {
        return res.status(403).json({ message: 'Instructor or admin access required' });
      }
      const contact = await CourseContact.create({
        course_id: courseId,
        ...contactPayload(req.body),
      });
      return res.status(201).json(contact);
    } catch (error) {
      return next(error);
    }
  }
);

router.put(
  '/:id/contacts/:contactId',
  [courseIdParam, contactIdParam, ...contactValueValidators, handleValidationResult],
  async (req, res, next) => {
    try {
      if (!hasContactField(req.body)) {
        return res.status(400).json({ message: 'At least one contact field is required' });
      }
      const courseId = req.params.id;
      if (!(await requireInstructorOrAdmin(courseId, req.user.id))) {
        return res.status(403).json({ message: 'Instructor or admin access required' });
      }
      const contact = await CourseContact.findOne({
        where: { id: req.params.contactId, course_id: courseId },
      });
      if (!contact) {
        return res.status(404).json({ message: 'Contact not found' });
      }
      await contact.update(contactPayload(req.body));
      return res.json(contact);
    } catch (error) {
      return next(error);
    }
  }
);

router.delete(
  '/:id/contacts/:contactId',
  [courseIdParam, contactIdParam, handleValidationResult],
  async (req, res, next) => {
    try {
      const courseId = req.params.id;
      if (!(await requireInstructorOrAdmin(courseId, req.user.id))) {
        return res.status(403).json({ message: 'Instructor or admin access required' });
      }
      const contact = await CourseContact.findOne({
        where: { id: req.params.contactId, course_id: courseId },
      });
      if (!contact) {
        return res.status(404).json({ message: 'Contact not found' });
      }
      await contact.destroy();
      return res.json({ deleted: true });
    } catch (error) {
      return next(error);
    }
  }
);

export default router;
