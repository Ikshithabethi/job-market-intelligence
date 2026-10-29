/**
 * Saved roadmap endpoints (all require authentication).
 */
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/respond');
const ApiError = require('../utils/ApiError');
const validate = require('../middleware/validate');
const roadmapService = require('../services/roadmapService');
const careerService = require('../services/careerService');
const userService = require('../services/userService');

/** GET /api/roadmaps */
const listRoadmaps = asyncHandler(async (req, res) => {
  const roadmaps = await roadmapService.listRoadmaps(req.user.id);
  return ok(res, roadmaps, { total: roadmaps.length });
});

/** GET /api/roadmaps/:id */
const getRoadmap = asyncHandler(async (req, res) => {
  const id = validate.requireId(req.params.id, 'id');
  const roadmap = await roadmapService.getRoadmap(req.user.id, id);
  return ok(res, roadmap);
});

/**
 * POST /api/roadmaps
 * Two ways to save:
 *   1. send the computed career payload (path + missingSkills + roadmap), or
 *   2. send just { fromRoleId, toRoleId } and the server recomputes it using the
 *      skills saved on the profile.
 */
const saveRoadmap = asyncHandler(async (req, res) => {
  const body = req.body || {};

  if (Array.isArray(body.path) && Array.isArray(body.roadmap)) {
    const fromRoleTitle = validate.requireString(body.fromRoleTitle, 'fromRoleTitle', { max: 120 });
    const toRoleTitle = validate.requireString(body.toRoleTitle, 'toRoleTitle', { max: 120 });

    const saved = await roadmapService.saveRoadmap(req.user.id, {
      fromRoleId: validate.toInt(body.fromRoleId, 'fromRoleId', { min: 1 }),
      toRoleId: validate.toInt(body.toRoleId, 'toRoleId', { min: 1 }),
      fromRoleTitle,
      toRoleTitle,
      hops: validate.toInt(body.hops, 'hops', { default: 0, min: 0, max: 20 }),
      totalYears: validate.toNumber(body.totalYears, 'totalYears', { min: 0 }),
      path: body.path,
      missingSkills: Array.isArray(body.missingSkills) ? body.missingSkills : [],
      roadmap: body.roadmap,
    });
    return created(res, saved, { message: 'Roadmap saved to your profile' });
  }

  const fromRoleId = validate.requireId(body.fromRoleId, 'fromRoleId');
  const toRoleId = validate.requireId(body.toRoleId, 'toRoleId');
  const currentSkills = await userService.getUserSkillNames(req.user.id);

  const computed = await careerService.findCareerPath({ fromRoleId, toRoleId, currentSkills });
  if (computed.notFound || !computed.reachable) {
    throw ApiError.badRequest(
      computed.message || 'That career path cannot be computed from the current dataset'
    );
  }

  const saved = await roadmapService.saveRoadmap(req.user.id, {
    fromRoleId,
    toRoleId,
    fromRoleTitle: computed.fromRole.title,
    toRoleTitle: computed.toRole.title,
    hops: computed.hops,
    totalYears: computed.totalYears,
    path: computed.path,
    missingSkills: computed.targetRoleGap.missingSkills,
    roadmap: computed.roadmap,
  });

  return created(res, saved, { message: 'Roadmap computed and saved to your profile' });
});

/** DELETE /api/roadmaps/:id */
const deleteRoadmap = asyncHandler(async (req, res) => {
  const id = validate.requireId(req.params.id, 'id');
  const result = await roadmapService.deleteRoadmap(req.user.id, id);
  return ok(res, result);
});

module.exports = { listRoadmaps, getRoadmap, saveRoadmap, deleteRoadmap };
