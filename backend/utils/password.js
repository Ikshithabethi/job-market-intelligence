/**
 * Password hashing helpers. Passwords are never stored or logged in plain text.
 */
const bcrypt = require('bcryptjs');
const config = require('../config/env');

async function hashPassword(plainPassword) {
  const salt = await bcrypt.genSalt(config.bcryptRounds);
  return bcrypt.hash(plainPassword, salt);
}

async function verifyPassword(plainPassword, passwordHash) {
  if (!passwordHash) return false;
  return bcrypt.compare(plainPassword, passwordHash);
}

/**
 * JSON Web Token helpers (HS256 with the secret from .env).
 */
module.exports = { hashPassword, verifyPassword };
