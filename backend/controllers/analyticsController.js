/**
 * Market analytics endpoints backing the dashboard.
 */
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/respond');
const validate = require('../middleware/validate');
const analyticsService = require('../services/analyticsService');

/** GET /api/analytics/dashboard */
const getDashboard = asyncHandler(async (req, res) => {
  const dashboard = await analyticsService.getDashboard({
    topRoles: validate.toInt(req.query.topRoles, 'topRoles', { default: 8, min: 1, max: 30 }),
    topCompanies: validate.toInt(req.query.topCompanies, 'topCompanies', {
      default: 8,
      min: 1,
      max: 30,
    }),
    topSkills: validate.toInt(req.query.topSkills, 'topSkills', { default: 10, min: 1, max: 30 }),
  });
  return ok(res, dashboard);
});

/** GET /api/analytics/overview */
const getOverview = asyncHandler(async (req, res) => {
  const overview = await analyticsService.getOverview();
  return ok(res, overview);
});

/** GET /api/analytics/salary */
const getSalaryInsights = asyncHandler(async (req, res) => {
  const insights = await analyticsService.getSalaryInsights();
  return ok(res, insights);
});

/** GET /api/analytics/demand */
const getDemandStatistics = asyncHandler(async (req, res) => {
  const demand = await analyticsService.getDemandStatistics();
  return ok(res, demand);
});

/** GET /api/analytics/roles */
const getPopularRoles = asyncHandler(async (req, res) => {
  const limit = validate.toInt(req.query.limit, 'limit', { default: 8, min: 1, max: 30 });
  const roles = await analyticsService.getPopularRoles(limit);
  return ok(res, roles);
});

/** GET /api/analytics/companies */
const getTopCompanies = asyncHandler(async (req, res) => {
  const limit = validate.toInt(req.query.limit, 'limit', { default: 8, min: 1, max: 30 });
  const companies = await analyticsService.getTopCompanies(limit);
  return ok(res, companies);
});

module.exports = {
  getDashboard,
  getOverview,
  getSalaryInsights,
  getDemandStatistics,
  getPopularRoles,
  getTopCompanies,
};
