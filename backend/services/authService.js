/**
 * Account creation and login.
 *
 * Passwords are hashed with bcrypt before they touch the database, and the hash
 * is never included in an API response.
 */
const { query, queryOne } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { hashPassword, verifyPassword } = require('../utils/password');
const { signToken } = require('../utils/jwt');

/** Remove the password hash before a user object is returned or logged. */
function sanitizeUser(user) {
  if (!user) return null;
  const { password_hash: _ignored, ...rest } = user;
  return rest;
}

const USER_SELECT = `
  SELECT u.id,
          u.full_name,
          u.email,
          u.location,
          u.experience_years,
          u.current_role_id,
          u.target_role_id,
          u.created_at,
          u.updated_at,
          cr.title AS current_role_title,
          tr.title AS target_role_title
     FROM users u
     LEFT JOIN job_roles cr ON cr.id = u.current_role_id
     LEFT JOIN job_roles tr ON tr.id = u.target_role_id`;

async function findUserWithPasswordByEmail(email) {
  return queryOne('SELECT * FROM users WHERE email = ?', [email]);
}

async function findUserWithPasswordById(id) {
  return queryOne('SELECT * FROM users WHERE id = ?', [id]);
}

/** Public user shape plus the linked role titles. */
async function getPublicUserById(id) {
  return queryOne(`${USER_SELECT} WHERE u.id = ?`, [id]);
}

/**
 * Register a new account.
 * @returns {{user:Object, token:string}}
 */
async function register({ fullName, email, password, currentRoleId, targetRoleId }) {
  const existing = await findUserWithPasswordByEmail(email);
  if (existing) {
    throw ApiError.conflict('An account with that email already exists');
  }

  const passwordHash = await hashPassword(password);

  const result = await query(
    `INSERT INTO users (full_name, email, password_hash, current_role_id, target_role_id)
     VALUES (?, ?, ?, ?, ?)`,
    [fullName, email, passwordHash, currentRoleId || null, targetRoleId || null]
  );

  const user = await getPublicUserById(result.insertId);
  return { user: sanitizeUser(user), token: signToken({ id: user.id, email: user.email }) };
}

/**
 * Verify credentials and issue a token.
 * The same generic message is used for "unknown email" and "wrong password" so
 * the endpoint does not reveal which accounts exist.
 */
async function login({ email, password }) {
  const record = await findUserWithPasswordByEmail(email);
  const invalid = ApiError.unauthorized('Incorrect email or password');
  if (!record) throw invalid;

  const matches = await verifyPassword(password, record.password_hash);
  if (!matches) throw invalid;

  const user = await getPublicUserById(record.id);
  return { user: sanitizeUser(user), token: signToken({ id: user.id, email: user.email }) };
}

/** Current user for GET /api/auth/me. Throws 401 when the account was deleted. */
async function getCurrentUser(id) {
  const user = await getPublicUserById(id);
  if (!user) {
    const exists = await findUserWithPasswordById(id);
    if (!exists) throw ApiError.unauthorized('This account no longer exists');
    throw ApiError.notFound('User not found');
  }
  return user;
}

/** True when the account still exists (used by the auth guard). */
async function userExists(id) {
  const row = await queryOne('SELECT id FROM users WHERE id = ?', [id]);
  return Boolean(row);
}

module.exports = {
  sanitizeUser,
  register,
  login,
  getCurrentUser,
  userExists,
  USER_SELECT,
};
