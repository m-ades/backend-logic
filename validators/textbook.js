import { body } from 'express-validator';

/*
purpose the app fetches this URL and renders what comes back, so the origin is
allowlisted here as well as in the client
contract https only; github pages, jsdelivr, or a host named in TEXTBOOK_ALLOWED_HOSTS
*/
const ALLOWED_HOSTS = new Set(['cdn.jsdelivr.net']);
const ALLOWED_HOST_SUFFIXES = ['.github.io'];

function extraAllowedHosts() {
  return String(process.env.TEXTBOOK_ALLOWED_HOSTS || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedTextbookBaseUrl(raw) {
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.search || url.hash) return false;
  if (url.pathname.endsWith('/') && url.pathname !== '/') return false;

  const host = url.hostname.toLowerCase();
  if (ALLOWED_HOSTS.has(host) || extraAllowedHosts().includes(host)) return true;
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

export const textbookSourceBody = [
  body('updatedAt')
    .optional({ nullable: true })
    .isISO8601({ strict: true })
    .withMessage('updatedAt must be an ISO 8601 timestamp or null'),
  body('baseUrl')
    .isString()
    .trim()
    .custom(isAllowedTextbookBaseUrl)
    .withMessage(
      'baseUrl must be an https URL on github.io, cdn.jsdelivr.net, or an allowlisted host, with no query, fragment or trailing slash'
    ),
];

const STRUCTURE_KINDS = new Set([
  'cover',
  'preface',
  'part',
  'chapter',
  'appendix',
  'backmatter',
]);

export const textbookStructureBody = [
  body('updatedAt')
    .optional({ nullable: true })
    .isISO8601({ strict: true })
    .withMessage('updatedAt must be an ISO 8601 timestamp or null'),
  body('nodes')
    .isArray()
    .withMessage('nodes must be an array'),
  body('nodes.*.id')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('each node requires an id'),
  // Identity is the catalog key; the slug is only where the HTML lives, and it
  // moves whenever BookML renumbers its output.
  body('nodes.*.key')
    .optional({ nullable: true })
    .custom((value) => value === null || (typeof value === 'string' && value.trim() !== ''))
    .withMessage('key must be a non-empty string or null'),
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
  body('updatedAt')
    .optional({ nullable: true })
    .isISO8601({ strict: true })
    .withMessage('updatedAt must be an ISO 8601 timestamp or null'),
  body('links')
    .isArray()
    .withMessage('links must be an array'),
  body('links.*.id')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('each link requires an id'),
  body('links.*.textbookKey')
    .optional({ nullable: true })
    .custom((value) => value === null || (typeof value === 'string' && value.trim() !== ''))
    .withMessage('textbookKey must be a non-empty string or null'),
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
