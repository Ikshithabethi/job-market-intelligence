/**
 * Skill recommendation endpoints.
 */
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/respond');
const ApiError = require('../utils/ApiError');
const validate = require('../middleware/validate');
const recommendationService = require('../services/recommendationService');
const userService = require('../services/userService');

/**
 * POST /api/recommendations/skills
 * Body: { targetRoleId, currentSkills?: string[] | "SQL,Python", limit? }
 * Falls back to the logged in user's saved skills and target role.
 */
const recommendSkills = asyncHandler(async (req, res) => {
  let targetRoleId = validate.toInt(req.body.targetRoleId, 'targetRoleId', { min: 1 });
  let currentSkills = validate.toStringList(req.body.currentSkills || req.body.skills);
  let skillsSource = 'request';

  if (req.user) {
    if (currentSkills.length === 0) {
      currentSkills = await userService.getUserSkillNames(req.user.id);
      skillsSource = 'profile';
    }
    if (!targetRoleId) {
      const user = await userService.getProfile(req.user.id);
      targetRoleId = user.user.target_role_id;
      if (!targetRoleId) {
        throw ApiError.badRequest(
          'No target role given. Send "targetRoleId" in the body or set a target role on your profile.'
        );
      }
    }
  }

  if (!targetRoleId) {
    throw ApiError.badRequest('"targetRoleId" is required');
  }

  const limit = validate.toInt(req.body.limit, 'limit', { default: 10, min: 1, max: 40 });
  const result = await recommendationService.recommendSkills({
    targetRoleId,
    currentSkills,
    limit,
  });

  if (result.notFound) {
    throw ApiError.notFound(`Target role ${targetRoleId} was not found`);
  }

  return ok(res, { ...result, skillsSource, providedSkills: currentSkills });
});

/**
 * POST /api/recommendations/roles
 * Body: { currentSkills?: string[], limit?, excludeRoleId? }
 */
const recommendRoles = asyncHandler(async (req, res) => {
  let currentSkills = validate.toStringList(req.body.currentSkills || req.body.skills);
  if (currentSkills.length === 0 && req.user) {
    currentSkills = await userService.getUserSkillNames(req.user.id);
  }

  const result = await recommendationService.recommendRoles({
    currentSkills,
    limit: validate.toInt(req.body.limit, 'limit', { default: 8, min: 1, max: 30 }),
    excludeRoleId: validate.toInt(req.body.excludeRoleId, 'excludeRoleId', { min: 1 }),
  });

  return ok(res, result);
});

/** GET /api/recommendations/popular-skills */
const popularSkills = asyncHandler(async (req, res) => {
  const limit = validate.toInt(req.query.limit, 'limit', { default: 15, min: 1, max: 50 });
  const rows = await recommendationService.getPopularSkills(limit);
  return ok(res, rows);
});

module.exports = { recommendSkills, recommendRoles, popularSkills };
