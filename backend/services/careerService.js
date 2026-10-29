/**
 * Career path analytics.
 *
 * Given a current role, a target role and the skills a user already has, this
 * service:
 *   1. builds the LEADS_TO role graph from career_paths,
 *   2. finds the cheapest route with Dijkstra (cost = difficulty + 0.5 * years),
 *   3. enumerates alternative routes,
 *   4. computes the skill gap against the target role,
 *   5. turns all of that into a step by step roadmap.
 *
 * If the dataset contains no LEADS_TO route between the two roles, the service
 * falls back to the SIMILAR_TO graph (roles that share many skills) and says so
 * explicitly in the response instead of inventing a path.
 */
const { query, queryOne } = require('../config/db');
const { buildAdjacency, dijkstra, rankPaths, similarPairs } = require('../utils/graphAlgorithms');
const { TREND } = require('../config/analytics');

// Relative importance of "how hard" vs "how long" when costing a transition.
const WEIGHT_DIFFICULTY = 1.0;
const WEIGHT_YEARS = 0.5;

const SIMILARITY_THRESHOLD = 0.45;

function edgeWeight(edge) {
  return Number(edge.difficulty || 3) * WEIGHT_DIFFICULTY + Number(edge.avg_years || 2) * WEIGHT_YEARS;
}

/** Roles for the dropdowns, plus the skill vocabulary for autocomplete. */
async function getOptions() {
  const [roles, skills, families] = await Promise.all([
    query(
      `SELECT r.id, r.title, r.family, r.seniority, r.description,
              r.avg_salary_min, r.avg_salary_max, r.demand_score, r.is_emerging,
              COUNT(j.id) AS posting_count
         FROM job_roles r
         LEFT JOIN jobs j ON j.role_id = r.id
        GROUP BY r.id, r.title, r.family, r.seniority, r.description,
                 r.avg_salary_min, r.avg_salary_max, r.demand_score, r.is_emerging
        ORDER BY r.family ASC, r.seniority ASC, r.title ASC`
    ),
    query(`SELECT id, name, category FROM skills ORDER BY category ASC, name ASC`),
    query(`SELECT DISTINCT family FROM job_roles ORDER BY family ASC`),
  ]);

  return {
    roles,
    skills,
    families: families.map((row) => row.family),
  };
}

/** Load the inputs every career computation needs, in four queries. */
async function loadCareerContext() {
  const [roles, roleSkills, careerEdges, skillMarket, totals] = await Promise.all([
    query(
      `SELECT r.id, r.title, r.family, r.seniority, r.description,
              r.avg_salary_min, r.avg_salary_max, r.demand_score, r.is_emerging,
              COUNT(j.id) AS posting_count,
              ROUND(AVG((j.salary_min + j.salary_max) / 2)) AS avg_salary
         FROM job_roles r
         LEFT JOIN jobs j ON j.role_id = r.id
        GROUP BY r.id, r.title, r.family, r.seniority, r.description,
                 r.avg_salary_min, r.avg_salary_max, r.demand_score, r.is_emerging`
    ),
    query(
      `SELECT rs.role_id, s.id AS skill_id, s.name, s.category, rs.importance
         FROM role_skills rs
         JOIN skills s ON s.id = rs.skill_id
        ORDER BY rs.role_id, rs.importance DESC`
    ),
    query(
      `SELECT cp.from_role_id, cp.to_role_id, cp.transition_type, cp.avg_years,
              cp.difficulty, cp.notes
         FROM career_paths cp`
    ),
    query(
      `SELECT s.id AS skill_id, s.name,
              COALESCE(js.posting_count, 0) AS posting_count,
              COALESCE(sd.growth_rate, 0)   AS growth_rate,
              COALESCE(sd.z_score, 0)       AS z_score
         FROM skills s
         LEFT JOIN (
           SELECT skill_id, COUNT(*) AS posting_count FROM job_skills GROUP BY skill_id
         ) js ON js.skill_id = s.id
         LEFT JOIN skill_demand sd
                ON sd.skill_id = s.id
               AND sd.period = (SELECT MAX(period) FROM skill_demand)`
    ),
    queryOne(`SELECT COUNT(*) AS total_jobs FROM jobs`),
  ]);

  const roleById = new Map(roles.map((role) => [role.id, role]));
  const skillsByRole = new Map();
  roleSkills.forEach((row) => {
    if (!skillsByRole.has(row.role_id)) skillsByRole.set(row.role_id, []);
    skillsByRole.get(row.role_id).push(row);
  });
  const marketBySkillName = new Map(skillMarket.map((row) => [row.name.toLowerCase(), row]));

  return {
    roles,
    roleById,
    skillsByRole,
    careerEdges,
    marketBySkillName,
    totalJobs: Number(totals.total_jobs) || 0,
  };
}

