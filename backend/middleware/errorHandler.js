/**
 * Central error handling.
 *
 * Every failure ends up as JSON: { success:false, error:{ message, code, details } }
 * so the React client only ever has to read one shape.
 */
const config = require('../config/env');
const ApiError = require('../utils/ApiError');

/** 404 handler mounted after all routes. */
function notFound(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

/**
 * Translate mysql2 driver errors into meaningful HTTP responses instead of
 * leaking SQL text to the client.
 */
function translateDatabaseError(error) {
  switch (error.code) {
    case 'ER_DUP_ENTRY':
      return ApiError.conflict('That record already exists', { sqlMessage: error.sqlMessage });
    case 'ER_NO_REFERENCED_ROW':
    case 'ER_NO_REFERENCED_ROW_2':
      return ApiError.badRequest('A referenced record does not exist', {
        sqlMessage: error.sqlMessage,
      });
    case 'ER_ROW_IS_REFERENCED':
    case 'ER_ROW_IS_REFERENCED_2':
      return ApiError.conflict('This record is still referenced by other data');
    case 'ER_BAD_FIELD_ERROR':
    case 'ER_PARSE_ERROR':
      return new ApiError(500, 'Database query error', { code: 'DB_QUERY_ERROR' });
    case 'ER_ACCESS_DENIED_ERROR':
    case 'ER_BAD_DB_ERROR':
    case 'ECONNREFUSED':
    case 'PROTOCOL_CONNECTION_LOST':
      return ApiError.serviceUnavailable(
        'Cannot reach the MySQL database. Check that it is running and that backend/.env is correct.'
      );
    default:
      return null;
  }
}

function errorHandler(error, req, res, next) {
  // eslint-disable-next-line no-unused-vars
  let apiError = error instanceof ApiError ? error : null;

  if (!apiError && error && error.code) {
    apiError = translateDatabaseError(error);
  }

  if (!apiError && error instanceof SyntaxError && 'body' in error) {
    apiError = ApiError.badRequest('Request body is not valid JSON');
  }

  if (!apiError) {
    apiError = new ApiError(error.statusCode || 500, error.message || 'Internal server error', {
      code: 'INTERNAL_ERROR',
    });
    // Unknown failures are logged with the stack so they can be debugged.
    if (!config.isProduction) {
      // eslint-disable-next-line no-console
      console.error('[error]', error);
    }
  }

  if (res.headersSent) return next(error);

  const payload = {
    success: false,
    error: {
      message: apiError.message,
      code: apiError.code,
    },
  };
  if (apiError.details) payload.error.details = apiError.details;
  if (!config.isProduction && apiError.stack) payload.error.stack = apiError.stack;

  return res.status(apiError.statusCode || 500).json(payload);
}

module.exports = { notFound, errorHandler };
