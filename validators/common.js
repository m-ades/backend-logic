import { body, param, query } from 'express-validator';

export const courseIdParam = param('id')
  .isInt({ gt: 0 })
  .toInt()
  .withMessage('courseId must be a positive integer');

export const assignmentIdParam = param('id')
  .isInt({ gt: 0 })
  .toInt()
  .withMessage('assignmentId must be a positive integer');

export const userIdParam = param('id')
  .isInt({ gt: 0 })
  .toInt()
  .withMessage('userId must be a positive integer');

export const userIdQuery = query('userId')
  .isInt({ gt: 0 })
  .toInt()
  .withMessage('userId must be a positive integer');

export const userIdOptionalQuery = query('userId')
  .optional()
  .isInt({ gt: 0 })
  .toInt()
  .withMessage('userId must be a positive integer');

export const assignmentIdQuery = query('assignmentId')
  .isInt({ gt: 0 })
  .toInt()
  .withMessage('assignmentId must be a positive integer');

export const assignmentIdBody = body('assignment_id')
  .isInt({ gt: 0 })
  .toInt()
  .withMessage('assignment_id must be a positive integer');

export const assignmentQuestionIdBody = body('assignment_question_id')
  .isInt({ gt: 0 })
  .toInt()
  .withMessage('assignment_question_id must be a positive integer');

export const userIdBody = body('user_id')
  .isInt({ gt: 0 })
  .toInt()
  .withMessage('user_id must be a positive integer');