/**
 * LEADS_TO adjacency.
 *
 * The raw career_paths row is spread into each graph edge so the traversal can
 * read difficulty / avg_years / notes back off the returned path.
 */
function buildRoleAdjacency(careerEdges) {
  const edges = careerEdges.map((edge) => ({
    ...edge,
    from: edge.from_role_id,
    to: edge.to_role_id,
    weight: edgeWeight(edge),
  }));
  // Directed graph: career transitions are usually progressive. A reverse
  // traversal is offered separately via the SIMILAR_TO fallback.
  return buildAdjacency(edges, { directed: true });
}

/** Undirected similarity graph, used when there is no LEADS_TO route. */
async function buildSimilarityAdjacency(context, threshold = SIMILARITY_THRESHOLD) {
  const sets = new Map();
  context.skillsByRole.forEach((skills, roleId) => {
    sets.set(roleId, new Set(skills.map((skill) => skill.name)));
  });
  const pairs = similarPairs(sets, threshold);
  const edges = pairs.map((pair) => ({
    from: pair.from,
    to: pair.to,
    // Closer skill overlap = cheaper move.
    weight: 1 + (1 - pair.similarity) * 3,
    similarity: Number(pair.similarity.toFixed(3)),
    sharedSkills: pair.shared,
    transition_type: 'similarity',
    difficulty: Math.max(1, Math.round((1 - pair.similarity) * 5)),
    avg_years: Number((1 + (1 - pair.similarity) * 2).toFixed(1)),
    notes: `Shares ${pair.shared.length} skills with the current role.`,
  }));
  return buildAdjacency(edges, { directed: false });
}

/**
 * Skill gap between the skills a user has and the skills a role requires.
 * @returns {{missing:Array, transferable:Array, readiness:number, weightedCoverage:number}}
 */
