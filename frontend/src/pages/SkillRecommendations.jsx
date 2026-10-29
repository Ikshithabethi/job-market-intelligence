/**
 * Skill Recommendations.
 *
 * Two questions on one page:
 *   "Which skills should I learn for this role?"  -> POST /api/recommendations/skills
 *   "Which roles fit the skills I already have?"  -> POST /api/recommendations/roles
 *
 * The API explains each recommendation, so the interface never has to invent a
 * reason for a suggestion.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { careerApi, recommendationApi, userApi } from '../services/api';
import useApiData from '../hooks/useApiData';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, PageHeader, StatCard } from '../components/Surface.jsx';
import { HorizontalBarChart } from '../components/Charts.jsx';
import { RoleSelect } from '../components/RoleSelect.jsx';
import { SkillPicker } from '../components/SkillPicker.jsx';
import { DataTable } from '../components/DataTable.jsx';
import {
  EmptyBlock,
  ErrorBlock,
  InfoBanner,
  LoadingBlock,
  PriorityBadge,
  ProgressBar,
  SampleDataBanner,
  TrendBadge,
} from '../components/StateBlocks.jsx';
import { formatCompact, formatNumber, formatPercent } from '../utils/format';

export default function SkillRecommendations() {
  const { isAuthenticated } = useAuth();

  const options = useApiData((signal) => careerApi.options(signal), []);
  const popular = useApiData((signal) => recommendationApi.popularSkills({ limit: 12 }, signal), []);
  const profileSkills = useApiData((signal) => userApi.skills(signal), [], {
    enabled: isAuthenticated,
  });

  const [targetRoleId, setTargetRoleId] = useState(null);
  const [skills, setSkills] = useState([]);
  const [skillResult, setSkillResult] = useState(null);
  const [roleResult, setRoleResult] = useState(null);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [skillError, setSkillError] = useState(null);
  const [roleError, setRoleError] = useState(null);
  const prefilled = useRef(false);

  const roles = (options.data && options.data.roles) || [];
  const vocabulary = (options.data && options.data.skills) || [];

  useEffect(() => {
    if (roles.length === 0 || targetRoleId !== null) return;
    const engineer = roles.find((role) => role.title === 'Data Engineer');
    setTargetRoleId(engineer ? engineer.id : roles[0].id);
  }, [roles, targetRoleId]);

  useEffect(() => {
    if (prefilled.current) return;
    if (!profileSkills.data || profileSkills.data.length === 0) return;
    prefilled.current = true;
    setSkills(profileSkills.data.map((entry) => entry.name));
  }, [profileSkills.data]);

  const getRecommendations = useCallback(async () => {
    if (!targetRoleId) {
      setSkillError(new Error('Choose a target role first.'));
      return;
    }
    setLoadingSkills(true);
    setSkillError(null);
    try {
      const { data } = await recommendationApi.skills({
        targetRoleId,
        currentSkills: skills,
        limit: 15,
      });
      setSkillResult(data);
    } catch (error) {
      setSkillResult(null);
      setSkillError(error);
    } finally {
      setLoadingSkills(false);
    }
  }, [targetRoleId, skills]);

  const matchRoles = useCallback(async () => {
    setLoadingRoles(true);
    setRoleError(null);
    try {
      const { data } = await recommendationApi.roles({ currentSkills: skills, limit: 10 });
      setRoleResult(data);
    } catch (error) {
      setRoleResult(null);
      setRoleError(error);
    } finally {
      setLoadingRoles(false);
    }
  }, [skills]);

  return (
    <div>
      <PageHeader
        title="Skill Recommendations"
        subtitle="Prioritised skill gaps for a target role, and the roles that best match the skills you already have."
      />

      <SampleDataBanner disclaimer="Demand and trend figures are counted from the sample postings." />

      {options.loading && <LoadingBlock message="Loading roles and skills..." />}
      {options.error && <ErrorBlock error={options.error} onRetry={options.reload} />}

      {!options.loading && !options.error && roles.length === 0 && (
        <EmptyBlock message="No roles were returned. Load the dataset with 'npm run seed' in the backend folder." />
      )}

      {!options.loading && !options.error && roles.length > 0 && (
        <>
          <Card
            title="Your profile for this analysis"
            note="Nothing is stored unless you are logged in and save it on the Profile page."
          >
            <div className="grid grid-2">
              <label className="field">
                <span className="field-label">Target role</span>
                <RoleSelect
                  roles={roles}
                  value={targetRoleId}
                  onChange={setTargetRoleId}
                  placeholder="Select the role you are aiming for..."
                />
              </label>

              <div>
                <span className="field-label">Skills you already have ({skills.length})</span>
                <div className="small muted">
                  {isAuthenticated
                    ? 'Your saved profile skills are pre-filled. Add or remove any before running the analysis.'
                    : 'Add the skills you already have so the recommendations skip them.'}
                </div>
              </div>
            </div>

            <SkillPicker
              skills={vocabulary}
              value={skills}
              onChange={setSkills}
              emptyMessage="No skills selected. Every requirement of the target role will be recommended."
            />

            <div className="filter-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={getRecommendations}
                disabled={loadingSkills}
              >
                {loadingSkills ? 'Analysing...' : 'Recommend skills for this role'}
              </button>
              <button type="button" className="btn" onClick={matchRoles} disabled={loadingRoles}>
                {loadingRoles ? 'Matching...' : 'Which roles fit my skills?'}
              </button>
              {isAuthenticated && profileSkills.data && profileSkills.data.length > 0 && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setSkills(profileSkills.data.map((entry) => entry.name))}
                >
                  Reset to my saved skills ({profileSkills.data.length})
                </button>
              )}
            </div>
          </Card>

          {skillError && (
            <div className="mt-3">
              <ErrorBlock error={skillError} onRetry={getRecommendations} />
            </div>
          )}

          {skillResult && (
            <>
              <div className="grid grid-4 mt-3">
                <StatCard
                  label="Target role"
                  value={skillResult.targetRole.title}
                  hint={`${skillResult.targetRole.family} - ${skillResult.targetRole.seniority}`}
                />
                <StatCard
                  label="Readiness"
                  value={formatPercent(skillResult.readiness, 0)}
                  hint={`${skillResult.heldSkillCount} of ${skillResult.requiredSkillCount} required skills held`}
                />
                <StatCard
                  label="Skill gaps"
                  value={formatNumber(skillResult.totalGaps)}
                  hint="Recommended below, highest priority first"
                />
                <StatCard
                  label="Demand score"
                  value={Number(skillResult.targetRole.demandScore).toFixed(1)}
                  hint={`${formatNumber(skillResult.targetRole.postingCount)} sample postings, average salary ${formatCompact(skillResult.targetRole.avgSalary)}`}
                />
              </div>

              <div className="grid grid-2 mt-3">
                <Card
                  title="Why these skills, in this order"
                  note="Ranked by role importance first, then by how often each skill appears in sample postings, then by market trend."
                >
                  {skillResult.recommendations.length === 0 ? (
                    <EmptyBlock message="No gaps to recommend: you already cover every skill listed for this role." />
                  ) : (
                    skillResult.recommendations.map((skill) => (
                      <div className="roadmap-step" key={skill.name}>
                        <div className="roadmap-step-title">
                          #{skill.rank} {skill.name} <PriorityBadge label={skill.priorityLabel} />
                        </div>
                        <div className="roadmap-step-meta">
                          {skill.category} - role importance {skill.importance} of 5 - appears in{' '}
                          {formatNumber(skill.postingCount)} postings ({formatPercent(skill.demandShare)} of
                          the dataset)
                        </div>
                        <div className="badge-row mt-1">
                          <TrendBadge trend={skill.trend} growthRate={skill.growthRate} />
                          <span className="badge">priority score {skill.priorityScore}</span>
                        </div>
                        <ul className="reason-list">
                          {skill.reason.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    ))
                  )}

                  {skillResult.notes && skillResult.notes.length > 0 && (
                    <>
                      <div className="divider" />
                      <div className="field-label">Method notes</div>
                      <ul className="reason-list">
                        {skillResult.notes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </Card>

                <div className="grid" style={{ gap: 16, alignContent: 'start' }}>
                  <Card
                    title="Skills you already have"
                    note={`Skill list source: ${skillResult.skillsSource === 'profile' ? 'your saved profile' : 'the form above'}.`}
                  >
                    {skillResult.alreadyHave.length === 0 ? (
                      <EmptyBlock message="No overlapping skills: all requirements of this role are gaps." />
                    ) : (
                      <>
                        <ProgressBar
                          value={skillResult.readiness}
                          hint="of the role's weighted skill requirement is covered"
                        />
                        <div className="badge-row mt-2">
                          {skillResult.alreadyHave.map((skill) => (
                            <span className="skill-pill owned" key={skill.name}>
                              {skill.name}
                              <span className="muted small">importance {skill.importance}</span>
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                  </Card>

                  <Card title="Gaps by category" note="Where the remaining work is concentrated">
                    <DataTable
                      searchable={false}
                      rows={Object.entries(skillResult.recommendationsByCategory || {}).map(
                        ([category, count]) => ({ category, count })
                      )}
                      columns={[
                        { key: 'category', label: 'Category' },
                        {
                          key: 'count',
                          label: 'Gaps',
                          align: 'num',
                          render: (row) => formatNumber(row.count),
                        },
                      ]}
                    />
                  </Card>
                </div>
              </div>
            </>
          )}

          {loadingSkills && <LoadingBlock message="Calculating your skill gaps..." />}

          {roleError && (
            <div className="mt-3">
              <ErrorBlock error={roleError} onRetry={matchRoles} />
            </div>
          )}

          {roleResult && (
            <Card
              className="mt-3"
              title="Roles that match your skills"
              note={`Fit score blends how much of the role's skill requirement you cover with the role's demand score. Compared against ${formatNumber(roleResult.totalJobs)} sample postings.`}
            >
              {roleResult.basedOnSkills.length === 0 && (
                <InfoBanner tone="info" title="No skills provided.">
                  Add at least one skill to get a meaningful match. Without skills every role scores zero
                  coverage.
                </InfoBanner>
              )}

              <DataTable
                searchPlaceholder="Search roles..."
                rows={roleResult.roles}
                searchText={(row) => `${row.title} ${row.family} ${row.seniority}`}
                columns={[
                  { key: 'title', label: 'Role' },
                  { key: 'family', label: 'Family', render: (row) => <span className="muted">{row.family}</span> },
                  { key: 'seniority', label: 'Level' },
                  {
                    key: 'fitScore',
                    label: 'Fit score',
                    align: 'num',
                    render: (row) => Number(row.fitScore).toFixed(1),
                  },
                  {
                    key: 'skillCoverage',
                    label: 'Skill coverage',
                    align: 'num',
                    render: (row) => formatPercent(row.skillCoverage),
                  },
                  {
                    key: 'postingCount',
                    label: 'Postings',
                    align: 'num',
                    render: (row) => formatNumber(row.postingCount),
                  },
                  {
                    key: 'matchedSkills',
                    label: 'Skills you already have',
                    sortable: false,
                    render: (row) =>
                      row.matchedSkills.length === 0 ? (
                        <span className="muted">none</span>
                      ) : (
                        <span className="small">{row.matchedSkills.join(', ')}</span>
                      ),
                  },
                  {
                    key: 'missingSkills',
                    label: 'Missing skills',
                    sortable: false,
                    render: (row) => (
                      <span className="small muted">
                        {row.missingSkills.slice(0, 5).join(', ')}
                        {row.missingSkills.length > 5 ? ` (+${row.missingSkills.length - 5} more)` : ''}
                      </span>
                    ),
                  },
                ]}
              />
            </Card>
          )}

          {loadingRoles && <LoadingBlock message="Scoring roles against your skills..." />}

          <Card
            className="mt-3"
            title="Most requested skills overall"
            note="A reminder of what the sample market asks for most often, independent of your target role."
          >
            {popular.loading && <LoadingBlock message="Loading popular skills..." />}
            {popular.error && <ErrorBlock error={popular.error} onRetry={popular.reload} />}
            {popular.data && popular.data.length === 0 && (
              <EmptyBlock message="No skill demand rows were returned." />
            )}
            {popular.data && popular.data.length > 0 && (
              <>
                <HorizontalBarChart
                  labels={popular.data.map((skill) => skill.name)}
                  values={popular.data.map((skill) => skill.posting_count)}
                  label="Postings"
                  className="chart-box chart-box-lg"
                />
                <div className="card-note mt-2">
                  Highest demand: <strong>{popular.data[0].name}</strong> appears in{' '}
                  {formatNumber(popular.data[0].posting_count)} postings. Lowest in this list:{' '}
                  {popular.data[popular.data.length - 1].name} with{' '}
                  {formatNumber(popular.data[popular.data.length - 1].posting_count)}.
                </div>
              </>
            )}
          </Card>

          {!isAuthenticated && (
            <InfoBanner tone="info" title="Want to keep this?">
              <Link to="/register">Create an account</Link> to save your skills, career goals and
              roadmaps, so the next visit starts from where you left off.
            </InfoBanner>
          )}
        </>
      )}
    </div>
  );
}
