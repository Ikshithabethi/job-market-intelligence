/**
 * Career path analytics endpoints.
 */
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/respond');
const ApiError = require('../utils/ApiError');
const validate = require('../middleware/validate');
const careerService = require('../services/careerService');
const userService = require('../services/userService');

/** GET /api/career/options */
const getOptions = asyncHandler(async (req, res) => {
  const options = await careerService.getOptions();
  return ok(res, options);
});

/** GET /api/career/map - role level graph for the career map panel. */
const getCareerMap = asyncHandler(async (req, res) => {
  const map = await careerService.getCareerMap();
  return ok(res, map);
});

/**
 * POST /api/career/path
 * Body: { fromRoleId, toRoleId, currentSkills?: string[] | "SQL,Python" }
 *
 * When the caller is logged in and does not send currentSkills, the skills saved
 * on their profile are used instead.
 */
const findPath = asyncHandler(async (req, res) => {
  const fromRoleId = validate.requireId(req.body.fromRoleId, 'fromRoleId');
  const toRoleId = validate.requireId(req.body.toRoleId, 'toRoleId');

  let currentSkills = validate.toStringList(req.body.currentSkills || req.body.skills);
  let skillsSource = 'request';

  if (currentSkills.length === 0 && req.user) {
    currentSkills = await userService.getUserSkillNames(req.user.id);
    skillsSource = 'profile';
  }

  const result = await careerService.findCareerPath({ fromRoleId, toRoleId, currentSkills });

  if (result.notFound) {
    const label = result.notFound === 'fromRole' ? 'Current role' : 'Target role';
    const id = result.notFound === 'fromRole' ? fromRoleId : toRoleId;
    throw ApiError.notFound(`${label} ${id} was not found`);
  }

  return ok(res, { ...result, skillsSource, providedSkills: currentSkills });
});

module.exports = { getOptions, getCareerMap, findPath };
