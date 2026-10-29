/**
 * Job market intelligence endpoints: search, filters and job detail.
 */
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/respond');
const ApiError = require('../utils/ApiError');
const validate = require('../middleware/validate');
const jobService = require('../services/jobService');
const { EMPLOYMENT_TYPES } = require('../config/analytics');

/** GET /api/jobs */
const listJobs = asyncHandler(async (req, res) => {
  const pagination = validate.toPagination(req.query);

  const filters = {
    q: validate.optionalString(req.query.q, 'q', { max: 120 }),
    roleId: validate.toInt(req.query.roleId, 'roleId', { min: 1 }),
    roleTitle: validate.optionalString(req.query.role, 'role', { max: 120 }),
    location: validate.optionalString(req.query.location, 'location', { max: 120 }),
    companyId: validate.toInt(req.query.companyId, 'companyId', { min: 1 }),
    employmentType: validate.toEnum(req.query.employmentType, 'employmentType', EMPLOYMENT_TYPES),
    experienceMin: validate.toInt(req.query.experienceMin, 'experienceMin', { min: 0, max: 50 }),
    experienceMax: validate.toInt(req.query.experienceMax, 'experienceMax', { min: 0, max: 50 }),
    salaryMin: validate.toInt(req.query.salaryMin, 'salaryMin', { min: 0 }),
    salaryMax: validate.toInt(req.query.salaryMax, 'salaryMax', { min: 0 }),
    skills: validate.toStringList(req.query.skills),
  };

  if (
    filters.experienceMin !== null &&
    filters.experienceMax !== null &&
    filters.experienceMin > filters.experienceMax
  ) {
    throw ApiError.badRequest('"experienceMin" cannot be greater than "experienceMax"');
  }
  if (filters.salaryMin !== null && filters.salaryMax !== null && filters.salaryMin > filters.salaryMax) {
    throw ApiError.badRequest('"salaryMin" cannot be greater than "salaryMax"');
  }

  const result = await jobService.listJobs(filters, {
    ...pagination,
    sortBy: validate.toEnum(
      req.query.sortBy,
      'sortBy',
      ['date', 'salary', 'experience', 'title', 'company', 'relevance'],
      { default: 'date' }
    ),
    sortDir: validate.toSortDirection(req.query.sortDir, 'desc'),
  });

  return ok(res, result.items, {
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
    appliedFilters: filters,
  });
});

/** GET /api/jobs/filters */
const getFilterOptions = asyncHandler(async (req, res) => {
  const options = await jobService.getFilterOptions();
  return ok(res, options);
});

/** GET /api/jobs/:id */
const getJobById = asyncHandler(async (req, res) => {
  const id = validate.requireId(req.params.id, 'id');
  const result = await jobService.getJobById(id);
  if (!result) throw ApiError.notFound('Job posting not found');
  return ok(res, result);
});

module.exports = { listJobs, getFilterOptions, getJobById };
