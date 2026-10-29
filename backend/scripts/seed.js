#!/usr/bin/env node
/**
 * Seed the database from the CSV files in ../data.
 *
 *   npm run seed             reload the dataset tables, keep user accounts
 *   npm run seed:truncate    also wipe users / saved skills / saved roadmaps,
 *                            then recreate the demo account
 *
 * The CSVs are produced by python-analysis/generate_seed.py and contain
 * SYNTHETIC SAMPLE DATA. Nothing in this script invents values: every row is
 * read from the files and only foreign keys are resolved by name.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config/env');
const db = require('../config/db');
const { parseCsv } = require('../utils/csv');
const { hashPassword } = require('../utils/password');

const TRUNCATE_USERS = process.argv.includes('--truncate');

// Dataset tables, listed child -> parent (safe delete order with FK checks on).
const DATASET_TABLES = [
  'job_skills',
  'role_skills',
  'skill_demand',
  'career_paths',
  'jobs',
  'companies',
  'skills',
  'job_roles',
];

const DEMO_USER = {
  fullName: 'Demo Student',
  email: 'demo@example.com',
  password: 'Demo@123',
  location: 'Bengaluru',
  experienceYears: 2.5,
  currentRoleTitle: 'Data Analyst',
  targetRoleTitle: 'Senior Data Engineer',
  skills: [
    'SQL',
    'Python',
    'Microsoft Excel',
    'Data Storytelling',
    'Statistics',
    'Tableau',
    'Git',
  ],
};

function readCsv(fileName) {
  const filePath = path.join(config.paths.dataDir, fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Missing data file: ${filePath}\n` +
        'Generate the sample dataset first:  cd python-analysis && python3 generate_seed.py --jobs 8000'
    );
  }
  return parseCsv(fs.readFileSync(filePath, 'utf8'));
}

function toIntOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function toFloatOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function toBool(value) {
  return String(value).trim() === '1' || String(value).trim().toLowerCase() === 'true' ? 1 : 0;
}

/** Fail loudly when a CSV references a name that does not exist elsewhere. */
function requireKey(map, name, context) {
  const id = map.get(name);
  if (id === undefined) {
    throw new Error(`Unknown ${context} "${name}". Re-run generate_seed.py so all CSV files match.`);
  }
  return id;
}

async function resetDatasetTables() {
  if (TRUNCATE_USERS) {
    // eslint-disable-next-line no-console
    console.log('[seed] --truncate: removing user accounts, saved skills and saved roadmaps');
  }

  await db.withTransaction(async (exec) => {
    await exec('SET FOREIGN_KEY_CHECKS = 0');

    // Detach references to job_roles before the roles table is truncated so no
    // dangling ids are left behind.
    await exec('UPDATE saved_roadmaps SET from_role_id = NULL, to_role_id = NULL');
    await exec('UPDATE users SET current_role_id = NULL, target_role_id = NULL');

    for (const table of DATASET_TABLES) {
      // eslint-disable-next-line no-await-in-loop
      await exec(`TRUNCATE TABLE ${table}`);
    }

    if (TRUNCATE_USERS) {
      for (const table of ['saved_roadmaps', 'user_skills', 'users']) {
        // eslint-disable-next-line no-await-in-loop
        await exec(`TRUNCATE TABLE ${table}`);
      }
    }

    await exec('SET FOREIGN_KEY_CHECKS = 1');
  });
}

