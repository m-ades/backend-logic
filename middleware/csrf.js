const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function addHunterLogicDomainVariants(origin) {
  if (!origin) return [];

  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();
    if (hostname !== 'hunterlogic.org' && hostname !== 'www.hunterlogic.org') {
      return [];
    }

    const counterpartHostname = hostname === 'hunterlogic.org'
      ? 'www.hunterlogic.org'
      : 'hunterlogic.org';
    const counterpartUrl = new URL(origin);
    counterpartUrl.hostname = counterpartHostname;
    return [counterpartUrl.origin];
  } catch {
    return [];
  }
}

function normalizeOrigin(origin) {
  return typeof origin === 'string' ? origin.trim().replace(/\/$/, '') : '';
}

function parseAllowedOrigins(rawOrigins) {
  const origins = String(rawOrigins || '')
    .split(',')
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);

  const expandedOrigins = origins.flatMap((origin) => [origin, ...addHunterLogicDomainVariants(origin)]);
  return [...new Set(expandedOrigins)];
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
