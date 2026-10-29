/**
 * Analysis constants shared by the API layer.
 *
 * These mirror the windows used by python-analysis/generate_seed.py when it
 * builds data/skill_demand.csv, so the API can label the trend comparison
 * honestly instead of inventing labels.
 *
 * growth_rate on every skill_demand row is the change in a skill's *share* of
 * postings between BASELINE_PERIODS and RECENT_PERIODS, expressed as a percent,
 * and is only non-zero when a two-proportion z-test found the change
 * statistically significant (|z| >= 2.58) on at least MIN_TREND_SAMPLE postings.
 */
const TREND = {
  baselinePeriods: ['2025-Q1', '2025-Q2', '2025-Q3'],
  recentPeriods: ['2026-Q1', '2026-Q2', '2026-Q3'],
  significanceZ: 2.58,
  minSample: 30,
};

const DISCLAIMER =
  'All job, salary and company figures in this application come from a SYNTHETIC ' +
  'SAMPLE dataset generated for academic work. They are not live job market ' +
  'statistics and must not be used for real career or investment decisions.';

// Employment types / seniority levels understood by the schema.
const EMPLOYMENT_TYPES = ['Full-time', 'Contract', 'Internship'];
const SENIORITY_LEVELS = ['Entry', 'Mid', 'Senior', 'Lead'];
const PROFICIENCY_LEVELS = ['beginner', 'intermediate', 'advanced'];
const TRANSITION_TYPES = ['vertical', 'lateral', 'pivot'];

module.exports = {
  TREND,
  DISCLAIMER,
  EMPLOYMENT_TYPES,
  SENIORITY_LEVELS,
  PROFICIENCY_LEVELS,
  TRANSITION_TYPES,
};