async function insertDataset() {
  const roleRows = readCsv('job_roles.csv');
  const skillRows = readCsv('sample_skills.csv');
  const companyRows = readCsv('companies.csv');
  const jobRows = readCsv('sample_jobs.csv');
  const jobSkillRows = readCsv('job_skills.csv');
  const roleSkillRows = readCsv('role_skills.csv');
  const transitionRows = readCsv('career_transitions.csv');
  const demandRows = readCsv('skill_demand.csv');

  // eslint-disable-next-line no-console
  console.log(
    `[seed] csv rows: roles=${roleRows.length} skills=${skillRows.length} companies=${companyRows.length} ` +
      `jobs=${jobRows.length} job_skills=${jobSkillRows.length} role_skills=${roleSkillRows.length} ` +
      `transitions=${transitionRows.length} skill_demand=${demandRows.length}`
  );

  return db.withTransaction(async (exec) => {
    // 1. job_roles -------------------------------------------------------
    await db.bulkInsert(
      exec,
      'job_roles',
      [
        'id',
        'title',
        'family',
        'seniority',
        'description',
        'avg_salary_min',
        'avg_salary_max',
        'demand_score',
        'is_emerging',
      ],
      roleRows.map((row) => [
        toIntOrNull(row.role_id),
        row.title,
        row.family,
        row.seniority || 'Mid',
        row.description || null,
        toIntOrNull(row.avg_salary_min),
        toIntOrNull(row.avg_salary_max),
        toFloatOrNull(row.demand_score) || 0,
        toBool(row.is_emerging),
      ]),
      500
    );

    const roleIdByTitle = new Map(roleRows.map((row) => [row.title, toIntOrNull(row.role_id)]));

    // 2. skills ----------------------------------------------------------
    await db.bulkInsert(
      exec,
      'skills',
      ['id', 'name', 'category', 'description'],
      skillRows.map((row) => [
        toIntOrNull(row.skill_id),
        row.name,
        row.category,
        row.description || null,
      ]),
      500
    );

    const skillIdByName = new Map(skillRows.map((row) => [row.name, toIntOrNull(row.skill_id)]));

    // 3. companies -------------------------------------------------------
    await db.bulkInsert(
      exec,
      'companies',
      ['id', 'name', 'industry', 'headquarters', 'company_size', 'founded_year'],
      companyRows.map((row) => [
        toIntOrNull(row.company_id),
        row.name,
        row.industry || null,
        row.headquarters || null,
        row.company_size || null,
        toIntOrNull(row.founded_year),
      ]),
      500
    );

    const companyIdByName = new Map(companyRows.map((row) => [row.name, toIntOrNull(row.company_id)]));

    // 4. jobs ------------------------------------------------------------
    const jobIds = new Set();
    await db.bulkInsert(
      exec,
      'jobs',
      [
        'id',
        'title',
        'company_id',
        'role_id',
        'location',
        'employment_type',
        'experience_min',
        'experience_max',
        'salary_min',
        'salary_max',
        'posted_date',
        'description',
        'source',
      ],
      jobRows.map((row) => {
        const jobId = toIntOrNull(row.job_id);
        jobIds.add(jobId);
        return [
          jobId,
          row.title,
          requireKey(companyIdByName, row.company_name, 'company'),
          requireKey(roleIdByTitle, row.role_title, 'job role'),
          row.location,
          row.employment_type || 'Full-time',
          toIntOrNull(row.experience_min) || 0,
          toIntOrNull(row.experience_max) || 0,
          toIntOrNull(row.salary_min),
          toIntOrNull(row.salary_max),
          row.posted_date,
          row.description || null,
          'sample-dataset',
        ];
      }),
      500
    );

    // 5. job_skills ------------------------------------------------------
    const jobSkillValues = [];
    jobSkillRows.forEach((row) => {
      const jobId = toIntOrNull(row.job_id);
      if (!jobIds.has(jobId)) return;
      jobSkillValues.push([
        jobId,
        requireKey(skillIdByName, row.skill_name, 'skill'),
        toIntOrNull(row.importance) || 3,
      ]);
    });
    await db.bulkInsert(exec, 'job_skills', ['job_id', 'skill_id', 'importance'], jobSkillValues, 1000);

    // 6. role_skills -----------------------------------------------------
    const roleSkillValues = roleSkillRows.map((row) => [
      requireKey(roleIdByTitle, row.role_title, 'job role'),
      requireKey(skillIdByName, row.skill_name, 'skill'),
      toIntOrNull(row.importance) || 3,
    ]);
    await db.bulkInsert(exec, 'role_skills', ['role_id', 'skill_id', 'importance'], roleSkillValues, 1000);

    // 7. career_paths ----------------------------------------------------
    const pathValues = [];
    const seenPaths = new Set();
    transitionRows.forEach((row) => {
      const fromId = requireKey(roleIdByTitle, row.from_role, 'job role');
      const toId = requireKey(roleIdByTitle, row.to_role, 'job role');
      const key = `${fromId}-${toId}`;
      if (seenPaths.has(key)) return;
      seenPaths.add(key);
      pathValues.push([
        fromId,
        toId,
        row.transition_type || 'lateral',
        toFloatOrNull(row.avg_years) || 2.0,
        toIntOrNull(row.difficulty) || 3,
        row.notes || null,
      ]);
    });
    await db.bulkInsert(
      exec,
      'career_paths',
      ['from_role_id', 'to_role_id', 'transition_type', 'avg_years', 'difficulty', 'notes'],
      pathValues,
      500
    );

    // 8. skill_demand ----------------------------------------------------
    const demandValues = demandRows.map((row) => [
      requireKey(skillIdByName, row.skill_name, 'skill'),
      row.period,
      toIntOrNull(row.job_count) || 0,
      toFloatOrNull(row.growth_rate) || 0,
      toFloatOrNull(row.z_score) || 0,
    ]);
    await db.bulkInsert(
      exec,
      'skill_demand',
      ['skill_id', 'period', 'job_count', 'growth_rate', 'z_score'],
      demandValues,
      1000
    );

    return {
      job_roles: roleRows.length,
      skills: skillRows.length,
      companies: companyRows.length,
      jobs: jobRows.length,
      job_skills: jobSkillValues.length,
      role_skills: roleSkillValues.length,
      career_paths: pathValues.length,
      skill_demand: demandValues.length,
    };
  });
}

