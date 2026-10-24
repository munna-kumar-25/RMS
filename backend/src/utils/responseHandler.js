/**
 * Standardized API Response Handlers
 */

const codeForStatus = (statusCode) => {
  if (statusCode === 400) return 'INVALID_INPUT';
  if (statusCode === 401) return 'UNAUTHORIZED';
  if (statusCode === 403) return 'FORBIDDEN';
  if (statusCode === 404) return 'NOT_FOUND';
  if (statusCode === 409) return 'CONFLICT';
  if (statusCode === 429) return 'RATE_LIMITED';
  if (statusCode === 503) return 'SERVICE_UNAVAILABLE';
  if (statusCode >= 500) return 'INTERNAL_ERROR';
  return 'REQUEST_FAILED';
};

export const sendSuccess = (res, data = null, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    requestId: res.req?.id,
  });
};

export const sendError = (res, message = 'Internal Server Error', statusCode = 500, errors = null) => {
  const safeMessage = process.env.NODE_ENV === 'production' && statusCode >= 500
    ? 'Internal server error'
    : message;

  const payload = {
    success: false,
    message: safeMessage,
    error: {
      code: codeForStatus(statusCode),
      message: safeMessage,
    },
    requestId: res.req?.id,
  };

  if (errors !== null && errors !== undefined) {
    payload.errors = errors;
  }

  return res.status(statusCode).json(payload);
};

export default {
  sendSuccess,
  sendError,
};