function computeSkillGap(context, roleId, currentSkillNames) {
  const required = context.skillsByRole.get(roleId) || [];
  const current = new Set(currentSkillNames.map((name) => name.toLowerCase()));

  const missing = [];
  const transferable = [];
  let totalWeight = 0;
  let coveredWeight = 0;

  required.forEach((skill) => {
    const weight = Number(skill.importance) || 1;
    totalWeight += weight;
    const market = context.marketBySkillName.get(skill.name.toLowerCase()) || {
      posting_count: 0,
      growth_rate: 0,
      z_score: 0,
    };
    const entry = {
      skill_id: skill.skill_id,
      name: skill.name,
      category: skill.category,
      importance: Number(skill.importance),
      posting_count: Number(market.posting_count || 0),
      demand_share: context.totalJobs
        ? Number(((market.posting_count / context.totalJobs) * 100).toFixed(2))
        : 0,
      growth_rate: Number(market.growth_rate || 0),
      z_score: Number(market.z_score || 0),
      trend:
        Math.abs(Number(market.z_score || 0)) >= TREND.significanceZ
          ? Number(market.growth_rate) > 0
            ? 'emerging'
            : 'declining'
          : 'stable',
    };

    if (current.has(skill.name.toLowerCase())) {
      coveredWeight += weight;
      transferable.push(entry);
    } else {
      missing.push(entry);
    }
  });

  // Priority = how core the skill is for the role, adjusted by real demand and
  // by whether the skill is gaining or losing share in the dataset.
  const scored = missing.map((entry) => {
    const demandPoints = Math.min(15, Math.round(entry.demand_share * 3));
    const trendPoints = entry.trend === 'emerging' ? 5 : entry.trend === 'declining' ? -4 : 0;
    const priorityScore = entry.importance * 10 + demandPoints + trendPoints;
    const priorityLabel =
      entry.importance >= 5 ? 'critical' : entry.importance === 4 ? 'high' : entry.importance === 3 ? 'medium' : 'low';
    return {
      ...entry,
      priorityScore,
      priorityLabel,
      reason: explainSkill(entry, priorityLabel),
    };
  });

  scored.sort(
    (a, b) => b.priorityScore - a.priorityScore || a.name.localeCompare(b.name)
  );

  const readiness = totalWeight === 0 ? 100 : Math.round((coveredWeight / totalWeight) * 100);

  return {
    missing: scored,
    transferable: transferable.sort((a, b) => b.importance - a.importance),
    readiness,
    requiredSkillCount: required.length,
    heldSkillCount: transferable.length,
  };
}

function explainSkill(entry, priorityLabel) {
  const parts = [];
  parts.push(
    `${priorityLabel === 'critical' ? 'Core requirement' : 'Required'} (importance ${entry.importance}/5) for this role.`
  );
  if (entry.posting_count > 0) {
    parts.push(
      `Appears in ${entry.posting_count.toLocaleString('en-IN')} sample postings (${entry.demand_share}% of the dataset).`
    );
  }
  if (entry.trend === 'emerging') {
    parts.push(
      `Emerging: share of postings changed by ${entry.growth_rate}% between the baseline and recent quarters (z = ${entry.z_score}).`
    );
  } else if (entry.trend === 'declining') {
    parts.push(
      `Declining: share of postings changed by ${entry.growth_rate}% (z = ${entry.z_score}); learn it for the role but expect lower market momentum.`
    );
  }
  return parts;
}

