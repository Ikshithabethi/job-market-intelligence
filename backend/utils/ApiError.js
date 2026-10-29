/**
 * Error type used across the API.
 *
 * Every expected failure (validation, auth, not found, conflict) is thrown as an
 * ApiError so the error handler can translate it into a consistent JSON shape
 * with a correct HTTP status code.
 */
class ApiError extends Error {
  constructor(statusCode, message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = options.code || defaultCode(statusCode);
    this.details = options.details || null;
    Error.captureStackTrace(this, ApiError);
  }

  static badRequest(message, details) {
    return new ApiError(400, message, { details, code: 'BAD_REQUEST' });
  }

  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message, { code: 'UNAUTHORIZED' });
  }

  static forbidden(message = 'You do not have access to this resource') {
    return new ApiError(403, message, { code: 'FORBIDDEN' });
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message, { code: 'NOT_FOUND' });
  }

  static conflict(message, details) {
    return new ApiError(409, message, { details, code: 'CONFLICT' });
  }

  static serviceUnavailable(message, details) {
    return new ApiError(503, message, { details, code: 'SERVICE_UNAVAILABLE' });
  }
}

function defaultCode(statusCode) {
  switch (statusCode) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 503:
      return 'SERVICE_UNAVAILABLE';
    default:
      return 'INTERNAL_ERROR';
  }
}

module.exports = ApiError;
