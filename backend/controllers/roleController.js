/**
 * Job role endpoints, including side-by-side comparison.
 */
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/respond');
const ApiError = require('../utils/ApiError');
const validate = require('../middleware/validate');
const roleService = require('../services/roleService');
const { SENIORITY_LEVELS } = require('../config/analytics');

/** GET /api/roles */
const listRoles = asyncHandler(async (req, res) => {
  const roles = await roleService.listRoles({
    q: validate.optionalString(req.query.q, 'q', { max: 120 }),
    family: validate.optionalString(req.query.family, 'family', { max: 80 }),
    seniority: validate.toEnum(req.query.seniority, 'seniority', SENIORITY_LEVELS),
    limit: validate.toInt(req.query.limit, 'limit', { min: 1, max: 200 }),
  });
  return ok(res, roles, { total: roles.length });
});

/** GET /api/roles/families */
const getFamilies = asyncHandler(async (req, res) => {
  const families = await roleService.getFamilies();
  return ok(res, families);
});

/**
 * GET /api/roles/compare?roles=1,2,3
 * Declared before /:id so the literal path wins.
 */
const compareRoles = asyncHandler(async (req, res) => {
  const roleIds = validate.toIdList(req.query.roles || req.query.ids, 'roles');
  if (roleIds.length < 2) {
    throw ApiError.badRequest('Provide at least two role ids, for example ?roles=1,2');
  }
  if (roleIds.length > 5) {
    throw ApiError.badRequest('You can compare at most 5 roles at once');
  }

  const comparison = await roleService.compareRoles(roleIds);
  if (!comparison || comparison.roles.length < 2) {
    throw ApiError.badRequest('None of the requested roles exist. Check the "roles" parameter.');
  }
  return ok(res, comparison);
});

/** GET /api/roles/:id */
const getRoleById = asyncHandler(async (req, res) => {
  const id = validate.requireId(req.params.id, 'id');
  const detail = await roleService.getRoleById(id);
  if (!detail) throw ApiError.notFound('Job role not found');
  return ok(res, detail);
});

module.exports = { listRoles, getFamilies, compareRoles, getRoleById };
