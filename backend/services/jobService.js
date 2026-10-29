/**
 * Job posting queries: search, filtering, pagination and detail views.
 *
 * All filters are optional and combine with AND. Text search uses LIKE across
 * title/description/company/role so partial words match ("python", "analyst").
 * A "relevance" sort uses the FULLTEXT index on (title, description).
 */
const { query, queryOne, queryScalar } = require('../config/db');

function placeholders(count) {
  return new Array(count).fill('?').join(', ');
}

/** Build the shared WHERE clause for list + count queries. */
function buildFilters(filters) {
  const where = [];
  const params = [];

  if (filters.q) {
    const like = `%${filters.q}%`;
    where.push('(j.title LIKE ? OR j.description LIKE ? OR c.name LIKE ? OR r.title LIKE ?)');
    params.push(like, like, like, like);
  }
  if (filters.roleId) {
    where.push('j.role_id = ?');
    params.push(filters.roleId);
  }
  if (filters.roleTitle) {
    where.push('r.title = ?');
    params.push(filters.roleTitle);
  }
  if (filters.location) {
    where.push('j.location = ?');
    params.push(filters.location);
  }
  if (filters.companyId) {
    where.push('j.company_id = ?');
    params.push(filters.companyId);
  }
  if (filters.employmentType) {
    where.push('j.employment_type = ?');
    params.push(filters.employmentType);
  }
  // Overlap semantics: keep postings whose experience band intersects the
  // requested band, which is how job seekers actually read a filter.
  if (filters.experienceMin !== null && filters.experienceMin !== undefined) {
    where.push('j.experience_max >= ?');
    params.push(filters.experienceMin);
  }
  if (filters.experienceMax !== null && filters.experienceMax !== undefined) {
    where.push('j.experience_min <= ?');
    params.push(filters.experienceMax);
  }
  if (filters.salaryMin !== null && filters.salaryMin !== undefined) {
    where.push('j.salary_max >= ?');
    params.push(filters.salaryMin);
  }
  if (filters.salaryMax !== null && filters.salaryMax !== undefined) {
    where.push('j.salary_min <= ?');
    params.push(filters.salaryMax);
  }
  if (filters.skills && filters.skills.length > 0) {
    // AND semantics: the posting must mention every requested skill.
    where.push(
      `(SELECT COUNT(DISTINCT s.name)
          FROM job_skills js
          JOIN skills s ON s.id = js.skill_id
         WHERE js.job_id = j.id AND s.name IN (${placeholders(filters.skills.length)})) = ?`
    );
    params.push(...filters.skills, filters.skills.length);
  }

  return {
    whereSql: where.length > 0 ? `WHERE ${where.join(' AND ')}` : '',
    params,
  };
}

/** Attach the skill list to a batch of postings in one extra query. */
async function attachSkills(jobs) {
  if (jobs.length === 0) return jobs;
  const ids = jobs.map((job) => job.id);
  const rows = await query(
    `SELECT js.job_id, s.id AS skill_id, s.name, s.category, js.importance
       FROM job_skills js
       JOIN skills s ON s.id = js.skill_id
      WHERE js.job_id IN (${placeholders(ids.length)})
      ORDER BY js.importance DESC, s.name ASC`,
    ids
  );
  const byJob = new Map();
  rows.forEach((row) => {
    if (!byJob.has(row.job_id)) byJob.set(row.job_id, []);
    byJob.get(row.job_id).push(row);
  });
  return jobs.map((job) => ({ ...job, skills: byJob.get(job.id) || [] }));
}

/**
 * Paginated job search.
 * @returns {{items:Array, total:number, page:number, pageSize:number, totalPages:number}}
 */
async function listJobs(filters, pagination) {
  const { whereSql, params } = buildFilters(filters);

  const total = Number(
    await queryScalar(
      `SELECT COUNT(*) AS total
         FROM jobs j
         JOIN companies c ON c.id = j.company_id
         JOIN job_roles r ON r.id = j.role_id
         ${whereSql}`,
      params
    )
  ) || 0;

  const sortMap = {
    date: 'j.posted_date',
    salary: 'j.salary_max',
    experience: 'j.experience_min',
    title: 'j.title',
    company: 'c.name',
  };
  const direction = pagination.sortDir === 'asc' ? 'ASC' : 'DESC';

  let orderSql;
  if (pagination.sortBy === 'relevance' && filters.q) {
    orderSql = 'ORDER BY MATCH(j.title, j.description) AGAINST (? IN NATURAL LANGUAGE MODE) DESC, j.posted_date DESC, j.id DESC';
  } else {
    const column = sortMap[pagination.sortBy] || sortMap.date;
    orderSql = `ORDER BY ${column} ${direction}, j.id DESC`;
  }

  const orderParams = pagination.sortBy === 'relevance' && filters.q ? [filters.q] : [];

  const rows = await query(
    `SELECT j.id,
            j.title,
            j.location,
            j.employment_type,
            j.experience_min,
            j.experience_max,
            j.salary_min,
            j.salary_max,
            j.posted_date,
            j.source,
            j.description,
            c.id   AS company_id,
            c.name AS company_name,
            c.industry AS company_industry,
            r.id   AS role_id,
            r.title AS role_title,
            r.family AS role_family,
            r.seniority AS role_seniority
       FROM jobs j
       JOIN companies c ON c.id = j.company_id
       JOIN job_roles r ON r.id = j.role_id
       ${whereSql}
       ${orderSql}
       LIMIT ? OFFSET ?`,
    [...params, ...orderParams, pagination.pageSize, pagination.offset]
  );

  const items = await attachSkills(rows);

  return {
    items,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages: total === 0 ? 0 : Math.ceil(total / pagination.pageSize),
  };
}

