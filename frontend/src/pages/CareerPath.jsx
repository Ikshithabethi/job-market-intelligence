/**
 * Career Path Analytics.
 *
 * Pick a current role, a target role and the skills you already have. The
 * backend walks the LEADS_TO graph (career_paths) with Dijkstra to find the
 * cheapest route, then returns the intermediate roles, the skill gap, the
 * learning priorities and a phased roadmap.
 *
 * Everything rendered here comes from POST /api/career/path - nothing is
 * computed in the browser beyond formatting.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { careerApi, roadmapApi, userApi } from '../services/api';
import useApiData from '../hooks/useApiData';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, PageHeader, StatCard } from '../components/Surface.jsx';
import { RoleSelect } from '../components/RoleSelect.jsx';
import { SkillPicker } from '../components/SkillPicker.jsx';
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
import {
  formatCompact,
  formatNumber,
  formatPercent,
  formatYears,
  titleCase,
} from '../utils/format';

export default function CareerPath() {
  const { isAuthenticated } = useAuth();

  const options = useApiData((signal) => careerApi.options(signal), []);
  const profileSkills = useApiData((signal) => userApi.skills(signal), [], {
    enabled: isAuthenticated,
  });

  const [fromRoleId, setFromRoleId] = useState(null);
  const [toRoleId, setToRoleId] = useState(null);
  const [skills, setSkills] = useState([]);
  const [result, setResult] = useState(null);
  const [computing, setComputing] = useState(false);
  const [computeError, setComputeError] = useState(null);
  const [saveState, setSaveState] = useState({ saving: false, message: null, error: null });
  const prefilled = useRef(false);

  const roles = (options.data && options.data.roles) || [];
  const vocabulary = (options.data && options.data.skills) || [];

  // Sensible defaults once the role list arrives: Data Analyst -> Data Engineer,
  // both of which exist in the sample dataset.
  useEffect(() => {
    if (roles.length === 0) return;
    if (fromRoleId === null) {
      const analyst = roles.find((role) => role.title === 'Data Analyst') || roles[0];
      setFromRoleId(analyst.id);
    }
    if (toRoleId === null) {
      const engineer = roles.find((role) => role.title === 'Data Engineer');
      const fallback = roles.find((role) => role.id !== fromRoleId);
      setToRoleId(engineer ? engineer.id : (fallback && fallback.id) || null);
    }
  }, [roles, fromRoleId, toRoleId]);

  // Logged in and the profile has saved skills: offer them as a starting point.
  useEffect(() => {
    if (prefilled.current) return;
    if (!profileSkills.data || profileSkills.data.length === 0) return;
    prefilled.current = true;
    setSkills(profileSkills.data.map((entry) => entry.name));
  }, [profileSkills.data]);

  const computePath = useCallback(async () => {
    if (!fromRoleId || !toRoleId) {
      setComputeError(new Error('Choose both a current role and a target role.'));
      return;
    }
    setComputing(true);
    setComputeError(null);
    setSaveState({ saving: false, message: null, error: null });
    try {
      const { data } = await careerApi.path({
        fromRoleId,
        toRoleId,
        currentSkills: skills,
      });
      setResult(data);
    } catch (error) {
      setResult(null);
      setComputeError(error);
    } finally {
      setComputing(false);
    }
  }, [fromRoleId, toRoleId, skills]);

  const saveRoadmap = useCallback(async () => {
    if (!result || !result.reachable) return;
    setSaveState({ saving: true, message: null, error: null });
    try {
      await roadmapApi.save({
        fromRoleId: result.fromRole.id,
        toRoleId: result.toRole.id,
        fromRoleTitle: result.fromRole.title,
        toRoleTitle: result.toRole.title,
        hops: result.hops,
        totalYears: result.totalYears,
        path: result.path,
        missingSkills: result.targetRoleGap.missingSkills,
        roadmap: result.roadmap,
      });
      setSaveState({
        saving: false,
        message: 'Saved. Open the Profile page to see or delete it.',
        error: null,
      });
    } catch (error) {
      setSaveState({ saving: false, message: null, error });
    }
  }, [result]);

  const swapRoles = () => {
    setFromRoleId(toRoleId);
    setToRoleId(fromRoleId);
  };

  const gap = result && result.targetRoleGap;

  return (
    <div>
      <PageHeader
        title="Career Path Analytics"
        subtitle="Find a realistic route from your current role to a target role, with the intermediate steps, the skills you are missing and the order to learn them in."
      />

      <SampleDataBanner
        disclaimer="Routes come from the career_paths and role_skills tables in the sample dataset."
      />

      {options.loading && <LoadingBlock message="Loading roles and skills..." />}
      {options.error && <ErrorBlock error={options.error} onRetry={options.reload} />}

      {!options.loading && !options.error && roles.length === 0 && (
        <EmptyBlock message="No roles were returned. Load the dataset with 'npm run seed' in the backend folder." />
      )}

      {!options.loading && !options.error && roles.length > 0 && (
        <>
          <Card
            title="Your starting point"
            note="Select the roles and tick the skills you already have. Priorities change as you add skills."
          >
            <div className="filter-grid">
              <label className="field">
                <span className="field-label">Current role</span>
                <RoleSelect
                  roles={roles}
                  value={fromRoleId}
                  onChange={setFromRoleId}
                  placeholder="Select your current role..."
                />
              </label>

              <label className="field">
                <span className="field-label">Target role</span>
                <RoleSelect
                  roles={roles}
                  value={toRoleId}
                  onChange={setToRoleId}
                  placeholder="Select the role you want..."
                />
              </label>
            </div>

            <div className="filter-actions">
              <button type="button" className="btn btn-primary" onClick={computePath} disabled={computing}>
                {computing ? 'Computing...' : 'Find the career path'}
              </button>
              <button type="button" className="btn" onClick={swapRoles}>
                Swap roles
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setSkills([])}
                disabled={skills.length === 0}
              >
                Clear skills
              </button>
              {isAuthenticated && profileSkills.data && profileSkills.data.length > 0 && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setSkills(profileSkills.data.map((entry) => entry.name))}
                >
                  Use my saved skills ({profileSkills.data.length})
                </button>
              )}
            </div>

            <div className="divider" />

            <div className="field-label">
              Skills you already have ({skills.length})
            </div>
            <SkillPicker
              skills={vocabulary}
              value={skills}
              onChange={setSkills}
              emptyMessage="No skills selected. The route and the skill gap will be computed for someone starting from scratch."
            />
          </Card>

          {computeError && (
            <div className="mt-3">
              <ErrorBlock error={computeError} onRetry={computePath} />
            </div>
          )}

          {!result && !computing && !computeError && (
            <Card className="mt-3" title="No result yet">
              <EmptyBlock message="Choose a current role and a target role, then run the analysis." />
            </Card>
          )}

          {computing && <LoadingBlock message="Traversing the career graph..." />}

          {result && !result.reachable && (
            <Card className="mt-3" title="No route found">
              <InfoBanner tone="warning" title="Not reachable in this dataset.">
                {result.message}
              </InfoBanner>
              <div className="grid grid-2 mt-3">
                <div>
                  <h3>Current role: {result.fromRole.title}</h3>
                  <ProgressBar
                    value={result.currentRoleGap.readiness}
                    hint={`of the ${result.currentRoleGap.requiredSkillCount} skills this role needs`}
                  />
                </div>
                <div>
                  <h3>Target role: {result.toRole.title}</h3>
                  <ProgressBar
                    value={result.targetRoleGap.readiness}
                    hint={`of the ${result.targetRoleGap.requiredSkillCount} skills this role needs`}
                  />
                </div>
              </div>
            </Card>
          )}

          {result && result.reachable && (
            <>
              <div className="grid grid-4 mt-3">
                <StatCard
                  label="Transitions"
                  value={formatNumber(result.hops)}
                  hint={result.directTransition ? 'Direct move in the dataset' : 'Intermediate roles required'}
                />
                <StatCard
                  label="Time to target"
                  value={formatYears(result.totalYears)}
                  hint="Sum of the average transition times"
                />
                <StatCard
                  label="Readiness for target"
                  value={formatPercent(gap.readiness, 0)}
                  hint={`${gap.heldSkillCount} of ${gap.requiredSkillCount} required skills held`}
                />
                <StatCard
                  label="Skills to acquire"
                  value={formatNumber(gap.missingSkills.length)}
                  hint="Prioritised on the roadmap below"
                />
              </div>

              <Card
                className="mt-3"
                title="Route"
                note={`Path found with ${result.routeType === 'skill-similarity' ? 'skill similarity (no direct transition edge exists)' : 'the career_transitions dataset'}. Total cost ${result.totalCost} - ${result.costModel.description}`}
                actions={
                  isAuthenticated ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={saveRoadmap}
                      disabled={saveState.saving}
                    >
                      {saveState.saving ? 'Saving...' : 'Save this roadmap'}
                    </button>
                  ) : (
                    <Link className="btn btn-sm" to="/login">
                      Log in to save
                    </Link>
                  )
                }
              >
                {result.fallbackUsed && (
                  <InfoBanner tone="warning" title="Fallback route.">
                    No LEADS_TO edge connects these roles, so this route is built from skill overlap
                    between roles. Treat it as a suggestion rather than a recorded transition.
                  </InfoBanner>
                )}

                {saveState.message && (
                  <InfoBanner tone="success" title="Saved.">
                    {saveState.message}
                  </InfoBanner>
                )}
                {saveState.error && <ErrorBlock error={saveState.error} />}

                <div className="path-chain mt-2">
                  {result.path.map((role, index) => (
                    <span key={`${role.id}-${index}`} style={{ display: 'contents' }}>
                      {index > 0 && <span className="path-arrow">-&gt;</span>}
                      <span
                        className={`path-node ${
                          index === 0 ? 'start' : index === result.path.length - 1 ? 'end' : ''
                        }`}
                      >
                        {role.title}
                        <span className="small muted"> ({role.seniority})</span>
                      </span>
                    </span>
                  ))}
                </div>

                <dl className="kv-list mt-3">
                  <div>
                    <dt>From</dt>
                    <dd>
                      {result.fromRole.title} - {result.fromRole.family}
                    </dd>
                  </div>
                  <div>
                    <dt>To</dt>
                    <dd>
                      {result.toRole.title} - {result.toRole.family}
                    </dd>
                  </div>
                  <div>
                    <dt>Route type</dt>
                    <dd>{result.routeType === 'career-path' ? 'Recorded career transitions' : 'Skill similarity (fallback)'}</dd>
                  </div>
                  <div>
                    <dt>Total cost</dt>
                    <dd>
                      {result.totalCost} (difficulty weight {result.costModel.difficultyWeight}, years
                      weight {result.costModel.yearsWeight})
                    </dd>
                  </div>
                </dl>
              </Card>

              <Card
                className="mt-3"
                title="Step by step"
                note="Each step lists the skills the backend calculated you still need before the move."
              >
                {result.steps.length === 0 ? (
                  <EmptyBlock message="No intermediate steps: the two roles are the same, or the path has no edges." />
                ) : (
                  result.steps.map((step) => (
                    <div className="roadmap-step" key={step.step}>
                      <div className="roadmap-step-title">
                        Step {step.step}: {step.fromRole.title} to {step.toRole.title}
                      </div>
                      <div className="roadmap-step-meta">
                        {titleCase(step.transitionType)} transition - about {step.avgYears} years -
                        difficulty {step.difficulty} of 5 - cumulative {step.cumulativeYears} years
                      </div>
                      {step.notes && <div className="small muted mt-1">{step.notes}</div>}
                      {step.similarity !== null && step.similarity !== undefined && (
                        <div className="small muted">
                          Skill similarity to the previous role: {step.similarity}
                        </div>
                      )}

                      <div className="mt-2">
                        <div className="field-label">
                          Skills to pick up before this move ({step.skillsToAcquire.length})
                        </div>
                        {step.skillsToAcquire.length === 0 ? (
                          <div className="small muted">
                            You already cover this role. Focus on applying.
                          </div>
                        ) : (
                          <div className="badge-row">
                            {step.skillsToAcquire.map((skill) => (
                              <span className="skill-pill missing" key={skill.skill_id}>
                                {skill.name}
                                <PriorityBadge label={skill.priorityLabel} />
                              </span>
                            ))}
                          </div>
                        )}
                        <ProgressBar
                          value={100 - step.readinessBeforeMove}
                          hint={`of the target-role skill weight would still be missing at this point (readiness ${step.readinessBeforeMove}%)`}
                        />
                      </div>
                    </div>
                  ))
                )}
              </Card>

              <div className="grid grid-2 mt-3">
                <Card
                  title="Skill gap for the target role"
                  note={`${gap.requiredSkillCount} skills are listed for ${result.toRole.title}.`}
                >
                  <ProgressBar
                    value={gap.readiness}
                    hint={`of the role's weighted skill requirement is already covered`}
                  />
                  <div className="grid grid-3 mt-2">
                    <StatCard label="Required" value={formatNumber(gap.requiredSkillCount)} />
                    <StatCard label="Already held" value={formatNumber(gap.heldSkillCount)} />
                    <StatCard label="Missing" value={formatNumber(gap.missingSkills.length)} />
                  </div>

                  {gap.transferableSkills.length > 0 && (
                    <>
                      <div className="divider" />
                      <div className="field-label">
                        Skills you already have that this role needs
                      </div>
                      <div className="badge-row">
                        {gap.transferableSkills.map((skill) => (
                          <span className="skill-pill owned" key={skill.skill_id}>
                            {skill.name}
                            <span className="muted small">importance {skill.importance}</span>
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </Card>

                <Card
                  title="Missing skills, in priority order"
                  note="Ordered by role importance first, then by how often the skill appears in sample postings."
                >
                  {gap.missingSkills.length === 0 ? (
                    <EmptyBlock message="No missing skills: your selection already covers this role." />
                  ) : (
                    <div className="table-scroll">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Skill</th>
                            <th>Category</th>
                            <th className="num">Imp.</th>
                            <th className="num">Demand</th>
                            <th>Trend</th>
                            <th className="num">Priority</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gap.missingSkills.map((skill) => (
                            <tr key={skill.skill_id}>
                              <td>{skill.name}</td>
                              <td className="muted small">{skill.category}</td>
                              <td className="num">{skill.importance}</td>
                              <td className="num">{formatPercent(skill.demand_share)}</td>
                              <td>
                                <TrendBadge trend={skill.trend} growthRate={skill.growth_rate} />
                              </td>
                              <td className="num">
                                {skill.priorityScore}
                                <PriorityBadge label={skill.priorityLabel} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </div>

              <Card
                className="mt-3"
                title="Recommended learning priorities"
                note="The top gaps with the reason the backend ranked each one where it did."
              >
                <ol className="reason-list" style={{ paddingLeft: 22 }}>
                  {result.learningPriorities.map((skill) => (
                    <li key={skill.name} style={{ marginBottom: 12 }}>
                      <strong>{skill.name}</strong> <span className="muted small">({skill.category})</span>{' '}
                      <PriorityBadge label={skill.priorityLabel} />
                      <ul className="reason-list">
                        {skill.reason.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              </Card>

              <Card
                className="mt-3"
                title="Career roadmap"
                note="Phases built from the skill gap, followed by the final move."
              >
                {(result.roadmap || []).map((phase) => (
                  <div className="roadmap-step" key={phase.id}>
                    <div className="roadmap-step-title">{phase.title}</div>
                    <div className="roadmap-step-meta">{phase.timeframe}</div>
                    {phase.focusSkills && phase.focusSkills.length > 0 && (
                      <div className="badge-row mt-1">
                        {phase.focusSkills.map((name) => (
                          <span className="skill-pill missing" key={name}>
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                    <ul className="reason-list">
                      {phase.actions.map((action) => (
                        <li key={action}>{action}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </Card>

              <Card
                className="mt-3"
                title="Alternative routes"
                note="Other routes the graph search considered, ordered by total cost."
              >
                {result.alternatives.length === 0 ? (
                  <EmptyBlock message="No alternative routes were found between these roles." />
                ) : (
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th className="num">Hops</th>
                          <th className="num">Cost</th>
                          <th>Route</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.alternatives.map((alternative) => (
                          <tr key={alternative.roles.map((role) => role.id).join('-')}>
                            <td className="num">{alternative.hops}</td>
                            <td className="num">{alternative.cost}</td>
                            <td>
                              {alternative.roles
                                .map((role) => `${role.title} (${formatCompact(role.avgSalaryMax)})`)
                                .join('  ->  ')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
