export default function errorHandler(err, _req, res, _next) {
  console.error(err);

  if (err?.status) {
    return res.status(err.status).json({ message: err.message });
  }

  // a concurrent write won the unique key so the client should refresh
  if (err?.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({ message: 'conflict' });
  }

  if (err?.name === 'SequelizeValidationError') {
    return res.status(400).json({ message: 'validation error' });
  }

  return res.status(500).json({ message: 'internal server error' });
}
