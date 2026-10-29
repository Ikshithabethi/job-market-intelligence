/**
 * JWT signing and verification.
 */
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const ApiError = require('./ApiError');

/**
 * @param {{id:number,email:string}} user
 * @returns {string} signed token
 */
function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

/**
 * Verifies a token and returns its payload. Throws ApiError(401) when invalid.
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Session expired, please log in again');
    }
    throw ApiError.unauthorized('Invalid authentication token');
  }
}

/**
 * Extracts a bearer token from the Authorization header, if present.
 */
function extractBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  if (!token || scheme.toLowerCase() !== 'bearer') return null;
  return token.trim();
}

module.exports = { signToken, verifyToken, extractBearerToken };
