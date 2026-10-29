/**
 * API router. Everything is mounted under /api in app.js.
 */
const express = require('express');
const { ok } = require('../utils/respond');

const router = express.Router();

/**
 * GET /api - a small self-describing index so the API surface is discoverable
 * without leaving the terminal.
 */
router.get('/', (req, res) =>
  ok(res, {
    name: 'Job Market Intelligence API',
    version: '1.0.0',
    dataDisclaimer:
      'All data served by this API comes from a synthetic sample dataset generated for academic use.',
    endpoints: {
      auth: [
        'POST   /api/auth/register',
        'POST   /api/auth/login',
        'POST   /api/auth/logout            (auth)',
        'GET    /api/auth/me                (auth)',
      ],
      jobs: [
        'GET    /api/jobs                   ?q&roleId&role&location&companyId&employmentType&experienceMin&experienceMax&salaryMin&salaryMax&skills&page&pageSize&sortBy&sortDir',
        'GET    /api/jobs/filters',
        'GET    /api/jobs/:id',
      ],
      skills: [
        'GET    /api/skills                 ?q&category&page&pageSize&sortBy&sortDir',
        'GET    /api/skills/categories',
        'GET    /api/skills/trending        ?limit',
        'GET    /api/skills/demand          ?limit&category',
        'GET    /api/skills/:id',
      ],
      roles: [
        'GET    /api/roles                  ?q&family&seniority&limit',
        'GET    /api/roles/families',
        'GET    /api/roles/compare          ?roles=1,2,3',
        'GET    /api/roles/:id',
      ],
      analytics: [
        'GET    /api/analytics/dashboard',
        'GET    /api/analytics/overview',
        'GET    /api/analytics/salary',
        'GET    /api/analytics/demand',
        'GET    /api/analytics/roles        ?limit',
        'GET    /api/analytics/companies    ?limit',
      ],
      graph: [
        'GET    /api/graph                  ?similarityThreshold&usedByLimit&includeCompanies&includeSimilarTo&minImportance',
        'GET    /api/graph/stats',
        'GET    /api/graph/neighbours       ?type=role|skill|company&id&depth',
      ],
      career: [
        'GET    /api/career/options',
        'GET    /api/career/map',
        'POST   /api/career/path            { fromRoleId, toRoleId, currentSkills? }',
      ],
      recommendations: [
        'GET    /api/recommendations/popular-skills ?limit',
        'POST   /api/recommendations/skills { targetRoleId, currentSkills?, limit? }',
        'POST   /api/recommendations/roles  { currentSkills?, limit? }',
      ],
      users: [
        'GET    /api/users/profile          (auth)',
        'PUT    /api/users/profile          (auth)',
        'GET    /api/users/skill-catalogue  (auth)',
        'GET    /api/users/skills           (auth)',
        'POST   /api/users/skills           (auth)',
        'PUT    /api/users/skills           (auth)',
        'PUT    /api/users/skills/:id       (auth)',
        'DELETE /api/users/skills/:id       (auth)',
      ],
      roadmaps: [
        'GET    /api/roadmaps               (auth)',
        'POST   /api/roadmaps               (auth)',
        'GET    /api/roadmaps/:id           (auth)',
        'DELETE /api/roadmaps/:id           (auth)',
      ],
    },
  })
);

router.use('/auth', require('./authRoutes'));
router.use('/jobs', require('./jobRoutes'));
router.use('/skills', require('./skillRoutes'));
router.use('/roles', require('./roleRoutes'));
router.use('/analytics', require('./analyticsRoutes'));
router.use('/graph', require('./graphRoutes'));
router.use('/career', require('./careerRoutes'));
router.use('/recommendations', require('./recommendationRoutes'));
router.use('/users', require('./userRoutes'));
router.use('/roadmaps', require('./roadmapRoutes'));

module.exports = router;
