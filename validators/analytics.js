import { query } from 'express-validator';

export const courseIdParam = query('courseId')
  .isInt({ gt: 0 })
  .toInt()
  .withMessage('courseId must be a positive integer');

export const courseIdOptionalParam = query('courseId')
  .optional()
  .isInt({ gt: 0 })
  .toInt()
  .withMessage('courseId must be a positive integer');

export const userIdParam = query('userId')
  .isInt({ gt: 0 })
  .toInt()
  .withMessage('userId must be a positive integer');

export const dropLowestNParam = query('dropLowestN')
  .optional()
  .isInt({ min: 0 })
  .toInt()
  .withMessage('dropLowestN must be a non-negative integer');
