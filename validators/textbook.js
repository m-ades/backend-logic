import { body } from 'express-validator';

const STRUCTURE_KINDS = new Set([
  'cover',
  'preface',
  'part',
  'chapter',
  'appendix',
  'backmatter',
]);

export const textbookStructureBody = [
  body('nodes')
    .isArray()
    .withMessage('nodes must be an array'),
  body('nodes.*.id')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('each node requires an id'),
  body('nodes.*.slug')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('each node requires a slug'),
  body('nodes.*.file')
    .optional({ nullable: true })
    .isString()
    .withMessage('file must be a string'),
  body('nodes.*.kind')
    .isString()
    .custom((value) => STRUCTURE_KINDS.has(value))
    .withMessage(`kind must be one of: ${[...STRUCTURE_KINDS].join(', ')}`),
  body('nodes.*.displayTitle')
    .isString()
    .withMessage('displayTitle must be a string'),
  body('nodes.*.parentId')
    .optional({ nullable: true })
    .custom((value) => value === null || typeof value === 'string')
    .withMessage('parentId must be a string or null'),
  body('nodes.*.sortIndex')
    .isInt()
    .toInt()
    .withMessage('sortIndex must be an integer'),
  body('nodes.*.hidden')
    .optional()
    .isBoolean()
    .toBoolean()
    .withMessage('hidden must be a boolean'),
  body('nodes.*.navigable')
    .optional()
    .isBoolean()
    .toBoolean()
    .withMessage('navigable must be a boolean'),
];

export const textbookPracticeLinksBody = [
  body('links')
    .isArray()
    .withMessage('links must be an array'),
  body('links.*.id')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('each link requires an id'),
  body('links.*.textbookSlug')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('each link requires textbookSlug'),
  body('links.*.sectionId')
    .optional({ nullable: true })
    .custom((value) => value === null || typeof value === 'string')
    .withMessage('sectionId must be a string or null'),
  body('links.*.practiceId')
    .optional({ nullable: true })
    .custom((value) => value === null || typeof value === 'string' || typeof value === 'number')
    .withMessage('practiceId must be a string, number, or null'),
  body('links.*.label')
    .optional({ nullable: true })
    .custom((value) => value === null || typeof value === 'string')
    .withMessage('label must be a string or null'),
  body('links.*.match')
    .optional({ nullable: true })
    .custom((value) => value === null || (typeof value === 'object' && !Array.isArray(value)))
    .withMessage('match must be an object or null'),
];