/** Single posting with company, role and required skills. */
async function getJobById(id) {
  const job = await queryOne(
    `SELECT j.*,
            c.name AS company_name,
            c.industry AS company_industry,
            c.headquarters AS company_headquarters,
            c.company_size,
            r.title AS role_title,
            r.family AS role_family,
            r.seniority AS role_seniority,
            r.demand_score AS role_demand_score
       FROM jobs j
       JOIN companies c ON c.id = j.company_id
       JOIN job_roles r ON r.id = j.role_id
      WHERE j.id = ?`,
    [id]
  );
  if (!job) return null;

  const [skills, similar] = await Promise.all([
    query(
      `SELECT s.id AS skill_id, s.name, s.category, js.importance
         FROM job_skills js
         JOIN skills s ON s.id = js.skill_id
        WHERE js.job_id = ?
        ORDER BY js.importance DESC, s.name ASC`,
      [id]
    ),
    query(
      `SELECT j.id, j.title, c.name AS company_name, j.location, j.salary_min, j.salary_max
         FROM jobs j
         JOIN companies c ON c.id = j.company_id
        WHERE j.role_id = ? AND j.id <> ?
        ORDER BY j.posted_date DESC
        LIMIT 5`,
      [job.role_id, id]
    ),
  ]);

  return { job, skills, similarJobs: similar };
}

/** Distinct filter values plus the ranges used by the filter sliders. */
async function getFilterOptions() {
  const [locations, roles, employmentTypes, salaryRange, experienceRange, topSkills] =
    await Promise.all([
      query(
        `SELECT location, COUNT(*) AS posting_count
           FROM jobs GROUP BY location
          ORDER BY posting_count DESC, location ASC`
      ),
      query(
        `SELECT r.id, r.title, r.family, r.seniority, COUNT(j.id) AS posting_count
           FROM job_roles r
           LEFT JOIN jobs j ON j.role_id = r.id
          GROUP BY r.id, r.title, r.family, r.seniority
          ORDER BY posting_count DESC, r.title ASC`
      ),
      query(
        `SELECT employment_type, COUNT(*) AS posting_count
           FROM jobs GROUP BY employment_type ORDER BY posting_count DESC`
      ),
      queryOne(
        `SELECT MIN(salary_min) AS min_salary,
                MAX(salary_max) AS max_salary,
                ROUND(AVG((salary_min + salary_max) / 2)) AS avg_salary
           FROM jobs`
      ),
      queryOne(
        `SELECT MIN(experience_min) AS min_experience,
                MAX(experience_max) AS max_experience
           FROM jobs`
      ),
      query(
        `SELECT s.name, COUNT(*) AS posting_count
           FROM job_skills js
           JOIN skills s ON s.id = js.skill_id
          GROUP BY s.name
          ORDER BY posting_count DESC, s.name ASC
          LIMIT 40`
      ),
    ]);

  return {
    locations,
    roles,
    employmentTypes,
    salaryRange: {
      min: Number(salaryRange ? salaryRange.min_salary : 0),
      max: Number(salaryRange ? salaryRange.max_salary : 0),
      avg: Number(salaryRange ? salaryRange.avg_salary : 0),
    },
    experienceRange: {
      min: Number(experienceRange ? experienceRange.min_experience : 0),
      max: Number(experienceRange ? experienceRange.max_experience : 0),
    },
    topSkills,
  };
}

/** Most recent postings, used on the dashboard. */
async function getRecentJobs(limit = 6) {
  const rows = await query(
    `SELECT j.id, j.title, j.location, j.salary_min, j.salary_max, j.posted_date,
            c.name AS company_name, r.title AS role_title
       FROM jobs j
       JOIN companies c ON c.id = j.company_id
       JOIN job_roles r ON r.id = j.role_id
      ORDER BY j.posted_date DESC, j.id DESC
      LIMIT ?`,
    [limit]
  );
  return rows;
}

module.exports = {
  listJobs,
  getJobById,
  getFilterOptions,
  getRecentJobs,
};
