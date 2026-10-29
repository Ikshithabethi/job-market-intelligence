/**
 * Profile page (requires an account).
 *
 * Three things live here:
 *   1. account details and career goals        -> PUT /api/users/profile
 *   2. the saved skill list with proficiencies -> /api/users/skills
 *   3. saved career roadmaps                   -> /api/roadmaps
 *
 * Every mutation reloads the matching resource so what is shown always comes
 * back from the database.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { careerApi, roadmapApi, userApi } from '../services/api';
import useApiData from '../hooks/useApiData';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, PageHeader, StatCard } from '../components/Surface.jsx';
import { RoleSelect } from '../components/RoleSelect.jsx';
import { DataTable } from '../components/DataTable.jsx';
import {
  EmptyBlock,
  ErrorBlock,
  InfoBanner,
  LoadingBlock,
  PriorityBadge,
  SampleDataBanner,
  TrendBadge,
} from '../components/StateBlocks.jsx';
import { formatDate, formatNumber, formatPercent, formatYears } from '../utils/format';

export default function Profile() {
  const { user, logout, refreshUser } = useAuth();

  const profile = useApiData((signal) => userApi.profile(signal), []);
  const catalogue = useApiData((signal) => userApi.skillCatalogue(signal), []);
  const options = useApiData((signal) => careerApi.options(signal), []);
  const roadmaps = useApiData((signal) => roadmapApi.list(signal), []);

  const [form, setForm] = useState({
    fullName: '',
    location: '',
    experienceYears: '',
    currentRoleId: null,
    targetRoleId: null,
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState(null);

  const [newSkillId, setNewSkillId] = useState('');
  const [newProficiency, setNewProficiency] = useState('beginner');
  const [skillBusy, setSkillBusy] = useState(false);
  const [skillFeedback, setSkillFeedback] = useState(null);

  const [expanded, setExpanded] = useState(null);
  const [roadmapFeedback, setRoadmapFeedback] = useState(null);

  const roles = (options.data && options.data.roles) || [];
  const catalogueSkills = catalogue.data || [];
  const proficiencyLevels =
    (profile.data && profile.data.proficiencyLevels) || ['beginner', 'intermediate', 'advanced'];

  // Copy the loaded profile into the editable form once it arrives.
  useEffect(() => {
    if (!profile.data) return;
    const { user: account, careerGoals } = profile.data;
    setForm({
      fullName: account.full_name || '',
      location: careerGoals.location || '',
      experienceYears:
        careerGoals.experienceYears === null || careerGoals.experienceYears === undefined
          ? ''
          : String(careerGoals.experienceYears),
      currentRoleId: careerGoals.currentRoleId || null,
      targetRoleId: careerGoals.targetRoleId || null,
    });
  }, [profile.data]);

  const savedSkills = (profile.data && profile.data.skills) || [];

  /** Skills available to add: everything in the catalogue not saved yet. */
  const addableSkills = useMemo(() => {
    const taken = new Set(savedSkills.map((skill) => skill.skill_id));
    return catalogueSkills.filter((skill) => !taken.has(skill.id));
  }, [catalogueSkills, savedSkills]);

  const groupedCatalogue = useMemo(() => {
    const map = new Map();
    addableSkills.forEach((skill) => {
      if (!map.has(skill.category)) map.set(skill.category, []);
      map.get(skill.category).push(skill);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [addableSkills]);

  const saveProfile = useCallback(async () => {
    setSavingProfile(true);
    setProfileFeedback(null);
    try {
      await userApi.updateProfile({
        fullName: form.fullName.trim(),
        location: form.location.trim(),
        experienceYears: form.experienceYears === '' ? null : Number(form.experienceYears),
        currentRoleId: form.currentRoleId || undefined,
        targetRoleId: form.targetRoleId || undefined,
      });
      await profile.reload();
      await refreshUser();
      setProfileFeedback({ tone: 'success', message: 'Profile saved.' });
    } catch (error) {
      setProfileFeedback({ tone: 'error', error });
    } finally {
      setSavingProfile(false);
    }
  }, [form, profile, refreshUser]);

  const addSkill = useCallback(async () => {
    if (!newSkillId) {
      setSkillFeedback({ tone: 'error', error: new Error('Choose a skill to add.') });
      return;
    }
    setSkillBusy(true);
    setSkillFeedback(null);
    try {
      await userApi.addSkill({ skillId: Number(newSkillId), proficiency: newProficiency });
      await profile.reload();
      setNewSkillId('');
      setSkillFeedback({ tone: 'success', message: 'Skill added.' });
    } catch (error) {
      setSkillFeedback({ tone: 'error', error });
    } finally {
      setSkillBusy(false);
    }
  }, [newSkillId, newProficiency, profile]);

  const changeProficiency = useCallback(
    async (userSkillId, proficiency) => {
      setSkillBusy(true);
      setSkillFeedback(null);
      try {
        await userApi.updateSkill(userSkillId, { proficiency });
        await profile.reload();
        setSkillFeedback({ tone: 'success', message: 'Proficiency updated.' });
      } catch (error) {
        setSkillFeedback({ tone: 'error', error });
      } finally {
        setSkillBusy(false);
      }
    },
    [profile]
  );

  const removeSkill = useCallback(
    async (userSkillId) => {
      setSkillBusy(true);
      setSkillFeedback(null);
      try {
        await userApi.removeSkill(userSkillId);
        await profile.reload();
        setSkillFeedback({ tone: 'success', message: 'Skill removed.' });
      } catch (error) {
        setSkillFeedback({ tone: 'error', error });
      } finally {
        setSkillBusy(false);
      }
    },
    [profile]
  );

  const openRoadmap = useCallback(async (id) => {
    if (expanded && expanded.id === id) {
      setExpanded(null);
      return;
    }
    setExpanded({ id, loading: true, data: null, error: null });
    try {
      const { data } = await roadmapApi.detail(id);
      setExpanded({ id, loading: false, data, error: null });
    } catch (error) {
      setExpanded({ id, loading: false, data: null, error });
    }
  }, [expanded]);

  const deleteRoadmap = useCallback(
    async (id) => {
      setRoadmapFeedback(null);
      try {
        await roadmapApi.remove(id);
        if (expanded && expanded.id === id) setExpanded(null);
        await roadmaps.reload();
        setRoadmapFeedback({ tone: 'success', message: 'Roadmap deleted.' });
      } catch (error) {
        setRoadmapFeedback({ tone: 'error', error });
      }
    },
    [roadmaps, expanded]
  );

  const stats = profile.data && profile.data.stats;

  return (
    <div>
      <PageHeader
        title="Profile"
        subtitle={`Signed in as ${(user && user.full_name) || '(unknown)'}. Saved skills and roadmaps are stored in MySQL against your account.`}
        actions={
          <button type="button" className="btn btn-sm" onClick={logout}>
            Log out
          </button>
        }
      />

      <SampleDataBanner disclaimer="Skill demand figures shown next to your skills come from the sample dataset." />

      {profile.loading && <LoadingBlock message="Loading your profile..." />}
      {profile.error && <ErrorBlock error={profile.error} onRetry={profile.reload} />}

      {!profile.loading && !profile.error && profile.data && (
        <>
          <div className="grid grid-3">
            <StatCard
              label="Saved skills"
              value={formatNumber(stats.savedSkillCount)}
              hint={`${formatNumber(stats.availableSkillCount)} skills in the catalogue`}
            />
            <StatCard
              label="Saved roadmaps"
              value={formatNumber(stats.savedRoadmapCount)}
              hint="Career paths you chose to keep"
            />
            <StatCard
              label="Account created"
              value={formatDate(profile.data.user.created_at)}
              hint={profile.data.user.email}
            />
          </div>

          <Card
            className="mt-3"
            title="Details and career goals"
            note="Your current and target role drive the Career Path and Skill Recommendation defaults."
          >
            {profileFeedback && profileFeedback.error && <ErrorBlock error={profileFeedback.error} />}
            {profileFeedback && profileFeedback.message && (
              <InfoBanner tone="success" title="Saved.">
                {profileFeedback.message}
              </InfoBanner>
            )}

            <div className="filter-grid">
              <label className="field">
                <span className="field-label">Full name</span>
                <input
                  type="text"
                  value={form.fullName}
                  onChange={(event) => setForm({ ...form, fullName: event.target.value })}
                />
              </label>

              <label className="field">
                <span className="field-label">Location</span>
                <input
                  type="text"
                  value={form.location}
                  placeholder="e.g. Bengaluru"
                  onChange={(event) => setForm({ ...form, location: event.target.value })}
                />
              </label>

              <label className="field">
                <span className="field-label">Years of experience</span>
                <input
                  type="number"
                  min="0"
                  max="50"
                  step="0.5"
                  value={form.experienceYears}
                  onChange={(event) => setForm({ ...form, experienceYears: event.target.value })}
                />
              </label>

              <div />

              <label className="field">
                <span className="field-label">Current role</span>
                <RoleSelect
                  roles={roles}
                  value={form.currentRoleId}
                  onChange={(value) => setForm({ ...form, currentRoleId: value })}
                  placeholder={options.loading ? 'Loading roles...' : 'Not set'}
                />
              </label>

              <label className="field">
                <span className="field-label">Target role</span>
                <RoleSelect
                  roles={roles}
                  value={form.targetRoleId}
                  onChange={(value) => setForm({ ...form, targetRoleId: value })}
                  placeholder={options.loading ? 'Loading roles...' : 'Not set'}
                />
              </label>
            </div>

            <div className="filter-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={saveProfile}
                disabled={savingProfile}
              >
                {savingProfile ? 'Saving...' : 'Save changes'}
              </button>
              <Link className="btn" to="/career">
                Open career path analytics
              </Link>
            </div>
          </Card>

          <Card
            className="mt-3"
            title="Your skills"
            note="Proficiency is stored per skill. These skills are used automatically when you leave the skill box empty on the Career Path and Recommendation pages."
            actions={
              <span className="badge">{formatNumber(savedSkills.length)} saved</span>
            }
          >
            {skillFeedback && skillFeedback.error && <ErrorBlock error={skillFeedback.error} />}
            {skillFeedback && skillFeedback.message && (
              <InfoBanner tone="success" title="Updated.">
                {skillFeedback.message}
              </InfoBanner>
            )}

            {catalogue.loading && <LoadingBlock message="Loading the skill catalogue..." />}
            {catalogue.error && <ErrorBlock error={catalogue.error} onRetry={catalogue.reload} />}

            <div className="inline-fields">
              <label className="field" style={{ marginBottom: 0 }}>
                <span className="field-label">Add a skill</span>
                <select value={newSkillId} onChange={(event) => setNewSkillId(event.target.value)}>
                  <option value="">
                    {groupedCatalogue.length === 0 ? 'Every catalogue skill is already saved' : 'Select a skill...'}
                  </option>
                  {groupedCatalogue.map(([category, entries]) => (
                    <optgroup key={category} label={category}>
                      {entries.map((skill) => (
                        <option key={skill.id} value={skill.id}>
                          {skill.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <label className="field" style={{ marginBottom: 0 }}>
                <span className="field-label">Proficiency</span>
                <select
                  value={newProficiency}
                  onChange={(event) => setNewProficiency(event.target.value)}
                >
                  {proficiencyLevels.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={addSkill}
                  disabled={skillBusy || !newSkillId}
                >
                  Add skill
                </button>
              </div>
            </div>

            <div className="divider" />

            {savedSkills.length === 0 ? (
              <EmptyBlock message="No skills saved yet. Add the skills you already have to get better recommendations." />
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Skill</th>
                      <th>Category</th>
                      <th>Proficiency</th>
                      <th className="num">Added</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {savedSkills.map((skill) => (
                      <tr key={skill.id}>
                        <td>{skill.name}</td>
                        <td className="muted small">{skill.category}</td>
                        <td>
                          <select
                            value={skill.proficiency}
                            disabled={skillBusy}
                            onChange={(event) => changeProficiency(skill.id, event.target.value)}
                            style={{ maxWidth: 160 }}
                          >
                            {proficiencyLevels.map((level) => (
                              <option key={level} value={level}>
                                {level}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="num small muted">{formatDate(skill.created_at)}</td>
                        <td className="num">
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            disabled={skillBusy}
                            onClick={() => removeSkill(skill.id)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card
            className="mt-3"
            title="Saved roadmaps"
            note="Roadmaps you saved from the Career Path page. Expand one to see the route, the gaps and the phases."
          >
            {roadmapFeedback && roadmapFeedback.error && <ErrorBlock error={roadmapFeedback.error} />}
            {roadmapFeedback && roadmapFeedback.message && (
              <InfoBanner tone="success" title="Updated.">
                {roadmapFeedback.message}
              </InfoBanner>
            )}

            {roadmaps.loading && <LoadingBlock message="Loading your roadmaps..." />}
            {roadmaps.error && <ErrorBlock error={roadmaps.error} onRetry={roadmaps.reload} />}

            {roadmaps.data && roadmaps.data.length === 0 && (
              <EmptyBlock message="No saved roadmaps yet. Compute one on the Career Path page and press 'Save this roadmap'." />
            )}

            {roadmaps.data && roadmaps.data.length > 0 && (
              <>
                <DataTable
                  searchPlaceholder="Search roadmaps..."
                  rows={roadmaps.data}
                  searchText={(row) => `${row.fromRoleTitle} ${row.toRoleTitle}`}
                  columns={[
                    {
                      key: 'fromRoleTitle',
                      label: 'From',
                      render: (row) => <strong>{row.fromRoleTitle}</strong>,
                    },
                    {
                      key: 'toRoleTitle',
                      label: 'To',
                      render: (row) => <strong>{row.toRoleTitle}</strong>,
                    },
                    { key: 'hops', label: 'Transitions', align: 'num' },
                    {
                      key: 'totalYears',
                      label: 'Time',
                      align: 'num',
                      render: (row) => formatYears(row.totalYears),
                    },
                    {
                      key: 'createdAt',
                      label: 'Saved',
                      align: 'num',
                      render: (row) => formatDate(row.createdAt),
                    },
                    {
                      key: 'actions',
                      label: '',
                      sortable: false,
                      searchable: false,
                      render: (row) => (
                        <div className="badge-row">
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => openRoadmap(row.id)}
                          >
                            {expanded && expanded.id === row.id ? 'Hide' : 'View'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => deleteRoadmap(row.id)}
                          >
                            Delete
                          </button>
                        </div>
                      ),
                    },
                  ]}
                />

                {expanded && (
                  <div className="mt-3">
                    {expanded.loading && <LoadingBlock message="Loading the saved roadmap..." />}
                    {expanded.error && <ErrorBlock error={expanded.error} />}
                    {expanded.data && (
                      <div>
                        <div className="path-chain">
                          {expanded.data.path.map((role, index) => (
                            <span key={`${role.id}-${index}`} style={{ display: 'contents' }}>
                              {index > 0 && <span className="path-arrow">-&gt;</span>}
                              <span
                                className={`path-node ${
                                  index === 0
                                    ? 'start'
                                    : index === expanded.data.path.length - 1
                                      ? 'end'
                                      : ''
                                }`}
                              >
                                {role.title}
                              </span>
                            </span>
                          ))}
                        </div>

                        <div className="grid grid-2 mt-3">
                          <div>
                            <div className="field-label">
                              Missing skills at the time of saving ({expanded.data.missingSkills.length})
                            </div>
                            {expanded.data.missingSkills.length === 0 ? (
                              <div className="small muted">No gaps recorded.</div>
                            ) : (
                              <div className="badge-row">
                                {expanded.data.missingSkills.map((skill) => (
                                  <span className="skill-pill missing" key={skill.name}>
                                    {skill.name}
                                    {skill.priorityLabel && <PriorityBadge label={skill.priorityLabel} />}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div>
                            <div className="field-label">Skill demand snapshot</div>
                            <div className="table-scroll">
                              <table className="data-table">
                                <thead>
                                  <tr>
                                    <th>Skill</th>
                                    <th className="num">Share</th>
                                    <th>Trend</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {expanded.data.missingSkills.slice(0, 6).map((skill) => (
                                    <tr key={skill.name}>
                                      <td>{skill.name}</td>
                                      <td className="num">
                                        {skill.demand_share !== undefined
                                          ? formatPercent(skill.demand_share)
                                          : '--'}
                                      </td>
                                      <td>
                                        {skill.trend ? (
                                          <TrendBadge
                                            trend={skill.trend}
                                            growthRate={skill.growth_rate}
                                          />
                                        ) : (
                                          <span className="muted">--</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>

                        <div className="field-label mt-3">Roadmap phases</div>
                        {expanded.data.roadmap.map((phase) => (
                          <div className="roadmap-step" key={phase.id}>
                            <div className="roadmap-step-title">{phase.title}</div>
                            <div className="roadmap-step-meta">{phase.timeframe}</div>
                            <ul className="reason-list">
                              {phase.actions.map((action) => (
                                <li key={action}>{action}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
