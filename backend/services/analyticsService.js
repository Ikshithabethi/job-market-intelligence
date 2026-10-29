/**
 * Market analytics aggregated in SQL from the actual dataset.
 *
 * Nothing here is hardcoded: the dashboard figures come from GROUP BY queries
 * over jobs / job_skills / companies / job_roles / skill_demand.
 */
const { query, queryOne, queryScalar } = require('../config/db');
const { DISCLAIMER, TREND } = require('../config/analytics');
const skillService = require('./skillService');
const jobService = require('./jobService');

/** Headline counters and averages. */
async function getOverview() {
  const [counts, salary, experience, jobsPerQuarter] = await Promise.all([
    queryOne(
      `SELECT
         (SELECT COUNT(*) FROM jobs)       AS total_jobs,
         (SELECT COUNT(*) FROM companies)  AS total_companies,
         (SELECT COUNT(*) FROM job_roles)  AS total_roles,
         (SELECT COUNT(*) FROM skills)     AS total_skills,
         (SELECT COUNT(DISTINCT location) FROM jobs) AS total_locations`
    ),
    queryOne(
      `SELECT MIN(salary_min) AS min_salary,
              MAX(salary_max) AS max_salary,
              ROUND(AVG((salary_min + salary_max) / 2)) AS avg_salary,
              ROUND(AVG(salary_min)) AS avg_salary_min,
              ROUND(AVG(salary_max)) AS avg_salary_max
         FROM jobs`
    ),
    queryOne(
      `SELECT ROUND(AVG((experience_min + experience_max) / 2), 1) AS avg_experience,
              MIN(experience_min) AS min_experience,
              MAX(experience_max) AS max_experience
         FROM jobs`
    ),
    query(
      `SELECT CONCAT(YEAR(posted_date), '-Q', QUARTER(posted_date)) AS period,
              COUNT(*) AS posting_count
         FROM jobs
        GROUP BY period
        ORDER BY period ASC`
    ),
  ]);

  return {
    counts: {
      total_jobs: Number(counts.total_jobs) || 0,
      total_companies: Number(counts.total_companies) || 0,
      total_roles: Number(counts.total_roles) || 0,
      total_skills: Number(counts.total_skills) || 0,
      total_locations: Number(counts.total_locations) || 0,
    },
    salary: {
      min: Number(salary.min_salary) || 0,
      max: Number(salary.max_salary) || 0,
      average: Number(salary.avg_salary) || 0,
      average_min: Number(salary.avg_salary_min) || 0,
      average_max: Number(salary.avg_salary_max) || 0,
    },
    experience: {
      average: Number(experience.avg_experience) || 0,
      min: Number(experience.min_experience) || 0,
      max: Number(experience.max_experience) || 0,
    },
    jobsPerQuarter,
  };
}

/** Most advertised role families and titles. */
async function getPopularRoles(limit = 8) {
  return query(
    `SELECT r.id, r.title, r.family, r.seniority, r.demand_score, r.is_emerging,
            COUNT(j.id) AS posting_count,
            ROUND(AVG((j.salary_min + j.salary_max) / 2)) AS avg_salary
       FROM job_roles r
       JOIN jobs j ON j.role_id = r.id
      GROUP BY r.id, r.title, r.family, r.seniority, r.demand_score, r.is_emerging
      ORDER BY posting_count DESC, r.title ASC
      LIMIT ?`,
    [limit]
  );
}

/** Companies with the highest posting volume. */
async function getTopCompanies(limit = 8) {
  return query(
    `SELECT c.id, c.name, c.industry, c.headquarters,
            COUNT(j.id) AS posting_count,
            ROUND(AVG((j.salary_min + j.salary_max) / 2)) AS avg_salary
       FROM companies c
       JOIN jobs j ON j.company_id = c.id
      GROUP BY c.id, c.name, c.industry, c.headquarters
      ORDER BY posting_count DESC, c.name ASC
      LIMIT ?`,
    [limit]
  );
}

