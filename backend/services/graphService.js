/**
 * Knowledge graph construction.
 *
 * Node types : role | skill | company
 * Edge types :
 *   SKILL_REQUIRED_FOR  role  -> skill   (from role_skills)
 *   LEADS_TO            role  -> role    (from career_paths)
 *   SIMILAR_TO          role  <-> role   (derived from skill overlap)
 *   USED_BY             skill -> company (companies that demand the skill)
 *
 * Everything is derived from the database, so the graph reflects the dataset
 * rather than a hand-written diagram.
 */
const { query } = require('../config/db');
const { similarPairs } = require('../utils/graphAlgorithms');

const DEFAULT_SIMILARITY_THRESHOLD = 0.5;
const DEFAULT_USED_BY_LIMIT = 2;
const DEFAULT_USED_BY_MIN_SHARE = 5;

/** id helpers keep role/skill/company ids from colliding in one node list. */
const nodeId = {
  role: (id) => `role-${id}`,
  skill: (id) => `skill-${id}`,
  company: (id) => `company-${id}`,
};

async function loadRoles() {
  return query(
    `SELECT r.id, r.title, r.family, r.seniority, r.demand_score, r.is_emerging,
            r.avg_salary_min, r.avg_salary_max,
            COUNT(j.id) AS posting_count
       FROM job_roles r
       LEFT JOIN jobs j ON j.role_id = r.id
      GROUP BY r.id, r.title, r.family, r.seniority, r.demand_score, r.is_emerging,
               r.avg_salary_min, r.avg_salary_max`
  );
}

async function loadSkills() {
  return query(
    `SELECT s.id, s.name, s.category,
            COALESCE(js.posting_count, 0) AS posting_count,
            COALESCE(sd.growth_rate, 0)   AS growth_rate
       FROM skills s
       LEFT JOIN (
         SELECT skill_id, COUNT(*) AS posting_count FROM job_skills GROUP BY skill_id
       ) js ON js.skill_id = s.id
       LEFT JOIN skill_demand sd
              ON sd.skill_id = s.id
             AND sd.period = (SELECT MAX(period) FROM skill_demand)`
  );
}

async function loadCompanies() {
  return query(
    `SELECT c.id, c.name, c.industry, c.headquarters,
            COUNT(j.id) AS posting_count
       FROM companies c
       LEFT JOIN jobs j ON j.company_id = c.id
      GROUP BY c.id, c.name, c.industry, c.headquarters`
  );
}

async function loadRoleSkillEdges() {
  return query(
    `SELECT rs.role_id, rs.skill_id, rs.importance, s.name AS skill_name
       FROM role_skills rs
       JOIN skills s ON s.id = rs.skill_id`
  );
}

async function loadCareerEdges() {
  return query(
    `SELECT cp.id, cp.from_role_id, cp.to_role_id, cp.transition_type,
            cp.avg_years, cp.difficulty, cp.notes
       FROM career_paths cp`
  );
}

async function loadUsedByEdges(limit, minShare) {
  return query(
    `SELECT ranked.skill_id, ranked.company_id, ranked.posting_count
       FROM (
         SELECT t.*,
                ROW_NUMBER() OVER (PARTITION BY t.skill_id ORDER BY t.posting_count DESC) AS rn
           FROM (
             SELECT js.skill_id, c.id AS company_id, COUNT(*) AS posting_count
               FROM job_skills js
               JOIN jobs j ON j.id = js.job_id
               JOIN companies c ON c.id = j.company_id
              GROUP BY js.skill_id, c.id
           ) t
       ) ranked
      WHERE ranked.rn <= ? AND ranked.posting_count >= ?`,
    [limit, minShare]
  );
}

/** Skill name sets per role, used to derive SIMILAR_TO edges. */
async function loadRoleSkillSets() {
  const rows = await loadRoleSkillEdges();
  const sets = new Map();
  rows.forEach((row) => {
    if (!sets.has(row.role_id)) sets.set(row.role_id, new Set());
    sets.get(row.role_id).add(row.skill_name);
  });
  return sets;
}

