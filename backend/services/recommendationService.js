/**
 * Skill recommendations.
 *
 * Recommendations are driven by three real signals from the dataset:
 *   1. the target role's required skills (role_skills.importance),
 *   2. how often each skill is mentioned across postings (job_skills),
 *   3. whether the skill is gaining or losing share (skill_demand growth_rate).
 *
 * Each recommendation explains *why* it was made, and the list is ordered so the
 * most valuable gaps come first.
 */
const { query } = require('../config/db');
const { TREND } = require('../config/analytics');
const careerService = require('./careerService');

const PRIORITY_WEIGHT = { critical: 4, high: 3, medium: 2, low: 1 };

function buildExplanation(skill, roleTitle) {
  const explanation = [
    `Required by "${roleTitle}" (importance ${skill.importance} out of 5).`,
  ];
  if (skill.posting_count > 0) {
    explanation.push(
      `Mentioned in ${skill.posting_count.toLocaleString('en-IN')} of the sample postings (${skill.demand_share}%).`
    );
  } else {
    explanation.push('Required by the role definition, though it is rare in the current postings sample.');
  }
  if (skill.trend === 'emerging') {
    explanation.push(
      `Demand is growing: share of postings changed by ${skill.growth_rate}% between ${TREND.baselinePeriods.join(', ')} and ${TREND.recentPeriods.join(', ')} (z = ${skill.z_score}).`
    );
  } else if (skill.trend === 'declining') {
    explanation.push(
      `Demand is shrinking (${skill.growth_rate}%, z = ${skill.z_score}). Still required for the role, but do not over-invest.`
    );
  } else {
    explanation.push('Demand is stable across the recorded quarters.');
  }
  return explanation;
}

/**
 * Recommend the skills a user should learn next.
 * @param {{targetRoleId:number, currentSkills:string[], limit?:number}} input
 */
async function recommendSkills(input) {
  const context = await careerService.loadCareerContext();
  const targetRole = context.roleById.get(input.targetRoleId);
  if (!targetRole) return { notFound: 'targetRoleId' };

  const gap = careerService.computeSkillGap(context, targetRole.id, input.currentSkills || []);
  const limit = input.limit || 10;

  const recommendations = gap.missing.slice(0, limit).map((skill, index) => ({
    rank: index + 1,
    name: skill.name,
    category: skill.category,
    importance: skill.importance,
    priorityLabel: skill.priorityLabel,
    priorityScore: skill.priorityScore,
    postingCount: skill.posting_count,
    demandShare: skill.demand_share,
    growthRate: skill.growth_rate,
    trend: skill.trend,
    reason: buildExplanation(skill, targetRole.title),
  }));

  const byCategory = recommendations.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});

  return {
    targetRole: {
      id: targetRole.id,
      title: targetRole.title,
      family: targetRole.family,
      seniority: targetRole.seniority,
      demandScore: Number(targetRole.demand_score || 0),
      postingCount: Number(targetRole.posting_count || 0),
      avgSalary: Number(targetRole.avg_salary || targetRole.avg_salary_min || 0),
    },
    readiness: gap.readiness,
    requiredSkillCount: gap.requiredSkillCount,
    heldSkillCount: gap.heldSkillCount,
    alreadyHave: gap.transferable.map((skill) => ({
      name: skill.name,
      category: skill.category,
      importance: skill.importance,
    })),
    totalGaps: gap.missing.length,
    recommendations,
    recommendationsByCategory: byCategory,
    notes: [
      'Priorities are ordered by role importance first, then by how often the skill appears in postings, then by market trend.',
      'Items marked "declining" are still part of the role definition but have lower market momentum in this dataset.',
    ],
  };
}

/**
 * Score every role against the skills a user already has.
 * Useful as a "where could I go next" starting point.
 */
async function recommendRoles({ currentSkills = [], limit = 8, excludeRoleId = null } = {}) {
  const context = await careerService.loadCareerContext();
  const current = new Set(currentSkills.map((name) => name.toLowerCase()));

  const scored = context.roles
    .filter((role) => role.id !== Number(excludeRoleId))
    .map((role) => {
      const required = context.skillsByRole.get(role.id) || [];
      let totalWeight = 0;
      let coveredWeight = 0;
      const matched = [];
      const missing = [];

      required.forEach((skill) => {
        const weight = Number(skill.importance) || 1;
        totalWeight += weight;
        if (current.has(skill.name.toLowerCase())) {
          coveredWeight += weight;
          matched.push(skill.name);
        } else {
          missing.push(skill.name);
        }
      });

      const coverage = totalWeight === 0 ? 0 : (coveredWeight / totalWeight) * 100;
      const demand = Number(role.demand_score || 0);
      // Fit blends how ready the user already is with how in-demand the role is.
      const fitScore = Number((coverage * 0.65 + demand * 0.35).toFixed(2));

      return {
        id: role.id,
        title: role.title,
        family: role.family,
        seniority: role.seniority,
        demandScore: demand,
        postingCount: Number(role.posting_count || 0),
        avgSalaryMin: Number(role.avg_salary_min || 0),
        avgSalaryMax: Number(role.avg_salary_max || 0),
        skillCoverage: Number(coverage.toFixed(1)),
        matchedSkills: matched,
        missingSkills: missing,
        fitScore,
      };
    })
    .filter((role) => role.matchedSkills.length > 0 || currentSkills.length === 0)
    .sort((a, b) => b.fitScore - a.fitScore || b.demandScore - a.demandScore)
    .slice(0, limit);

  return {
    basedOnSkills: currentSkills,
    totalJobs: context.totalJobs,
    roles: scored,
  };
}

/** Most frequently required skills overall, for the "popular skills" panel. */
async function getPopularSkills(limit = 15) {
  return query(
    `SELECT s.id, s.name, s.category,
            COUNT(*) AS posting_count,
            ROUND(AVG(js.importance), 2) AS avg_importance
       FROM job_skills js
       JOIN skills s ON s.id = js.skill_id
      GROUP BY s.id, s.name, s.category
      ORDER BY posting_count DESC, s.name ASC
      LIMIT ?`,
    [limit]
  );
}

module.exports = { recommendSkills, recommendRoles, getPopularSkills, PRIORITY_WEIGHT };
