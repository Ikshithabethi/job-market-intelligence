/**
 * Small validation helpers.
 *
 * Request bodies and query strings are untrusted, so every controller parses its
 * input through these helpers. They throw ApiError(400) with a readable message
 * instead of letting bad values reach SQL.
 */
const ApiError = require('../utils/ApiError');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Trim a value and treat empty strings as missing. */
function clean(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

/** Required non-empty string. */
function requireString(value, field, options = {}) {
  const text = clean(value);
  if (!text) throw ApiError.badRequest(`"${field}" is required`);
  if (options.min && text.length < options.min) {
    throw ApiError.badRequest(`"${field}" must be at least ${options.min} characters`);
  }
  if (options.max && text.length > options.max) {
    throw ApiError.badRequest(`"${field}" must be at most ${options.max} characters`);
  }
  return text;
}

/** Optional string, returns null when absent. */
function optionalString(value, field, options = {}) {
  const text = clean(value);
  if (!text) return null;
  if (options.max && text.length > options.max) {
    throw ApiError.badRequest(`"${field}" must be at most ${options.max} characters`);
  }
  return text;
}

function requireEmail(value) {
  const email = clean(value).toLowerCase();
  if (!email) throw ApiError.badRequest('"email" is required');
  if (!EMAIL_PATTERN.test(email)) {
    throw ApiError.badRequest('Please provide a valid email address');
  }
  return email;
}

/**
 * Password policy kept intentionally simple but non-trivial:
 * at least 8 characters, one letter and one number.
 */
function requirePassword(value, field = 'password') {
  const password = typeof value === 'string' ? value : '';
  if (!password) throw ApiError.badRequest(`"${field}" is required`);
  if (password.length < 8) {
    throw ApiError.badRequest(`"${field}" must be at least 8 characters long`);
  }
  if (password.length > 72) {
    // bcrypt only considers the first 72 bytes.
    throw ApiError.badRequest(`"${field}" must be at most 72 characters long`);
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw ApiError.badRequest(`"${field}" must contain at least one letter and one number`);
  }
  return password;
}

/** Parse an integer, optionally clamped to [min, max]. Returns fallback when absent. */
function toInt(value, field, options = {}) {
  if (value === undefined || value === null || clean(value) === '') {
    if (options.required) throw ApiError.badRequest(`"${field}" is required`);
    return options.default !== undefined ? options.default : null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw ApiError.badRequest(`"${field}" must be an integer`);
  }
  if (options.min !== undefined && parsed < options.min) {
    throw ApiError.badRequest(`"${field}" must be at least ${options.min}`);
  }
  if (options.max !== undefined && parsed > options.max) {
    throw ApiError.badRequest(`"${field}" must be at most ${options.max}`);
  }
  return parsed;
}

/** Parse a number (allows decimals). */
function toNumber(value, field, options = {}) {
  if (value === undefined || value === null || clean(value) === '') {
    if (options.required) throw ApiError.badRequest(`"${field}" is required`);
    return options.default !== undefined ? options.default : null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw ApiError.badRequest(`"${field}" must be a number`);
  }
  if (options.min !== undefined && parsed < options.min) {
    throw ApiError.badRequest(`"${field}" must be at least ${options.min}`);
  }
  if (options.max !== undefined && parsed > options.max) {
    throw ApiError.badRequest(`"${field}" must be at most ${options.max}`);
  }
  return parsed;
}

/**
 * Parse a positive integer id from a route parameter.
 * Rejects things like "1; DROP TABLE users".
 */
function requireId(value, field = 'id') {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw ApiError.badRequest(`"${field}" must be a positive integer`);
  }
  return parsed;
}

/** Parse "1,2,3" or ["1","2"] into an array of unique positive integers. */
function toIdList(value, field = 'ids') {
  if (value === undefined || value === null || clean(value) === '') return [];
  const parts = Array.isArray(value) ? value : String(value).split(',');
  const ids = [];
  parts.forEach((part) => {
    const text = clean(part);
    if (!text) return;
    const parsed = Number(text);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw ApiError.badRequest(`"${field}" contains an invalid id: ${text}`);
    }
    if (!ids.includes(parsed)) ids.push(parsed);
  });
  return ids;
}

/** Parse a comma separated list of strings ("SQL,Python") into a clean array. */
function toStringList(value) {
  if (value === undefined || value === null || clean(value) === '') return [];
  const parts = Array.isArray(value) ? value : String(value).split(',');
  const unique = [];
  parts.forEach((part) => {
    const text = clean(part);
    if (text && !unique.includes(text)) unique.push(text);
  });
  return unique;
}

/** Restrict a value to an allowed set (case-insensitive match, canonically cased). */
function toEnum(value, field, allowed, options = {}) {
  const text = clean(value);
  if (!text) {
    if (options.required) throw ApiError.badRequest(`"${field}" is required`);
    return options.default !== undefined ? options.default : null;
  }
  const match = allowed.find((item) => item.toLowerCase() === text.toLowerCase());
  if (!match) {
    throw ApiError.badRequest(
      `"${field}" must be one of: ${allowed.join(', ')}`
    );
  }
  return match;
}

/** Parse pagination query params with safe defaults. */
function toPagination(query = {}) {
  const page = toInt(query.page, 'page', { default: 1, min: 1, max: 100000 });
  const pageSize = toInt(query.pageSize, 'pageSize', { default: 20, min: 1, max: 100 });
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** Parse "asc"/"desc". */
function toSortDirection(value, fallback = 'desc') {
  const text = clean(value).toLowerCase();
  if (text === 'asc' || text === 'desc') return text;
  return fallback;
}

module.exports = {
  clean,
  requireString,
  optionalString,
  requireEmail,
  requirePassword,
  toInt,
  toNumber,
  requireId,
  toIdList,
  toStringList,
  toEnum,
  toPagination,
  toSortDirection,
};