/** Average salary grouped by role family, seniority and location. */
async function getSalaryInsights() {
  const [byFamily, bySeniority, byLocation, overall] = await Promise.all([
    query(
      `SELECT r.family,
              COUNT(*) AS posting_count,
              ROUND(AVG((j.salary_min + j.salary_max) / 2)) AS avg_salary,
              MIN(j.salary_min) AS min_salary,
              MAX(j.salary_max) AS max_salary
         FROM jobs j
         JOIN job_roles r ON r.id = j.role_id
        GROUP BY r.family
        ORDER BY avg_salary DESC`
    ),
    query(
      `SELECT r.seniority,
              COUNT(*) AS posting_count,
              ROUND(AVG((j.salary_min + j.salary_max) / 2)) AS avg_salary
         FROM jobs j
         JOIN job_roles r ON r.id = j.role_id
        GROUP BY r.seniority
        ORDER BY avg_salary DESC`
    ),
    query(
      `SELECT j.location,
              COUNT(*) AS posting_count,
              ROUND(AVG((j.salary_min + j.salary_max) / 2)) AS avg_salary
         FROM jobs j
        GROUP BY j.location
        ORDER BY posting_count DESC, j.location ASC
        LIMIT 10`
    ),
    queryOne(
      `SELECT COUNT(*) AS posting_count,
              ROUND(AVG((salary_min + salary_max) / 2)) AS avg_salary,
              MIN(salary_min) AS min_salary,
              MAX(salary_max) AS max_salary
         FROM jobs`
    ),
  ]);

  return { overall, byFamily, bySeniority, byLocation };
}

/** Demand side: employment type split, experience buckets, quarterly trend. */
async function getDemandStatistics() {
  const [byEmploymentType, byExperience, quarterly, byLocation, emerging] = await Promise.all([
    query(
      `SELECT employment_type,
              COUNT(*) AS posting_count,
              ROUND(100 * COUNT(*) / (SELECT COUNT(*) FROM jobs), 2) AS share_percent
         FROM jobs
        GROUP BY employment_type
        ORDER BY posting_count DESC`
    ),
    query(
      `SELECT CASE
                WHEN (experience_min + experience_max) / 2 < 2 THEN '0-1 years'
                WHEN (experience_min + experience_max) / 2 < 4 THEN '2-3 years'
                WHEN (experience_min + experience_max) / 2 < 6 THEN '4-5 years'
                WHEN (experience_min + experience_max) / 2 < 9 THEN '6-8 years'
                ELSE '9+ years'
              END AS experience_band,
              COUNT(*) AS posting_count
         FROM jobs
        GROUP BY experience_band
        ORDER BY MIN((experience_min + experience_max) / 2)`
    ),
    query(
      `SELECT CONCAT(YEAR(posted_date), '-Q', QUARTER(posted_date)) AS period,
              COUNT(*) AS posting_count
         FROM jobs
        GROUP BY period
        ORDER BY period ASC`
    ),
    query(
      `SELECT location, COUNT(*) AS posting_count
         FROM jobs
        GROUP BY location
        ORDER BY posting_count DESC, location ASC
        LIMIT 10`
    ),
    skillService.getTrending({ limit: 5 }),
  ]);

  return { byEmploymentType, byExperience, quarterly, byLocation, emerging };
}

/** Skills ranked by posting volume, with their trend label. */
async function getSkillDemandLeaderboard(limit = 12) {
  return skillService.getDemandLeaderboard({ limit });
}

/** Everything the dashboard page renders, in one round trip. */
async function getDashboard({ topRoles = 8, topCompanies = 8, topSkills = 10 } = {}) {
  const [overview, popularRoles, companies, salaryInsights, demand, trending, recentJobs] =
    await Promise.all([
      getOverview(),
      getPopularRoles(topRoles),
      getTopCompanies(topCompanies),
      getSalaryInsights(),
      getDemandStatistics(),
      skillService.getTrending({ limit: 6 }),
      jobService.getRecentJobs(6),
    ]);

  const leaderboard = await skillService.getDemandLeaderboard({ limit: topSkills });

  return {
    generatedAt: new Date().toISOString(),
    dataSource: {
      type: 'synthetic-sample-dataset',
      label: 'Sample data',
      disclaimer: DISCLAIMER,
    },
    overview,
    popularRoles,
    topCompanies: companies,
    salaryInsights,
    demandStatistics: demand,
    topSkills: leaderboard,
    trendingSkills: trending,
    recentJobs,
    trendWindow: {
      baselinePeriods: TREND.baselinePeriods,
      recentPeriods: TREND.recentPeriods,
    },
  };
}

/** Number of rows in a table, used by the /health style meta endpoint. */
async function countRows(table) {
  return Number(await queryScalar(`SELECT COUNT(*) AS total FROM ${table}`)) || 0;
}

module.exports = {
  getOverview,
  getPopularRoles,
  getTopCompanies,
  getSalaryInsights,
  getDemandStatistics,
  getSkillDemandLeaderboard,
  getDashboard,
  countRows,
};