/** Create the demo account so the profile features work out of the box. */
async function ensureDemoUser() {
  const existing = await db.queryOne('SELECT id FROM users WHERE email = ?', [DEMO_USER.email]);
  if (existing) {
    return { created: false, email: DEMO_USER.email };
  }

  const currentRole = await db.queryOne('SELECT id FROM job_roles WHERE title = ?', [
    DEMO_USER.currentRoleTitle,
  ]);
  const targetRole = await db.queryOne('SELECT id FROM job_roles WHERE title = ?', [
    DEMO_USER.targetRoleTitle,
  ]);

  const passwordHash = await hashPassword(DEMO_USER.password);

  await db.withTransaction(async (exec) => {
    const result = await exec(
      `INSERT INTO users (full_name, email, password_hash, current_role_id, target_role_id, location, experience_years)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        DEMO_USER.fullName,
        DEMO_USER.email,
        passwordHash,
        currentRole ? currentRole.id : null,
        targetRole ? targetRole.id : null,
        DEMO_USER.location,
        DEMO_USER.experienceYears,
      ]
    );

    const userId = result.insertId;
    const skills = await exec(
      `SELECT id, name FROM skills WHERE name IN (${DEMO_USER.skills.map(() => '?').join(', ')})`,
      DEMO_USER.skills
    );
    if (skills.length > 0) {
      const placeholders = skills.map(() => '(?, ?, ?)').join(', ');
      const values = skills.reduce(
        (acc, skill) => acc.concat([userId, skill.id, 'intermediate']),
        []
      );
      await exec(
        `INSERT INTO user_skills (user_id, skill_id, proficiency) VALUES ${placeholders}`,
        values
      );
    }
  });

  return { created: true, email: DEMO_USER.email, password: DEMO_USER.password };
}

async function verifyCounts() {
  const counts = {};
  for (const table of [
    'job_roles',
    'skills',
    'companies',
    'jobs',
    'job_skills',
    'role_skills',
    'career_paths',
    'skill_demand',
    'users',
    'user_skills',
    'saved_roadmaps',
  ]) {
    // eslint-disable-next-line no-await-in-loop
    counts[table] = Number(await db.queryScalar(`SELECT COUNT(*) AS total FROM ${table}`)) || 0;
  }
  return counts;
}

async function main() {
  const started = Date.now();
  // eslint-disable-next-line no-console
  console.log('[seed] target database:', config.db.database, 'at', `${config.db.host}:${config.db.port}`);

  await db.ping();
  await resetDatasetTables();
  const inserted = await insertDataset();
  const demo = await ensureDemoUser();
  const counts = await verifyCounts();

  // eslint-disable-next-line no-console
  console.log('[seed] inserted:', inserted);
  // eslint-disable-next-line no-console
  console.log('[seed] table counts:', counts);
  if (demo.created) {
    // eslint-disable-next-line no-console
    console.log(`[seed] demo account created: ${demo.email} / ${demo.password}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[seed] demo account already present: ${demo.email}`);
  }
  // eslint-disable-next-line no-console
  console.log(`[seed] finished in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  // eslint-disable-next-line no-console
  console.log('[seed] NOTE: every record above is synthetic sample data for academic use.');
}

main()
  .then(async () => {
    await db.pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error('[seed] failed:', error.message);
    if (error.code) {
      // eslint-disable-next-line no-console
      console.error('[seed] database error code:', error.code);
    }
    await db.pool.end().catch(() => {});
    process.exit(1);
  });
