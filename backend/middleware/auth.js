/**
 * Authentication middleware.
 *
 * The API is stateless: the client sends "Authorization: Bearer <token>" and we
 * verify the JWT signature, then attach the decoded user to req.user.
 *
 *   requireAuth  - rejects the request with 401 when no valid token is present
 *   optionalAuth - attaches req.user when a token is present, otherwise continues
 */
const ApiError = require('../utils/ApiError');
const { extractBearerToken, verifyToken } = require('../utils/jwt');

function resolveUser(req) {
  const token = extractBearerToken(req);
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload || !payload.sub) {
    throw ApiError.unauthorized('Invalid authentication token');
  }
  return {
    id: Number(payload.sub),
    email: payload.email || null,
  };
}

function requireAuth(req, res, next) {
  try {
    const user = resolveUser(req);
    if (!user) {
      throw ApiError.unauthorized('Authentication required');
    }
    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

function optionalAuth(req, res, next) {
  try {
    req.user = resolveUser(req);
    return next();
  } catch (error) {
    // A malformed token on an optional route just means "anonymous".
    req.user = null;
    return next();
  }
}

module.exports = { requireAuth, optionalAuth };
