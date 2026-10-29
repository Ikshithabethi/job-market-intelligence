/**
 * Job Market Intelligence.
 *
 * Search and filter the postings, inspect a single posting, and read the skill
 * demand / emerging skill analysis derived from the same dataset.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { jobApi, skillApi } from '../services/api';
import useApiData from '../hooks/useApiData';
import { Card, PageHeader, StatCard } from '../components/Surface.jsx';
import { HorizontalBarChart } from '../components/Charts.jsx';
import { DataTable } from '../components/DataTable.jsx';
import {
  EmptyBlock,
  ErrorBlock,
  InfoBanner,
  LoadingBlock,
  SampleDataBanner,
  TrendBadge,
} from '../components/StateBlocks.jsx';
import {
  formatCompact,
  formatDate,
  formatExperienceRange,
  formatNumber,
  formatSalaryRange,
  formatSignedPercent,
  truncate,
} from '../utils/format';

const EMPTY_FILTERS = {
  q: '',
  roleId: '',
  location: '',
  employmentType: '',
  salaryMin: '',
  salaryMax: '',
  experienceMin: '',
  experienceMax: '',
  skills: [],
  sortBy: 'recent',
};

const PAGE_SIZE = 15;

export default function JobMarket() {
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [selectedJobId, setSelectedJobId] = useState(null);

  const filterOptions = useApiData((signal) => jobApi.filters(signal), []);

  const jobs = useApiData(
    (signal) => jobApi.list({ ...applied, page, pageSize: PAGE_SIZE }, signal),
    [JSON.stringify(applied), page]
  );

  const detail = useApiData(
    (signal) => jobApi.detail(selectedJobId, signal),
    [selectedJobId],
    { enabled: Boolean(selectedJobId) }
  );

  const demand = useApiData((signal) => skillApi.demand({ limit: 12 }, signal), []);
  const trending = useApiData((signal) => skillApi.trending({ limit: 5 }, signal), []);

  useEffect(() => {
    // Reset to the first page whenever the applied filters change.
    setPage(1);
  }, [applied]);

  const toggleSkill = (skillName) => {
    setDraft((current) => {
      const exists = current.skills.includes(skillName);
      return {
        ...current,
        skills: exists
          ? current.skills.filter((name) => name !== skillName)
          : [...current.skills, skillName],
      };
    });
  };

  const applyFilters = useCallback(
    (event) => {
      if (event) event.preventDefault();
      setApplied({ ...draft, skills: [...draft.skills] });
      setSelectedJobId(null);
    },
    [draft]
  );

  const resetFilters = () => {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setSelectedJobId(null);
  };

  const meta = jobs.meta || {};
  const rows = jobs.data || [];
  const options = filterOptions.data;
  const activeFilterCount = useMemo(
    () =>
      Object.entries(applied).filter(([key, value]) => {
        if (key === 'skills') return value.length > 0;
        if (key === 'sortBy') return false;
        return value !== '' && value !== null;
      }).length,
    [applied]
  );

  return (
    <div>
      <PageHeader
        title="Job Market Intelligence"
        subtitle="Filter the sample postings by role, location, salary, experience and required skills, then inspect a posting or the underlying skill demand."
      />

      <SampleDataBanner />

      {filterOptions.loading && <LoadingBlock message="Loading filter options..." />}
      {filterOptions.error && (
        <ErrorBlock error={filterOptions.error} onRetry={filterOptions.reload} />
      )}

      {options && (
        <Card
          title="Search and filters"
          note="Ranges are treated as overlapping: a posting matches when its range overlaps yours."
          actions={
            activeFilterCount > 0 ? (
              <span className="badge badge-accent">{activeFilterCount} filter(s) applied</span>
            ) : null
          }
        >
          <form onSubmit={applyFilters}>
            <div className="filter-grid">
              <label className="field">
                <span className="field-label">Keyword</span>
                <input
                  type="text"
                  value={draft.q}
                  placeholder="e.g. spark, dashboard, kubernetes"
                  onChange={(event) => setDraft({ ...draft, q: event.target.value })}
                />
              </label>

              <label className="field">
                <span className="field-label">Job role</span>
                <select
                  value={draft.roleId}
                  onChange={(event) => setDraft({ ...draft, roleId: event.target.value })}
                >
                  <option value="">All roles</option>
                  {options.roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.title} ({role.seniority})
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="field-label">Location</span>
                <select
                  value={draft.location}
                  onChange={(event) => setDraft({ ...draft, location: event.target.value })}
                >
                  <option value="">All locations</option>
                  {options.locations.map((entry) => (
                    <option key={entry.location} value={entry.location}>
                      {entry.location} ({entry.posting_count})
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="field-label">Employment type</span>
                <select
                  value={draft.employmentType}
                  onChange={(event) => setDraft({ ...draft, employmentType: event.target.value })}
                >
                  <option value="">Any type</option>
                  {options.employmentTypes.map((entry) => (
                    <option key={entry.employment_type} value={entry.employment_type}>
                      {entry.employment_type} ({entry.posting_count})
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="field-label">Minimum salary</span>
                <input
                  type="number"
                  min="0"
                  step="10000"
                  placeholder={`${options.salaryRange.min}`}
                  value={draft.salaryMin}
                  onChange={(event) => setDraft({ ...draft, salaryMin: event.target.value })}
                />
              </label>

              <label className="field">
                <span className="field-label">Maximum salary</span>
                <input
                  type="number"
                  min="0"
                  step="10000"
                  placeholder={`${options.salaryRange.max}`}
                  value={draft.salaryMax}
                  onChange={(event) => setDraft({ ...draft, salaryMax: event.target.value })}
                />
              </label>

              <label className="field">
                <span className="field-label">Minimum experience</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder={`${options.experienceRange.min}`}
                  value={draft.experienceMin}
                  onChange={(event) => setDraft({ ...draft, experienceMin: event.target.value })}
                />
              </label>

              <label className="field">
                <span className="field-label">Maximum experience</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder={`${options.experienceRange.max}`}
                  value={draft.experienceMax}
                  onChange={(event) => setDraft({ ...draft, experienceMax: event.target.value })}
                />
              </label>

              <label className="field">
                <span className="field-label">Sort by</span>
                <select
                  value={draft.sortBy}
                  onChange={(event) => setDraft({ ...draft, sortBy: event.target.value })}
                >
                  <option value="recent">Most recent postings</option>
                  <option value="salary">Highest salary</option>
                  <option value="experience">Most experience required</option>
                  <option value="relevance">Keyword relevance</option>
                </select>
              </label>
            </div>

            <div className="mt-2">
              <span className="field-label">
                Required skills (a posting must contain every selected skill)
              </span>
              <div className="badge-row">
                {options.topSkills.map((entry) => (
                  <button
                    key={entry.name}
                    type="button"
                    className={`skill-pill ${draft.skills.includes(entry.name) ? 'owned' : ''}`}
                    onClick={() => toggleSkill(entry.name)}
                  >
                    {entry.name}
                    <span className="muted small">{entry.posting_count}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-actions">
              <button type="submit" className="btn btn-primary">
                Apply filters
              </button>
              <button type="button" className="btn" onClick={resetFilters}>
                Reset
              </button>
              <span className="small muted">
                Salary range in the dataset: {formatCompact(options.salaryRange.min)} to{' '}
                {formatCompact(options.salaryRange.max)}, average{' '}
                {formatCompact(options.salaryRange.avg)}.
              </span>
            </div>
          </form>
        </Card>
      )}

      <div className="grid grid-4 mt-3">
        <StatCard
          label="Matching postings"
          value={meta.total === undefined ? '--' : formatNumber(meta.total)}
          hint="Postings that satisfy every applied filter"
        />
        <StatCard
          label="Page"
          value={`${meta.page || 1} / ${meta.totalPages || 1}`}
          hint={`${PAGE_SIZE} rows per page`}
        />
        <StatCard
          label="Quick skill filters"
          value={formatNumber((options && options.topSkills.length) || 0)}
          hint="Top skills offered as one-click filters"
        />
        <StatCard
          label="Roles indexed"
          value={formatNumber((options && options.roles.length) || 0)}
          hint="Distinct roles present in the posting index"
        />
      </div>

      <Card
        className="mt-3"
        title="Postings"
        note="Select a row to open the full posting, its skill weights and similar listings."
      >
        {jobs.loading && <LoadingBlock message="Loading postings..." />}
        {jobs.error && <ErrorBlock error={jobs.error} onRetry={jobs.reload} />}
        {!jobs.loading && !jobs.error && (
          <>
            <DataTable
              searchable={false}
              emptyMessage="No postings match the current filters. Try widening the salary or experience range."
              rows={rows}
              columns={[
                {
                  key: 'title',
                  label: 'Title',
                  render: (row) => (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setSelectedJobId(row.id)}
                    >
                      {row.title}
                    </button>
                  ),
                },
                { key: 'company_name', label: 'Company' },
                { key: 'role_title', label: 'Role' },
                { key: 'location', label: 'Location' },
                {
                  key: 'salary',
                  label: 'Salary',
                  render: (row) => formatSalaryRange(row.salary_min, row.salary_max),
                },
                {
                  key: 'experience',
                  label: 'Experience',
                  render: (row) => formatExperienceRange(row.experience_min, row.experience_max),
                },
                {
                  key: 'skills',
                  label: 'Skills',
                  render: (row) => truncate((row.skills || []).map((skill) => skill.name).join(', '), 70),
                },
                {
                  key: 'posted_date',
                  label: 'Posted',
                  render: (row) => formatDate(row.posted_date),
                },
              ]}
            />

            <div className="filter-actions">
              <button
                type="button"
                className="btn btn-sm"
                disabled={(meta.page || 1) <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous page
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={(meta.page || 1) >= (meta.totalPages || 1)}
                onClick={() => setPage((current) => current + 1)}
              >
                Next page
              </button>
              <span className="small muted">
                Showing {rows.length} of {formatNumber(meta.total)} postings
              </span>
            </div>
          </>
        )}
      </Card>

      {selectedJobId && (
        <Card
          className="mt-3"
          title="Posting detail"
          actions={
            <button type="button" className="btn btn-sm" onClick={() => setSelectedJobId(null)}>
              Close
            </button>
          }
        >
          {detail.loading && <LoadingBlock message="Loading posting..." />}
          {detail.error && <ErrorBlock error={detail.error} onRetry={detail.reload} />}
          {detail.data && (
            <>
              <div className="page-header-row">
                <div>
                  <h2>{detail.data.job.title}</h2>
                  <p className="page-subtitle">
                    {detail.data.job.company_name} - {detail.data.job.location} -{' '}
                    {detail.data.job.employment_type} - posted{' '}
                    {formatDate(detail.data.job.posted_date)}
                  </p>
                </div>
                <div className="badge-row">
                  <span className="badge badge-accent">{detail.data.job.role_title}</span>
                  <span className="badge">{detail.data.job.role_seniority}</span>
                  <span className="badge badge-low">
                    Demand score {Number(detail.data.job.role_demand_score).toFixed(1)}
                  </span>
                </div>
              </div>

              <div className="grid grid-3 mt-2">
                <StatCard
                  label="Salary range"
                  value={formatSalaryRange(detail.data.job.salary_min, detail.data.job.salary_max)}
                />
                <StatCard
                  label="Experience required"
                  value={formatExperienceRange(
                    detail.data.job.experience_min,
                    detail.data.job.experience_max
                  )}
                />
                <StatCard
                  label="Company"
                  value={detail.data.job.company_name}
                  hint={`${detail.data.job.company_industry} - ${detail.data.job.company_size} employees`}
                />
              </div>

              <p className="mt-2">{detail.data.job.description}</p>

              <h3 className="mt-2">Required skills</h3>
              <DataTable
                searchable={false}
                rows={detail.data.skills}
                columns={[
                  { key: 'name', label: 'Skill' },
                  { key: 'category', label: 'Category' },
                  {
                    key: 'importance',
                    label: 'Importance',
                    align: 'num',
                    render: (row) => `${row.importance} / 5`,
                  },
                ]}
              />

              <h3 className="mt-3">Similar postings</h3>
              {detail.data.similarJobs.length === 0 ? (
                <EmptyBlock message="No similar postings for this role yet." />
              ) : (
                <DataTable
                  searchable={false}
                  rows={detail.data.similarJobs}
                  columns={[
                    { key: 'title', label: 'Title' },
                    { key: 'company_name', label: 'Company' },
                    { key: 'location', label: 'Location' },
                    {
                      key: 'salary',
                      label: 'Salary',
                      render: (row) => formatSalaryRange(row.salary_min, row.salary_max),
                    },
                  ]}
                />
              )}
            </>
          )}
        </Card>
      )}

      <div className="grid grid-sidebar-right mt-3">
        <Card title="Skill demand across all postings" note="Top 12 skills by posting volume">
          {demand.loading && <LoadingBlock message="Loading skill demand..." />}
          {demand.error && <ErrorBlock error={demand.error} onRetry={demand.reload} />}
          {demand.data && (
            <HorizontalBarChart
              labels={demand.data.map((skill) => skill.name)}
              values={demand.data.map((skill) => skill.posting_count)}
              label="Postings mentioning the skill"
              className="chart-box"
            />
          )}
          <div className="table-scroll mt-2">
            {demand.data && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Skill</th>
                    <th>Category</th>
                    <th className="num">Postings</th>
                    <th className="num">Avg importance</th>
                  </tr>
                </thead>
                <tbody>
                  {demand.data.map((skill) => (
                    <tr key={skill.id}>
                      <td>{skill.name}</td>
                      <td className="muted">{skill.category}</td>
                      <td className="num">{formatNumber(skill.posting_count)}</td>
                      <td className="num">{Number(skill.avg_importance).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        <Card
          title="Emerging and declining skills"
          note="Shown because the dataset carries quarterly history (8 quarters)."
        >
          {trending.loading && <LoadingBlock message="Loading trends..." />}
          {trending.error && <ErrorBlock error={trending.error} onRetry={trending.reload} />}
          {trending.data && (
            <>
              <h3>Emerging</h3>
              {trending.data.emerging.length === 0 ? (
                <EmptyBlock message="No skill grew significantly in this dataset." />
              ) : (
                <table className="data-table">
                  <tbody>
                    {trending.data.emerging.map((skill) => (
                      <tr key={skill.id}>
                        <td>{skill.name}</td>
                        <td className="num">
                          <TrendBadge trend="emerging" growthRate={skill.growth_rate} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <h3 className="mt-3">Declining</h3>
              {trending.data.declining.length === 0 ? (
                <EmptyBlock message="No skill declined significantly in this dataset." />
              ) : (
                <table className="data-table">
                  <tbody>
                    {trending.data.declining.map((skill) => (
                      <tr key={skill.id}>
                        <td>{skill.name}</td>
                        <td className="num">
                          <span className="badge badge-critical">
                            {formatSignedPercent(skill.growth_rate)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <InfoBanner tone="info" title="Method.">
                Share of postings in {trending.data.baselinePeriods.join(', ')} is compared with{' '}
                {trending.data.recentPeriods.join(', ')} using a two-proportion z-test; only results
                with |z| &gt;= {trending.data.significanceZ} and at least {trending.data.minSample}{' '}
                postings are listed.
              </InfoBanner>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
