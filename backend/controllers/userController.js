/**
 * Profile and saved-skill endpoints (all require authentication).
 */
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/respond');
const validate = require('../middleware/validate');
const userService = require('../services/userService');
const { PROFICIENCY_LEVELS } = require('../config/analytics');

/** GET /api/users/profile */
const getProfile = asyncHandler(async (req, res) => {
  const profile = await userService.getProfile(req.user.id);
  return ok(res, profile);
});

/** PUT /api/users/profile */
const updateProfile = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const updates = {};

  if (body.fullName !== undefined) {
    updates.fullName = validate.requireString(body.fullName, 'fullName', { min: 2, max: 120 });
  }
  if (body.location !== undefined) {
    updates.location = validate.optionalString(body.location, 'location', { max: 120 });
  }
  if (body.experienceYears !== undefined) {
    updates.experienceYears = validate.toNumber(body.experienceYears, 'experienceYears', {
      min: 0,
      max: 50,
    });
  }
  if (body.currentRoleId !== undefined) {
    updates.currentRoleId = validate.toInt(body.currentRoleId, 'currentRoleId', { min: 1 });
  }
  if (body.targetRoleId !== undefined) {
    updates.targetRoleId = validate.toInt(body.targetRoleId, 'targetRoleId', { min: 1 });
  }

  await userService.updateProfile(req.user.id, updates);
  const profile = await userService.getProfile(req.user.id);
  return ok(res, profile, { message: 'Profile updated' });
});

/** GET /api/users/skills */
const listSkills = asyncHandler(async (req, res) => {
  const skills = await userService.listUserSkills(req.user.id);
  return ok(res, skills, { total: skills.length });
});

/** POST /api/users/skills */
const addSkill = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const skillId = validate.toInt(body.skillId, 'skillId', { min: 1 });
  const skillName = validate.optionalString(body.skillName, 'skillName', { max: 120 });
  const proficiency = validate.toEnum(body.proficiency, 'proficiency', PROFICIENCY_LEVELS, {
    default: 'beginner',
  });

  if (!skillId && !skillName) {
    return res.status(400).json({
      success: false,
      error: { message: 'Provide either "skillId" or "skillName"', code: 'BAD_REQUEST' },
    });
  }

  const skills = await userService.addUserSkill(req.user.id, { skillId, skillName, proficiency });
  return created(res, skills, { message: 'Skill saved' });
});

/** PUT /api/users/skills/:id */
const updateSkill = asyncHandler(async (req, res) => {
  const id = validate.requireId(req.params.id, 'id');
  const proficiency = validate.toEnum(req.body.proficiency, 'proficiency', PROFICIENCY_LEVELS, {
    required: true,
  });
  const skills = await userService.updateUserSkill(req.user.id, id, { proficiency });
  return ok(res, skills, { message: 'Skill updated' });
});

/** DELETE /api/users/skills/:id */
const deleteSkill = asyncHandler(async (req, res) => {
  const id = validate.requireId(req.params.id, 'id');
  const skills = await userService.removeUserSkill(req.user.id, id);
  return ok(res, skills, { message: 'Skill removed' });
});

/** PUT /api/users/skills - replace the whole saved skill list */
const replaceSkills = asyncHandler(async (req, res) => {
  const skillNames = validate.toStringList(req.body.skills || req.body.skillNames);
  const skills = await userService.replaceUserSkills(req.user.id, skillNames);
  return ok(res, skills, { message: 'Saved skills updated' });
});

/** GET /api/users/skill-catalogue - all skills, for the profile picker */
const skillCatalogue = asyncHandler(async (req, res) => {
  const skills = await userService.getSkillCatalogue();
  return ok(res, skills);
});

module.exports = {
  getProfile,
  updateProfile,
  listSkills,
  addSkill,
  updateSkill,
  deleteSkill,
  replaceSkills,
  skillCatalogue,
};
