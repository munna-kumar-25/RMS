const statusCodeFor = (error) => {
  if (error.name === 'CastError' || error.name === 'ValidationError' || error.code === 11000) return 400;
  if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') return 401;
  return error.statusCode || error.status || 500;
};

const publicMessage = (error, statusCode) => {
  const isProduction = process.env.NODE_ENV === 'production';
  if (statusCode >= 500 && isProduction) return 'Internal server error';
  if (error.name === 'CastError') return 'Invalid resource identifier.';
  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern || {})[0] || 'field';
    return `Duplicate value entered for unique property '${field}'.`;
  }
  if (error.name === 'ValidationError') return 'Database validation error occurred.';
  if (error.name === 'JsonWebTokenError') return 'Invalid authentication token.';
  if (error.name === 'TokenExpiredError') return 'Authentication token has expired.';
  if (error.type === 'entity.parse.failed' || (error instanceof SyntaxError && error.status === 400)) {
    return 'Request body contains invalid JSON';
  }
  if (error.type === 'entity.too.large') return 'Request body is too large';
  return error.message || 'Internal server error';
};

const errorCodeFor = (error, statusCode) => {
  if (typeof error.code === 'string' && error.code.length > 0 && error.code !== '11000') return error.code;
  if (error.type === 'entity.parse.failed' || error.name === 'ValidationError' || error.name === 'CastError' || error.code === 11000) {
    return 'INVALID_INPUT';
  }
  if (error.type === 'entity.too.large') return 'PAYLOAD_TOO_LARGE';
  if (statusCode === 401) return 'UNAUTHORIZED';
  if (statusCode === 403) return 'FORBIDDEN';
  if (statusCode === 404) return 'NOT_FOUND';
  if (statusCode === 503) return 'SERVICE_UNAVAILABLE';
  if (statusCode >= 500) return 'INTERNAL_ERROR';
  return 'INVALID_INPUT';
};

export const errorHandler = (error, req, res, next) => {
  if (res.headersSent) return next(error);

  const statusCode = error.type === 'entity.parse.failed'
    ? 400
    : error.type === 'entity.too.large'
      ? 413
      : statusCodeFor(error);
  const message = publicMessage(error, statusCode);
  const requestId = req.id;

  console.error(`[${requestId || 'no-request-id'}] ${error.name || 'Error'}: ${message}`);

  const payload = {
    success: false,
    message,
    error: {
      code: errorCodeFor(error, statusCode),
      message,
    },
    requestId,
  };

  if (error.name === 'ValidationError') {
    payload.errors = Object.values(error.errors).map((item) => item.message);
  }

  return res.status(statusCode).json(payload);
};

export default errorHandler;
