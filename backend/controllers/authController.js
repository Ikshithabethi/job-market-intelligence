/**
 * Authentication endpoints: register, login, logout and "who am I".
 */
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/respond');
const validate = require('../middleware/validate');
const authService = require('../services/authService');

const register = asyncHandler(async (req, res) => {
  const fullName = validate.requireString(req.body.fullName, 'fullName', { min: 2, max: 120 });
  const email = validate.requireEmail(req.body.email);
  const password = validate.requirePassword(req.body.password);

  const currentRoleId = validate.toInt(req.body.currentRoleId, 'currentRoleId', { min: 1 });
  const targetRoleId = validate.toInt(req.body.targetRoleId, 'targetRoleId', { min: 1 });

  const result = await authService.register({
    fullName,
    email,
    password,
    currentRoleId,
    targetRoleId,
  });

  return created(res, {
    user: result.user,
    token: result.token,
    message: 'Account created successfully',
  });
});

const login = asyncHandler(async (req, res) => {
  const email = validate.requireEmail(req.body.email);
  const password = validate.requireString(req.body.password, 'password', { min: 1, max: 72 });

  const result = await authService.login({ email, password });
  return ok(res, {
    user: result.user,
    token: result.token,
    message: 'Logged in successfully',
  });
});

/**
 * The API is stateless, so logout only tells the client to discard its token.
 * Keeping the endpoint makes the intent explicit and gives the frontend a
 * single place to clear its session.
 */
const logout = asyncHandler(async (req, res) =>
  ok(res, { message: 'Logged out. Remove the stored token on the client.' })
);

const me = asyncHandler(async (req, res) => {
  const user = await authService.getCurrentUser(req.user.id);
  return ok(res, { user });
});

module.exports = { register, login, logout, me };