/** Turn a path plus a skill gap into an ordered plan. */
function buildRoadmap({ context, nodes, edges, targetGap, currentSkillNames, fallbackUsed }) {
  const steps = [];
  const acquired = new Set(currentSkillNames.map((name) => name.toLowerCase()));
  let cumulativeYears = 0;

  for (let i = 0; i < nodes.length - 1; i += 1) {
    const fromRole = context.roleById.get(nodes[i]);
    const toRole = context.roleById.get(nodes[i + 1]);
    const edge = edges[i];
    cumulativeYears += Number(edge.avg_years || 0);

    const gap = computeSkillGap(context, toRole.id, Array.from(acquired));
    gap.missing.slice(0, 5).forEach((skill) => acquired.add(skill.name.toLowerCase()));

    steps.push({
      step: i + 1,
      fromRole: {
        id: fromRole.id,
        title: fromRole.title,
        family: fromRole.family,
        seniority: fromRole.seniority,
      },
      toRole: {
        id: toRole.id,
        title: toRole.title,
        family: toRole.family,
        seniority: toRole.seniority,
        avgSalaryMin: Number(toRole.avg_salary_min || 0),
        avgSalaryMax: Number(toRole.avg_salary_max || 0),
        demandScore: Number(toRole.demand_score || 0),
      },
      transitionType: edge.transition_type,
      avgYears: Number(edge.avg_years || 0),
      difficulty: Number(edge.difficulty || 3),
      notes: edge.notes || null,
      similarity: edge.similarity !== undefined ? edge.similarity : null,
      cumulativeYears: Number(cumulativeYears.toFixed(1)),
      skillsToAcquire: gap.missing.slice(0, 6),
      readinessBeforeMove: gap.readiness,
    });
  }

  const phases = [];
  const byImportance = (value) => targetGap.missing.filter((skill) => skill.importance === value);

  if (byImportance(5).length > 0) {
    phases.push({
      id: 'phase-1',
      title: 'Close the critical skill gaps',
      timeframe: 'First 3 months',
      focusSkills: byImportance(5).map((skill) => skill.name),
      actions: [
        'Work through one structured course or book per critical skill.',
        'Re-implement the skill on a dataset of your own and publish the notebook or repository.',
        `Target role needs these in nearly every posting: ${byImportance(5).map((skill) => skill.name).join(', ')}.`,
      ],
    });
  }
  if (byImportance(4).length > 0) {
    phases.push({
      id: 'phase-2',
      title: 'Build supporting depth',
      timeframe: 'Months 3 to 6',
      focusSkills: byImportance(4).map((skill) => skill.name),
      actions: [
        'Add these to the same project so the skills appear together in your portfolio.',
        'Practise interview style questions for each skill.',
      ],
    });
  }
  const lower = targetGap.missing.filter((skill) => skill.importance <= 3);
  if (lower.length > 0) {
    phases.push({
      id: 'phase-3',
      title: 'Round out your profile',
      timeframe: 'Months 6 to 12',
      focusSkills: lower.map((skill) => skill.name),
      actions: [
        'Pick up these as needed while applying, rather than blocking your applications on them.',
        'Confirm current usage in job postings before investing heavily.',
      ],
    });
  }

  if (steps.length > 0) {
    phases.push({
      id: 'phase-4',
      title: `Move into ${context.roleById.get(nodes[nodes.length - 1]).title}`,
      timeframe: `About ${cumulativeYears.toFixed(1)} years of deliberate preparation`,
      focusSkills: [],
      actions: [
        'Rewrite your resume around the target role vocabulary from this roadmap.',
        'Apply to the intermediate roles listed in the steps, not only the final role.',
        fallbackUsed
          ? 'No direct transition edge exists in the dataset, so this route is based on skill similarity. Treat it as a suggestion.'
          : 'Highlight the transition edges you have already completed on your profile.',
      ],
    });
  }

  return { phases, steps, totalYears: Number(cumulativeYears.toFixed(1)), fallbackUsed };
}

/**
 * Main entry point for the Career Path page.
 * @param {{fromRoleId:number, toRoleId:number, currentSkills:string[]}} input
 */
