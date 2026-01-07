export default function errorHandler(err, _req, res, _next) {
  console.error(err);

  if (err?.name === 'SequelizeValidationError') {
    return res.status(400).json({ message: 'validation error' });
  }

  return res.status(500).json({ message: 'internal server error' });
}
