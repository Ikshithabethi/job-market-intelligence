/**
 * Skill queries: catalogue, demand stats, trend (emerging / declining) and the
 * skills required by each role.
 */
const { query, queryOne, queryScalar } = require('../config/db');
const { TREND } = require('../config/analytics');

/** The most recent quarter present in skill_demand. */
async function latestPeriod() {
  const period = await queryScalar('SELECT MAX(period) AS period FROM skill_demand');
  return period || (TREND.recentPeriods[TREND.recentPeriods.length - 1] || null);
}

function placeholders(count) {
  return new Array(count).fill('?').join(', ');
}

async function getCategories() {
  return query(
    `SELECT category,
            COUNT(*) AS skill_count
       FROM skills
      GROUP BY category
      ORDER BY skill_count DESC, category ASC`
  );
}

/**
 * Paginated skill catalogue enriched with demand statistics.
 * @param {{q?:string, category?:string, period?:string, page:number, pageSize:number, offset:number, sortBy?:string, sortDir?:string}} options
 */
async function listSkills(options) {
  const period = options.period || (await latestPeriod());
  const where = [];
  const params = [];

  if (options.q) {
    where.push('(s.name LIKE ? OR s.category LIKE ? OR s.description LIKE ?)');
    const like = `%${options.q}%`;
    params.push(like, like, like);
  }
  if (options.category) {
    where.push('s.category = ?');
    params.push(options.category);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const total = await queryScalar(
    `SELECT COUNT(*) AS total FROM skills s ${whereSql}`,
    params
  );

  const sortMap = {
    demand: 'posting_count',
    growth: 'growth_rate',
    importance: 'avg_importance',
    name: 's.name',
    category: 's.category',
  };
  const sortColumn = sortMap[options.sortBy] || 'posting_count';
  const direction = options.sortDir === 'asc' ? 'ASC' : 'DESC';

  const rows = await query(
    `SELECT s.id,
            s.name,
            s.category,
            s.description,
            COALESCE(js.posting_count, 0)  AS posting_count,
            COALESCE(js.avg_importance, 0) AS avg_importance,
            COALESCE(rs.role_count, 0)     AS role_count,
            COALESCE(sd.growth_rate, 0)    AS growth_rate,
            COALESCE(sd.z_score, 0)        AS z_score
       FROM skills s
       LEFT JOIN (
         SELECT skill_id,
                COUNT(*)        AS posting_count,
                AVG(importance) AS avg_importance
           FROM job_skills
          GROUP BY skill_id
       ) js ON js.skill_id = s.id
       LEFT JOIN (
         SELECT skill_id, COUNT(*) AS role_count
           FROM role_skills
          GROUP BY skill_id
       ) rs ON rs.skill_id = s.id
       LEFT JOIN skill_demand sd ON sd.skill_id = s.id AND sd.period = ?
       ${whereSql}
       ORDER BY ${sortColumn} ${direction}, s.name ASC
       LIMIT ? OFFSET ?`,
    [period, ...params, options.pageSize, options.offset]
  );

  return {
    rows: rows.map((row) => ({
      ...row,
      avg_importance: Number(row.avg_importance),
      trend: describeTrend(row.growth_rate, row.z_score),
    })),
    total: Number(total) || 0,
    page: options.page,
    pageSize: options.pageSize,
    period,
  };
}

/** Human readable trend label derived from the stored statistics. */
function describeTrend(growthRate, zScore) {
  const growth = Number(growthRate) || 0;
  const z = Number(zScore) || 0;
  if (growth === 0 || Math.abs(z) < TREND.significanceZ) return 'stable';
  return growth > 0 ? 'emerging' : 'declining';
}

/** Full detail for a single skill: roles that require it, employers, history. */
async function getSkillById(id) {
  const skill = await queryOne(
    `SELECT id, name, category, description FROM skills WHERE id = ?`,
    [id]
  );
  if (!skill) return null;

  const [roles, employers, history, summary] = await Promise.all([
    query(
      `SELECT r.id, r.title, r.family, r.seniority, rs.importance
         FROM role_skills rs
         JOIN job_roles r ON r.id = rs.role_id
        WHERE rs.skill_id = ?
        ORDER BY rs.importance DESC, r.title ASC`,
      [id]
    ),
    query(
      `SELECT c.id, c.name, c.industry, COUNT(*) AS posting_count
         FROM job_skills js
         JOIN jobs j ON j.id = js.job_id
         JOIN companies c ON c.id = j.company_id
        WHERE js.skill_id = ?
        GROUP BY c.id, c.name, c.industry
        ORDER BY posting_count DESC, c.name ASC
        LIMIT 10`,
      [id]
    ),
    query(
      `SELECT period, job_count, growth_rate, z_score
         FROM skill_demand
        WHERE skill_id = ?
        ORDER BY period ASC`,
      [id]
    ),
    queryOne(
      `SELECT COUNT(*) AS posting_count, COALESCE(AVG(importance), 0) AS avg_importance
         FROM job_skills WHERE skill_id = ?`,
      [id]
    ),
  ]);

  const latest = history[history.length - 1] || null;

  return {
    skill,
    summary: {
      posting_count: Number(summary ? summary.posting_count : 0),
      avg_importance: Number(summary ? summary.avg_importance : 0),
      role_count: roles.length,
      growth_rate: latest ? Number(latest.growth_rate) : 0,
      z_score: latest ? Number(latest.z_score) : 0,
      trend: describeTrend(latest ? latest.growth_rate : 0, latest ? latest.z_score : 0),
    },
    requiredByRoles: roles,
    topEmployers: employers,
    history,
  };
}

/**
 * Emerging and declining skills.
 * Only skills whose change passed the significance test have a non-zero
 * growth_rate, so "stable" skills never leak into these lists.
 */
async function getTrending({ limit = 8, period } = {}) {
  const asOf = period || (await latestPeriod());
  const base = `SELECT s.id, s.name, s.category,
                       sd.growth_rate, sd.z_score, sd.job_count, sd.period,
                       COALESCE(js.posting_count, 0) AS posting_count
                  FROM skill_demand sd
                  JOIN skills s ON s.id = sd.skill_id
                  LEFT JOIN (
                    SELECT skill_id, COUNT(*) AS posting_count
                      FROM job_skills GROUP BY skill_id
                  ) js ON js.skill_id = s.id
                 WHERE sd.period = ?`;

  const [emerging, declining] = await Promise.all([
    query(
      `${base} AND sd.growth_rate > 0 AND ABS(sd.z_score) >= ?
        ORDER BY sd.growth_rate DESC LIMIT ?`,
      [asOf, TREND.significanceZ, limit]
    ),
    query(
      `${base} AND sd.growth_rate < 0 AND ABS(sd.z_score) >= ?
        ORDER BY sd.growth_rate ASC LIMIT ?`,
      [asOf, TREND.significanceZ, limit]
    ),
  ]);

  return {
    asOfPeriod: asOf,
    baselinePeriods: TREND.baselinePeriods,
    recentPeriods: TREND.recentPeriods,
    significanceZ: TREND.significanceZ,
    minSample: TREND.minSample,
    emerging,
    declining,
  };
}

/** Skills ranked by how many postings mention them. */
async function getDemandLeaderboard({ limit = 20, category } = {}) {
  const params = [];
  let categorySql = '';
  if (category) {
    categorySql = 'WHERE s.category = ?';
    params.push(category);
  }
  params.push(limit);

  const rows = await query(
    `SELECT s.id, s.name, s.category,
            COUNT(*) AS posting_count,
            AVG(js.importance) AS avg_importance
       FROM job_skills js
       JOIN skills s ON s.id = js.skill_id
       ${categorySql}
      GROUP BY s.id, s.name, s.category
      ORDER BY posting_count DESC, s.name ASC
      LIMIT ?`,
    params
  );
  return rows.map((row) => ({ ...row, avg_importance: Number(row.avg_importance) }));
}

/** Skills required by one or more roles, ordered by importance. */
async function getSkillsForRoles(roleIds) {
  if (roleIds.length === 0) return [];
  return query(
    `SELECT rs.role_id, s.id AS skill_id, s.name, s.category, rs.importance
       FROM role_skills rs
       JOIN skills s ON s.id = rs.skill_id
      WHERE rs.role_id IN (${placeholders(roleIds.length)})
      ORDER BY rs.role_id, rs.importance DESC, s.name ASC`,
    roleIds
  );
}

/** Resolve skill names to rows (used by career + recommendation flows). */
async function findSkillsByNames(names) {
  if (names.length === 0) return [];
  return query(
    `SELECT id, name, category FROM skills WHERE name IN (${placeholders(names.length)})`,
    names
  );
}

module.exports = {
  latestPeriod,
  getCategories,
  listSkills,
  getSkillById,
  getTrending,
  getDemandLeaderboard,
  getSkillsForRoles,
  findSkillsByNames,
  describeTrend,
};
