/**
 * Knowledge graph endpoints (Cytoscape-ready node/edge payloads).
 */
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/respond');
const ApiError = require('../utils/ApiError');
const validate = require('../middleware/validate');
const graphService = require('../services/graphService');

const NODE_TYPES = ['role', 'skill', 'company'];

/** GET /api/graph */
const getGraph = asyncHandler(async (req, res) => {
  const graph = await graphService.buildGraph({
    similarityThreshold: validate.toNumber(req.query.similarityThreshold, 'similarityThreshold', {
      min: 0,
      max: 1,
    }),
    usedByLimit: validate.toInt(req.query.usedByLimit, 'usedByLimit', { min: 1, max: 10 }),
    usedByMinShare: validate.toInt(req.query.usedByMinShare, 'usedByMinShare', { min: 1 }),
    includeCompanies: req.query.includeCompanies !== 'false',
    includeSimilarTo: req.query.includeSimilarTo !== 'false',
    minImportance: validate.toInt(req.query.minImportance, 'minImportance', { min: 1, max: 5 }),
  });

  return ok(res, graph, {
    format: 'cytoscape',
    note: 'Nodes and edges are built from the role_skills, career_paths and job_skills tables.',
  });
});

/** GET /api/graph/stats */
const getStats = asyncHandler(async (req, res) => {
  const stats = await graphService.getGraphStats();
  return ok(res, stats);
});

/** GET /api/graph/neighbours?type=role&id=1&depth=2 */
const getNeighbours = asyncHandler(async (req, res) => {
  const type = validate.toEnum(req.query.type, 'type', NODE_TYPES, { required: true });
  const id = validate.requireId(req.query.id, 'id');
  const depth = validate.toInt(req.query.depth, 'depth', { default: 1, min: 1, max: 3 });

  const result = await graphService.getNeighbours({ type, id, depth });
  if (!result) throw ApiError.notFound(`No ${type} node found with id ${id}`);
  return ok(res, result);
});

module.exports = { getGraph, getStats, getNeighbours };