/** Use the caller's value when it is a real number, otherwise the default. */
function pickNumber(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Build the whole graph.
 * @param {{similarityThreshold?:number, usedByLimit?:number, usedByMinShare?:number, includeCompanies?:boolean, includeSimilarTo?:boolean, minImportance?:number}} options
 */
async function buildGraph(options = {}) {
  const similarityThreshold = pickNumber(options.similarityThreshold, DEFAULT_SIMILARITY_THRESHOLD);
  const usedByLimit = pickNumber(options.usedByLimit, DEFAULT_USED_BY_LIMIT);
  const usedByMinShare = pickNumber(options.usedByMinShare, DEFAULT_USED_BY_MIN_SHARE);
  const includeCompanies = options.includeCompanies !== false;
  const includeSimilarTo = options.includeSimilarTo !== false;
  const minImportance = pickNumber(options.minImportance, 1);

  const [roles, skills, companies, roleSkillEdges, careerEdges] = await Promise.all([
    loadRoles(),
    loadSkills(),
    includeCompanies ? loadCompanies() : Promise.resolve([]),
    loadRoleSkillEdges(),
    loadCareerEdges(),
  ]);

  const roleById = new Map(roles.map((role) => [role.id, role]));
  const nodes = [];
  const edges = [];
  const degree = new Map();

  const bump = (id) => degree.set(id, (degree.get(id) || 0) + 1);

  roles.forEach((role) => {
    nodes.push({
      data: {
        id: nodeId.role(role.id),
        entityId: role.id,
        type: 'role',
        label: role.title,
        family: role.family,
        seniority: role.seniority,
        demandScore: Number(role.demand_score),
        isEmerging: Number(role.is_emerging) === 1,
        avgSalaryMin: Number(role.avg_salary_min || 0),
        avgSalaryMax: Number(role.avg_salary_max || 0),
        postingCount: Number(role.posting_count || 0),
      },
    });
  });

  const usedSkillIds = new Set();

  roleSkillEdges.forEach((row) => {
    if (row.importance < minImportance) return;
    if (!roleById.has(row.role_id)) return;
    const source = nodeId.role(row.role_id);
    const target = nodeId.skill(row.skill_id);
    edges.push({
      data: {
        id: `required-${row.role_id}-${row.skill_id}`,
        source,
        target,
        type: 'SKILL_REQUIRED_FOR',
        label: 'requires',
        importance: row.importance,
      },
    });
    usedSkillIds.add(row.skill_id);
    bump(source);
    bump(target);
  });

  // Every skill node is included even when unused, so categories stay visible.
  skills.forEach((skill) => usedSkillIds.add(skill.id));

  skills
    .filter((skill) => usedSkillIds.has(skill.id))
    .forEach((skill) => {
      nodes.push({
        data: {
          id: nodeId.skill(skill.id),
          entityId: skill.id,
          type: 'skill',
          label: skill.name,
          category: skill.category,
          postingCount: Number(skill.posting_count || 0),
          growthRate: Number(skill.growth_rate || 0),
        },
      });
    });

  careerEdges.forEach((edge) => {
    if (!roleById.has(edge.from_role_id) || !roleById.has(edge.to_role_id)) return;
    const source = nodeId.role(edge.from_role_id);
    const target = nodeId.role(edge.to_role_id);
    edges.push({
      data: {
        id: `leads-${edge.id}`,
        source,
        target,
        type: 'LEADS_TO',
        label: edge.transition_type,
        transitionType: edge.transition_type,
        avgYears: Number(edge.avg_years),
        difficulty: edge.difficulty,
        notes: edge.notes,
      },
    });
    bump(source);
    bump(target);
  });

  if (includeSimilarTo) {
    const sets = await loadRoleSkillSets();
    similarPairs(sets, similarityThreshold).forEach((pair, index) => {
      const source = nodeId.role(pair.from);
      const target = nodeId.role(pair.to);
      edges.push({
        data: {
          id: `similar-${index}-${pair.from}-${pair.to}`,
          source,
          target,
          type: 'SIMILAR_TO',
          label: `${Math.round(pair.similarity * 100)}% skills shared`,
          similarity: Number(pair.similarity.toFixed(3)),
          sharedSkills: pair.shared,
        },
      });
      bump(source);
      bump(target);
    });
  }

  if (includeCompanies) {
    const usedBy = await loadUsedByEdges(usedByLimit, usedByMinShare);
    const companyById = new Map(companies.map((company) => [company.id, company]));
    const companyIdsUsed = new Set();
    usedBy.forEach((row) => {
      if (!companyById.has(row.company_id) || !usedSkillIds.has(row.skill_id)) return;
      const source = nodeId.skill(row.skill_id);
      const target = nodeId.company(row.company_id);
      edges.push({
        data: {
          id: `usedby-${row.skill_id}-${row.company_id}`,
          source,
          target,
          type: 'USED_BY',
          label: 'used by',
          postingCount: Number(row.posting_count),
        },
      });
      companyIdsUsed.add(row.company_id);
      bump(source);
      bump(target);
    });

    companies
      .filter((company) => companyIdsUsed.has(company.id))
      .forEach((company) => {
        nodes.push({
          data: {
            id: nodeId.company(company.id),
            entityId: company.id,
            type: 'company',
            label: company.name,
            industry: company.industry,
            headquarters: company.headquarters,
            postingCount: Number(company.posting_count || 0),
          },
        });
      });
  }

  const decorated = nodes.map((node) => ({
    ...node,
    data: { ...node.data, degree: degree.get(node.data.id) || 0 },
  }));

  const nodeIds = new Set(decorated.map((node) => node.data.id));
  const validEdges = edges.filter(
    (edge) => nodeIds.has(edge.data.source) && nodeIds.has(edge.data.target)
  );

  return {
    nodes: decorated,
    edges: validEdges,
    meta: summarize(decorated, validEdges, {
      similarityThreshold,
      usedByLimit,
      usedByMinShare,
      minImportance,
    }),
  };
}

function summarize(nodes, edges, options) {
  const countBy = (items, key) =>
    items.reduce((acc, item) => {
      const value = item.data[key];
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {});

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodesByType: countBy(nodes, 'type'),
    edgesByType: countBy(edges, 'type'),
    edgeDefinitions: [
      { type: 'SKILL_REQUIRED_FOR', direction: 'role -> skill', source: 'role_skills table' },
      { type: 'LEADS_TO', direction: 'role -> role', source: 'career_paths table' },
      {
        type: 'SIMILAR_TO',
        direction: 'role <-> role',
        source: `derived from skill overlap, Jaccard >= ${options.similarityThreshold}`,
      },
      {
        type: 'USED_BY',
        direction: 'skill -> company',
        source: `top ${options.usedByLimit} employers per skill with >= ${options.usedByMinShare} postings`,
      },
    ],
    options,
  };
}

/**
 * Neighbourhood of one node, up to `depth` hops, in any direction.
 * Used by the "explore connections" interaction in the UI.
 */
async function getNeighbours({ type, id, depth = 1, similarityThreshold }) {
  const graph = await buildGraph({ similarityThreshold });
  const startId = `${type}-${id}`;

  const adjacency = new Map();
  graph.edges.forEach((edge) => {
    const { source, target } = edge.data;
    if (!adjacency.has(source)) adjacency.set(source, []);
    if (!adjacency.has(target)) adjacency.set(target, []);
    adjacency.get(source).push({ id: target, edge });
    adjacency.get(target).push({ id: source, edge });
  });

  if (!adjacency.has(startId)) return null;

  const visited = new Set([startId]);
  let frontier = [startId];
  const collectedEdges = new Map();

  for (let level = 0; level < depth; level += 1) {
    const next = [];
    frontier.forEach((current) => {
      (adjacency.get(current) || []).forEach((link) => {
        collectedEdges.set(link.edge.data.id, link.edge);
        if (!visited.has(link.id)) {
          visited.add(link.id);
          next.push(link.id);
        }
      });
    });
    frontier = next;
  }

  const nodeById = new Map(graph.nodes.map((node) => [node.data.id, node]));

  return {
    center: nodeById.get(startId) || null,
    nodes: Array.from(visited)
      .map((nodeId) => nodeById.get(nodeId))
      .filter(Boolean),
    edges: Array.from(collectedEdges.values()),
  };
}

/** Counts only, for the graph page header. */
async function getGraphStats() {
  const graph = await buildGraph();
  return graph.meta;
}

module.exports = {
  nodeId,
  buildGraph,
  getNeighbours,
  getGraphStats,
  loadRoleSkillSets,
};
