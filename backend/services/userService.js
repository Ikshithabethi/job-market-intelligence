/**
 * User profile, saved skills and career goals.
 */
const { query, queryOne } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { PROFICIENCY_LEVELS } = require('../config/analytics');
const authService = require('./authService');

async function getProfile(userId) {
  const [user, skills, roadmapCount, skillCount] = await Promise.all([
    authService.getCurrentUser(userId),
    listUserSkills(userId),
    queryOne('SELECT COUNT(*) AS total FROM saved_roadmaps WHERE user_id = ?', [userId]),
    queryOne('SELECT COUNT(*) AS total FROM skills'),
  ]);

  return {
    user,
    skills,
    careerGoals: {
      currentRoleId: user.current_role_id,
      currentRoleTitle: user.current_role_title,
      targetRoleId: user.target_role_id,
      targetRoleTitle: user.target_role_title,
      experienceYears: user.experience_years === null ? null : Number(user.experience_years),
      location: user.location,
    },
    stats: {
      savedSkillCount: skills.length,
      savedRoadmapCount: Number(roadmapCount ? roadmapCount.total : 0),
      availableSkillCount: Number(skillCount ? skillCount.total : 0),
    },
    proficiencyLevels: PROFICIENCY_LEVELS,
  };
}

async function updateProfile(userId, updates) {
  const fields = [];
  const params = [];

  if (updates.fullName !== undefined) {
    fields.push('full_name = ?');
    params.push(updates.fullName);
  }
  if (updates.location !== undefined) {
    fields.push('location = ?');
    params.push(updates.location);
  }
  if (updates.experienceYears !== undefined) {
    fields.push('experience_years = ?');
    params.push(updates.experienceYears);
  }
  if (updates.currentRoleId !== undefined) {
    fields.push('current_role_id = ?');
    params.push(updates.currentRoleId);
  }
  if (updates.targetRoleId !== undefined) {
    fields.push('target_role_id = ?');
    params.push(updates.targetRoleId);
  }

  if (fields.length === 0) {
    throw ApiError.badRequest('No profile fields were provided to update');
  }

  params.push(userId);
  await query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);

  return authService.getCurrentUser(userId);
}

async function listUserSkills(userId) {
  return query(
    `SELECT us.id, us.skill_id, s.name, s.category, us.proficiency, us.created_at
       FROM user_skills us
       JOIN skills s ON s.id = us.skill_id
      WHERE us.user_id = ?
      ORDER BY s.category ASC, s.name ASC`,
    [userId]
  );
}

/** Names only, which is what the career/recommendation endpoints need. */
async function getUserSkillNames(userId) {
  const rows = await query(
    `SELECT s.name FROM user_skills us JOIN skills s ON s.id = us.skill_id WHERE us.user_id = ?`,
    [userId]
  );
  return rows.map((row) => row.name);
}

/**
 * Add a skill to the profile. The caller may pass either a skill id or a name;
 * an unknown name is rejected so the profile never points at a missing skill.
 */
async function addUserSkill(userId, { skillId, skillName, proficiency }) {
  let skill = null;

  if (skillId) {
    skill = await queryOne('SELECT id, name FROM skills WHERE id = ?', [skillId]);
  } else if (skillName) {
    skill = await queryOne('SELECT id, name FROM skills WHERE LOWER(name) = LOWER(?)', [skillName]);
  }

  if (!skill) {
    throw ApiError.badRequest(
      'Unknown skill. Provide a valid "skillId" or a "skillName" that exists in the skills catalogue.'
    );
  }

  const existing = await queryOne(
    'SELECT id FROM user_skills WHERE user_id = ? AND skill_id = ?',
    [userId, skill.id]
  );
  if (existing) {
    throw ApiError.conflict(`"${skill.name}" is already in your profile`);
  }

  await query(
    'INSERT INTO user_skills (user_id, skill_id, proficiency) VALUES (?, ?, ?)',
    [userId, skill.id, proficiency || 'beginner']
  );

  return listUserSkills(userId);
}

async function updateUserSkill(userId, userSkillId, { proficiency }) {
  const existing = await queryOne('SELECT id FROM user_skills WHERE id = ? AND user_id = ?', [
    userSkillId,
    userId,
  ]);
  if (!existing) throw ApiError.notFound('Saved skill not found');

  await query('UPDATE user_skills SET proficiency = ? WHERE id = ? AND user_id = ?', [
    proficiency,
    userSkillId,
    userId,
  ]);
  return listUserSkills(userId);
}

async function removeUserSkill(userId, userSkillId) {
  const result = await query('DELETE FROM user_skills WHERE id = ? AND user_id = ?', [
    userSkillId,
    userId,
  ]);
  if (result.affectedRows === 0) throw ApiError.notFound('Saved skill not found');
  return listUserSkills(userId);
}

/** Replace the whole saved skill set (used by the "save my skills" bulk action). */
async function replaceUserSkills(userId, skillNames) {
  const rows = skillNames.length
    ? await query(
        `SELECT id, name FROM skills WHERE name IN (${skillNames.map(() => '?').join(', ')})`,
        skillNames
      )
    : [];

  const found = new Set(rows.map((row) => row.name.toLowerCase()));
  const unknown = skillNames.filter((name) => !found.has(name.toLowerCase()));
  if (unknown.length > 0) {
    throw ApiError.badRequest(`Unknown skills: ${unknown.join(', ')}`);
  }

  await query('DELETE FROM user_skills WHERE user_id = ?', [userId]);
  for (const row of rows) {
    // Sequential inserts keep this readable; the set is small (profile skills).
    // eslint-disable-next-line no-await-in-loop
    await query(
      'INSERT INTO user_skills (user_id, skill_id, proficiency) VALUES (?, ?, ?)',
      [userId, row.id, 'intermediate']
    );
  }
  return listUserSkills(userId);
}

async function getSkillCatalogue() {
  return query('SELECT id, name, category FROM skills ORDER BY category ASC, name ASC');
}

module.exports = {
  getProfile,
  updateProfile,
  listUserSkills,
  getUserSkillNames,
  addUserSkill,
  updateUserSkill,
  removeUserSkill,
  replaceUserSkills,
  getSkillCatalogue,
};
