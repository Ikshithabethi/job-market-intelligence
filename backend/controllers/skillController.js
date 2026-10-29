/**
 * Skill catalogue, demand and trend endpoints.
 */
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/respond');
const ApiError = require('../utils/ApiError');
const validate = require('../middleware/validate');
const skillService = require('../services/skillService');

/** GET /api/skills */
const listSkills = asyncHandler(async (req, res) => {
  const pagination = validate.toPagination(req.query);
  const result = await skillService.listSkills({
    q: validate.optionalString(req.query.q, 'q', { max: 120 }),
    category: validate.optionalString(req.query.category, 'category', { max: 80 }),
    page: pagination.page,
    pageSize: pagination.pageSize,
    offset: pagination.offset,
    sortBy: validate.toEnum(
      req.query.sortBy,
      'sortBy',
      ['demand', 'growth', 'importance', 'name', 'category'],
      { default: 'demand' }
    ),
    sortDir: validate.toSortDirection(req.query.sortDir, 'desc'),
  });

  return ok(res, result.rows, {
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.total === 0 ? 0 : Math.ceil(result.total / result.pageSize),
    period: result.period,
  });
});

/** GET /api/skills/categories */
const getCategories = asyncHandler(async (req, res) => {
  const categories = await skillService.getCategories();
  return ok(res, categories);
});

/** GET /api/skills/trending */
const getTrending = asyncHandler(async (req, res) => {
  const limit = validate.toInt(req.query.limit, 'limit', { default: 8, min: 1, max: 50 });
  const trend = await skillService.getTrending({ limit });
  return ok(res, trend);
});

/** GET /api/skills/demand */
const getDemand = asyncHandler(async (req, res) => {
  const limit = validate.toInt(req.query.limit, 'limit', { default: 20, min: 1, max: 100 });
  const category = validate.optionalString(req.query.category, 'category', { max: 80 });
  const rows = await skillService.getDemandLeaderboard({ limit, category });
  return ok(res, rows, { limit, category: category || null });
});

/** GET /api/skills/:id */
const getSkillById = asyncHandler(async (req, res) => {
  const id = validate.requireId(req.params.id, 'id');
  const detail = await skillService.getSkillById(id);
  if (!detail) throw ApiError.notFound('Skill not found');
  return ok(res, detail);
});

module.exports = { listSkills, getCategories, getTrending, getDemand, getSkillById };