async function findCareerPath(input) {
  const context = await loadCareerContext();

  const fromRole = context.roleById.get(input.fromRoleId);
  const toRole = context.roleById.get(input.toRoleId);
  if (!fromRole) return { notFound: 'fromRole' };
  if (!toRole) return { notFound: 'toRole' };

  const currentSkills = input.currentSkills || [];
  const adjacency = buildRoleAdjacency(context.careerEdges);

  let route = dijkstra(adjacency, fromRole.id, toRole.id);
  let fallbackUsed = false;
  let alternatives = rankPaths(adjacency, fromRole.id, toRole.id, { maxDepth: 4, limit: 3 });

  if (!route) {
    const similarityAdjacency = await buildSimilarityAdjacency(context);
    route = dijkstra(similarityAdjacency, fromRole.id, toRole.id);
    fallbackUsed = Boolean(route);
    alternatives = rankPaths(similarityAdjacency, fromRole.id, toRole.id, {
      maxDepth: 4,
      limit: 3,
    });
  }

  const targetGap = computeSkillGap(context, toRole.id, currentSkills);
  const currentGap = computeSkillGap(context, fromRole.id, currentSkills);

  const decoratePath = (path) =>
    path.nodes.map((roleId) => {
      const role = context.roleById.get(roleId);
      return {
        id: role.id,
        title: role.title,
        family: role.family,
        seniority: role.seniority,
        demandScore: Number(role.demand_score || 0),
        avgSalaryMin: Number(role.avg_salary_min || 0),
        avgSalaryMax: Number(role.avg_salary_max || 0),
        postingCount: Number(role.posting_count || 0),
      };
    });

  if (!route) {
    return {
      fromRole,
      toRole,
      reachable: false,
      fallbackUsed: false,
      message:
        'No transition route connects these two roles in the sample dataset, and their skills are not similar enough for a suggested route either. Try a different target role.',
      currentRoleGap: currentGap,
      targetRoleGap: targetGap,
      path: decoratePath({ nodes: [fromRole.id], edges: [] }),
      alternatives: [],
      roadmap: { phases: [], steps: [], totalYears: 0, fallbackUsed: false },
    };
  }

  const roadmap = buildRoadmap({
    context,
    nodes: route.nodes,
    edges: route.edges,
    targetGap,
    currentSkillNames: currentSkills,
    fallbackUsed,
  });

  const learningPriorities = targetGap.missing.slice(0, 5).map((skill) => ({
    name: skill.name,
    category: skill.category,
    importance: skill.importance,
    priorityLabel: skill.priorityLabel,
    priorityScore: skill.priorityScore,
    demandShare: skill.demand_share,
    trend: skill.trend,
    reason: skill.reason,
  }));

  return {
    fromRole: {
      id: fromRole.id,
      title: fromRole.title,
      family: fromRole.family,
      seniority: fromRole.seniority,
      demandScore: Number(fromRole.demand_score || 0),
    },
    toRole: {
      id: toRole.id,
      title: toRole.title,
      family: toRole.family,
      seniority: toRole.seniority,
      demandScore: Number(toRole.demand_score || 0),
    },
    reachable: true,
    directTransition: route.nodes.length === 2,
    fallbackUsed,
    routeType: fallbackUsed ? 'skill-similarity' : 'career-path',
    hops: route.nodes.length - 1,
    totalCost: Number(route.cost.toFixed(2)),
    costModel: {
      description: 'Each transition costs difficulty + 0.5 x average years.',
      difficultyWeight: WEIGHT_DIFFICULTY,
      yearsWeight: WEIGHT_YEARS,
    },
    path: decoratePath(route),
    steps: roadmap.steps,
    roadmap: roadmap.phases,
    totalYears: roadmap.totalYears,
    targetRoleGap: {
      readiness: targetGap.readiness,
      requiredSkillCount: targetGap.requiredSkillCount,
      heldSkillCount: targetGap.heldSkillCount,
      transferableSkills: targetGap.transferable,
      missingSkills: targetGap.missing,
    },
    currentRoleGap: {
      readiness: currentGap.readiness,
      requiredSkillCount: currentGap.requiredSkillCount,
      heldSkillCount: currentGap.heldSkillCount,
      missingSkills: currentGap.missing,
    },
    learningPriorities,
    alternatives: alternatives.map((path) => ({
      hops: path.nodes.length - 1,
      cost: Number(path.cost.toFixed(2)),
      roles: decoratePath(path),
    })),
  };
}

/** Role-level graph for the "career map" panel on the career page. */
async function getCareerMap() {
  const context = await loadCareerContext();
  const nodes = context.roles.map((role) => ({
    id: role.id,
    title: role.title,
    family: role.family,
    seniority: role.seniority,
    demandScore: Number(role.demand_score || 0),
    postingCount: Number(role.posting_count || 0),
    avgSalaryMin: Number(role.avg_salary_min || 0),
    avgSalaryMax: Number(role.avg_salary_max || 0),
  }));
  const edges = context.careerEdges.map((edge) => ({
    from: edge.from_role_id,
    to: edge.to_role_id,
    type: edge.transition_type,
    avgYears: Number(edge.avg_years),
    difficulty: Number(edge.difficulty),
    notes: edge.notes,
  }));
  return { nodes, edges, families: Array.from(new Set(nodes.map((node) => node.family))).sort() };
}

module.exports = { getOptions, findCareerPath, getCareerMap, computeSkillGap, loadCareerContext };
