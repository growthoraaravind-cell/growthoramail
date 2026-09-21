const errorHandler = (err, req, res, next) => {
  console.error(`[ERROR] ${err.message}`, {
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.url,
    method: req.method,
  });

  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({ success: false, message: errors.join(', '), errorCode: 'VALIDATION_ERROR' });
  }

  if (err.code === 11000) {
    return res.status(400).json({ success: false, message: 'Duplicate entry', errorCode: 'DUPLICATE_ERROR' });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'Invalid ID format', errorCode: 'INVALID_ID' });
  }

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal server error',
    errorCode: err.errorCode || 'INTERNAL_ERROR',
  });
};

class AppError extends Error {
  constructor(message, statusCode, errorCode) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

module.exports = { errorHandler, AppError };
