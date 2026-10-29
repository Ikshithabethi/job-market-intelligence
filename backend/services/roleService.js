/**
 * Job role queries: catalogue, detail (skills + salary + transitions) and
 * side-by-side comparison of several roles.
 */
const { query, queryOne, queryScalar } = require('../config/db');

function placeholders(count) {
  return new Array(count).fill('?').join(', ');
}

/** Role catalogue with live posting counts and salary statistics. */
async function listRoles(options = {}) {
  const where = [];
  const params = [];

  if (options.q) {
    const like = `%${options.q}%`;
    where.push('(r.title LIKE ? OR r.family LIKE ? OR r.description LIKE ?)');
    params.push(like, like, like);
  }
  if (options.family) {
    where.push('r.family = ?');
    params.push(options.family);
  }
  if (options.seniority) {
    where.push('r.seniority = ?');
    params.push(options.seniority);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const statsSql = `
    SELECT r.id,
           r.title,
           r.family,
           r.seniority,
           r.description,
           r.avg_salary_min,
           r.avg_salary_max,
           r.demand_score,
           r.is_emerging,
           COUNT(j.id) AS posting_count,
           ROUND(AVG((j.salary_min + j.salary_max) / 2)) AS avg_salary_actual
      FROM job_roles r
      LEFT JOIN jobs j ON j.role_id = r.id
      ${whereSql}
     GROUP BY r.id, r.title, r.family, r.seniority, r.description,
              r.avg_salary_min, r.avg_salary_max, r.demand_score, r.is_emerging`;

  if (options.limit) {
    return query(
      `${statsSql} ORDER BY r.demand_score DESC, posting_count DESC, r.title ASC LIMIT ?`,
      [...params, options.limit]
    );
  }
  return query(`${statsSql} ORDER BY r.demand_score DESC, r.title ASC`, params);
}

/** Distinct role families for the filter dropdowns. */
async function getFamilies() {
  return query(
    `SELECT family, COUNT(*) AS role_count
       FROM job_roles GROUP BY family ORDER BY role_count DESC, family ASC`
  );
}

/** Skills required by a role, ordered by importance. */
async function getRoleSkills(roleId) {
  return query(
    `SELECT s.id AS skill_id, s.name, s.category, rs.importance
       FROM role_skills rs
       JOIN skills s ON s.id = rs.skill_id
      WHERE rs.role_id = ?
      ORDER BY rs.importance DESC, s.name ASC`,
    [roleId]
  );
}

/** Everything the role detail page needs. */
async function getRoleById(id) {
  const role = await queryOne(`SELECT * FROM job_roles WHERE id = ?`, [id]);
  if (!role) return null;

  const [skills, transitionsOut, transitionsIn, salaryStats, topEmployers, demandHistory] =
    await Promise.all([
      getRoleSkills(id),
      query(
        `SELECT cp.id, cp.to_role_id, r.title AS to_role, r.family AS to_family,
                r.seniority AS to_seniority, cp.transition_type, cp.avg_years,
                cp.difficulty, cp.notes
           FROM career_paths cp
           JOIN job_roles r ON r.id = cp.to_role_id
          WHERE cp.from_role_id = ?
          ORDER BY cp.difficulty ASC, r.title ASC`,
        [id]
      ),
      query(
        `SELECT cp.id, cp.from_role_id, r.title AS from_role, r.family AS from_family,
                r.seniority AS from_seniority, cp.transition_type, cp.avg_years,
                cp.difficulty, cp.notes
           FROM career_paths cp
           JOIN job_roles r ON r.id = cp.from_role_id
          WHERE cp.to_role_id = ?
          ORDER BY cp.difficulty ASC, r.title ASC`,
        [id]
      ),
      queryOne(
        `SELECT COUNT(*) AS posting_count,
                MIN(salary_min) AS min_salary,
                MAX(salary_max) AS max_salary,
                ROUND(AVG((salary_min + salary_max) / 2)) AS avg_salary,
                ROUND(AVG(experience_min), 1) AS avg_experience_min,
                ROUND(AVG(experience_max), 1) AS avg_experience_max
           FROM jobs WHERE role_id = ?`,
        [id]
      ),
      query(
        `SELECT c.id, c.name, c.industry, COUNT(*) AS posting_count
           FROM jobs j
           JOIN companies c ON c.id = j.company_id
          WHERE j.role_id = ?
          GROUP BY c.id, c.name, c.industry
          ORDER BY posting_count DESC, c.name ASC
          LIMIT 8`,
        [id]
      ),
      query(
        `SELECT sd.period, SUM(sd.job_count) AS job_count
           FROM skill_demand sd
           JOIN role_skills rs ON rs.skill_id = sd.skill_id
          WHERE rs.role_id = ?
          GROUP BY sd.period
          ORDER BY sd.period ASC`,
        [id]
      ),
    ]);

  const topSkillIds = skills.slice(0, 12).map((skill) => skill.skill_id);
  const topSkillTrends = topSkillIds.length
    ? await query(
        `SELECT sd.skill_id, s.name, sd.growth_rate, sd.z_score, sd.period
           FROM skill_demand sd
           JOIN skills s ON s.id = sd.skill_id
          WHERE sd.skill_id IN (${placeholders(topSkillIds.length)})
            AND sd.period = (SELECT MAX(period) FROM skill_demand)`,
        topSkillIds
      )
    : [];

  const trendBySkill = new Map(topSkillTrends.map((row) => [row.skill_id, row]));

  return {
    role,
    skills: skills.map((skill) => ({
      ...skill,
      growth_rate: trendBySkill.has(skill.skill_id)
        ? Number(trendBySkill.get(skill.skill_id).growth_rate)
        : 0,
      z_score: trendBySkill.has(skill.skill_id)
        ? Number(trendBySkill.get(skill.skill_id).z_score)
        : 0,
    })),
    transitionsOut,
    transitionsIn,
    salaryStats: salaryStats || {
      posting_count: 0,
      min_salary: 0,
      max_salary: 0,
      avg_salary: 0,
      avg_experience_min: 0,
      avg_experience_max: 0,
    },
    topEmployers,
    demandHistory,
  };
}

/**
 * Compare 2..5 roles: required skills, salary, experience and demand.
 * Also computes shared vs unique skills so the UI can render a matrix.
 */
async function compareRoles(roleIds) {
  if (roleIds.length === 0) return null;

  const roleRows = await query(
    `SELECT r.id, r.title, r.family, r.seniority, r.description,
            r.avg_salary_min, r.avg_salary_max, r.demand_score, r.is_emerging,
            COUNT(j.id) AS posting_count,
            ROUND(AVG((j.salary_min + j.salary_max) / 2)) AS avg_salary_actual,
            ROUND(AVG(j.experience_min), 1) AS avg_experience_min,
            ROUND(AVG(j.experience_max), 1) AS avg_experience_max
       FROM job_roles r
       LEFT JOIN jobs j ON j.role_id = r.id
      WHERE r.id IN (${placeholders(roleIds.length)})
      GROUP BY r.id, r.title, r.family, r.seniority, r.description,
               r.avg_salary_min, r.avg_salary_max, r.demand_score, r.is_emerging`,
    roleIds
  );

  const skillRows = await query(
    `SELECT rs.role_id, s.id AS skill_id, s.name, s.category, rs.importance
       FROM role_skills rs
       JOIN skills s ON s.id = rs.skill_id
      WHERE rs.role_id IN (${placeholders(roleIds.length)})
      ORDER BY s.name ASC`,
    roleIds
  );

  const skillsByRole = new Map();
  const skillIndex = new Map();
  skillRows.forEach((row) => {
    if (!skillsByRole.has(row.role_id)) skillsByRole.set(row.role_id, []);
    skillsByRole.get(row.role_id).push(row);
    if (!skillIndex.has(row.skill_id)) {
      skillIndex.set(row.skill_id, { skill_id: row.skill_id, name: row.name, category: row.category, roles: {} });
    }
    skillIndex.get(row.skill_id).roles[row.role_id] = row.importance;
  });

  const matrix = Array.from(skillIndex.values()).map((entry) => {
    const inRoles = Object.keys(entry.roles).map(Number);
    return {
      skill_id: entry.skill_id,
      name: entry.name,
      category: entry.category,
      importanceByRole: entry.roles,
      presentIn: inRoles.length,
      sharedByAll: inRoles.length === roleRows.length,
    };
  });

  const sharedSkills = matrix
    .filter((entry) => entry.sharedByAll)
    .sort((a, b) => a.name.localeCompare(b.name));
  const roleSpecificSkills = {};
  roleRows.forEach((role) => {
    roleSpecificSkills[role.id] = matrix
      .filter((entry) => entry.presentIn === 1 && entry.presentIn && entry.importanceByRole[role.id])
      .map((entry) => entry.name);
  });

  return {
    roles: roleRows.map((role) => ({
      ...role,
      skills: skillsByRole.get(role.id) || [],
    })),
    skillMatrix: matrix.sort((a, b) => b.presentIn - a.presentIn || a.name.localeCompare(b.name)),
    sharedSkills,
    roleSpecificSkills,
  };
}

/** Total number of roles (used by the dashboard counters). */
async function countRoles() {
  return Number(await queryScalar('SELECT COUNT(*) AS total FROM job_roles')) || 0;
}

module.exports = {
  listRoles,
  getFamilies,
  getRoleById,
  getRoleSkills,
  compareRoles,
  countRoles,
};
