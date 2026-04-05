const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function normalizeOrigin(origin) {
  return typeof origin === 'string' ? origin.trim().replace(/\/$/, '') : '';
}

function parseAllowedOrigins(rawOrigins) {
  return String(rawOrigins || '')
    .split(',')
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);
}

function getRequestOrigin(req) {
  const originHeader = normalizeOrigin(req.get('origin'));
  if (originHeader) {
    return originHeader;
  }

  const refererHeader = req.get('referer');
  if (!refererHeader) {
    return '';
  }

  try {
    // fall back to referer when origin is missing
    return normalizeOrigin(new URL(refererHeader).origin);
  } catch {
    return '';
  }
}

export function createCsrfProtection(allowedOrigins) {
  const normalizedAllowedOrigins = allowedOrigins.map((origin) => normalizeOrigin(origin));

  return function csrfProtection(req, res, next) {
    if (SAFE_METHODS.has(req.method)) {
      return next();
    }

    // block unsafe requests unless they come from a trusted origin
    const requestOrigin = getRequestOrigin(req);
    if (requestOrigin && normalizedAllowedOrigins.includes(requestOrigin)) {
      return next();
    }

    return res.status(403).json({ message: 'Invalid request origin' });
  };
}

export { getRequestOrigin, parseAllowedOrigins };
