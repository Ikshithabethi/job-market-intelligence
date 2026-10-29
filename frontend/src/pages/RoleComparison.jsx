/**
 * Job Role Comparison.
 *
 * Picks up to five roles and compares their required skills, salary band,
 * experience requirement and demand score using tables plus charts.
 */
import { useMemo, useState } from 'react';

import { roleApi } from '../services/api';
import useApiData from '../hooks/useApiData';
import { Card, PageHeader, StatCard } from '../components/Surface.jsx';
import { MultiBarChart, BarChart } from '../components/Charts.jsx';
import { DataTable } from '../components/DataTable.jsx';
import {
  EmptyBlock,
  ErrorBlock,
  InfoBanner,
  LoadingBlock,
  SampleDataBanner,
} from '../components/StateBlocks.jsx';
import { formatCompact, formatCurrencyINR, formatNumber } from '../utils/format';

const MAX_ROLES = 5;

export default function RoleComparison() {
  const [selectedIds, setSelectedIds] = useState([1, 12, 17]);
  const [familyFilter, setFamilyFilter] = useState('');

  const roles = useApiData((signal) => roleApi.list({ limit: 100 }, signal), []);
  const families = useApiData((signal) => roleApi.families(signal), []);

  const comparison = useApiData(
    (signal) => roleApi.compare(selectedIds, signal),
    [selectedIds.join(',')],
    { enabled: selectedIds.length >= 2 }
  );

  const allRoles = roles.data || [];

  const visibleRoles = useMemo(
    () => (familyFilter ? allRoles.filter((role) => role.family === familyFilter) : allRoles),
    [allRoles, familyFilter]
  );

  const toggleRole = (roleId) => {
    setSelectedIds((current) => {
      if (current.includes(roleId)) return current.filter((id) => id !== roleId);
      if (current.length >= MAX_ROLES) return current;
      return [...current, roleId];
    });
  };

  const data = comparison.data;
  const comparedRoles = (data && data.roles) || [];

  return (
    <div>
      <PageHeader
        title="Job Role Comparison"
        subtitle={`Compare up to ${MAX_ROLES} roles on required skills, salary, experience and demand. All values come from the seeded dataset.`}
      />

      <SampleDataBanner />

      <Card
        title="Select roles to compare"
        note={`${selectedIds.length} of ${MAX_ROLES} selected. Comparison needs at least two roles.`}
        actions={
          <>
            {families.data && (
              <select
                value={familyFilter}
                onChange={(event) => setFamilyFilter(event.target.value)}
                style={{ maxWidth: 240 }}
                aria-label="Filter roles by family"
              >
                <option value="">All families</option>
                {families.data.map((entry) => (
                  <option key={entry.family} value={entry.family}>
                    {entry.family} ({entry.role_count})
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setSelectedIds([])}
              disabled={selectedIds.length === 0}
            >
              Clear selection
            </button>
          </>
        }
      >
        {roles.loading && <LoadingBlock message="Loading roles..." />}
        {roles.error && <ErrorBlock error={roles.error} onRetry={roles.reload} />}
        {roles.data && (
          <div className="badge-row" style={{ maxHeight: 220, overflowY: 'auto' }}>
            {visibleRoles.map((role) => {
              const isSelected = selectedIds.includes(role.id);
              return (
                <button
                  key={role.id}
                  type="button"
                  className={`skill-pill ${isSelected ? 'owned' : ''}`}
                  onClick={() => toggleRole(role.id)}
                  title={`${role.family} - ${role.posting_count} postings`}
                >
                  {role.title}
                  <span className="muted small">{role.seniority}</span>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {selectedIds.length < 2 && (
        <div className="mt-3">
          <InfoBanner tone="warning" title="Selection incomplete.">
            Pick at least two roles above to build the comparison.
          </InfoBanner>
        </div>
      )}

      {comparison.loading && <LoadingBlock message="Comparing roles..." />}
      {comparison.error && <ErrorBlock error={comparison.error} onRetry={comparison.reload} />}
      {comparison.error && (
        <div className="mt-2">
          <InfoBanner tone="info">
            If you just cleared the selection, add two roles again to recompute the comparison.
          </InfoBanner>
        </div>
      )}

      {data && comparedRoles.length >= 2 && (
        <>
          <div className="grid grid-2 mt-3">
            <Card title="Average salary of actual postings" note="Illustrative annual salary, INR">
              <BarChart
                labels={comparedRoles.map((role) => role.title)}
                values={comparedRoles.map((role) => role.avg_salary_actual)}
                label="Average salary"
                className="chart-box chart-box-md"
              />
            </Card>
            <Card title="Demand score" note="0-100, derived from posting volume and recency">
              <BarChart
                labels={comparedRoles.map((role) => role.title)}
                values={comparedRoles.map((role) => role.demand_score)}
                label="Demand score"
                className="chart-box chart-box-md"
              />
            </Card>
          </div>

          <div className="grid grid-2 mt-3">
            <Card
              title="Experience requirement"
              note="Minimum and maximum years observed in the postings"
            >
              <MultiBarChart
                labels={comparedRoles.map((role) => role.title)}
                series={[
                  {
                    label: 'Minimum years',
                    values: comparedRoles.map((role) => role.avg_experience_min || 0),
                  },
                  {
                    label: 'Maximum years',
                    values: comparedRoles.map((role) => role.avg_experience_max || 0),
                  },
                ]}
              />
            </Card>

            <Card title="Salary band versus postings" note="Declared band and observed volume">
              <MultiBarChart
                labels={comparedRoles.map((role) => role.title)}
                series={[
                  {
                    label: 'Band minimum',
                    values: comparedRoles.map((role) => role.avg_salary_min || 0),
                  },
                  {
                    label: 'Band maximum',
                    values: comparedRoles.map((role) => role.avg_salary_max || 0),
                  },
                ]}
              />
            </Card>
          </div>

          <Card className="mt-3" title="Role summary">
            <DataTable
              searchable={false}
              rows={comparedRoles}
              columns={[
                { key: 'title', label: 'Role' },
                { key: 'family', label: 'Family' },
                { key: 'seniority', label: 'Level' },
                {
                  key: 'demand_score',
                  label: 'Demand score',
                  align: 'num',
                  render: (row) => Number(row.demand_score).toFixed(1),
                },
                {
                  key: 'posting_count',
                  label: 'Postings',
                  align: 'num',
                  render: (row) => formatNumber(row.posting_count),
                },
                {
                  key: 'avg_salary_actual',
                  label: 'Avg salary',
                  align: 'num',
                  render: (row) => formatCurrencyINR(row.avg_salary_actual),
                },
                {
                  key: 'band',
                  label: 'Band',
                  render: (row) =>
                    `${formatCompact(row.avg_salary_min)} - ${formatCompact(row.avg_salary_max)}`,
                },
                {
                  key: 'experience',
                  label: 'Experience',
                  render: (row) =>
                    `${Number(row.avg_experience_min || 0).toFixed(1)} - ${Number(
                      row.avg_experience_max || 0
                    ).toFixed(1)} years`,
                },
                {
                  key: 'skills',
                  label: 'Skills required',
                  align: 'num',
                  render: (row) => row.skills.length,
                },
              ]}
            />
          </Card>

          <div className="grid grid-4 mt-3">
            {comparedRoles.map((role) => (
              <StatCard
                key={role.id}
                label={role.title}
                value={formatCompact(role.avg_salary_actual)}
                hint={`${role.skills.length} required skills, demand ${Number(role.demand_score).toFixed(1)}`}
              />
            ))}
          </div>

          <Card
            className="mt-3"
            title="Required skill matrix"
            note="importance out of 5 per role. 'Shared by all' means every compared role asks for it."
          >
            {data.skillMatrix.length === 0 ? (
              <EmptyBlock message="These roles share no catalogued skills." />
            ) : (
              <DataTable
                searchPlaceholder="Search skills..."
                initialSearch=""
                rows={data.skillMatrix}
                searchText={(row) => `${row.name} ${row.category}`}
                columns={[
                  { key: 'name', label: 'Skill' },
                  { key: 'category', label: 'Category' },
                  ...comparedRoles.map((role) => ({
                    key: `role-${role.id}`,
                    label: role.title,
                    align: 'num',
                    sortable: false,
                    render: (row) => {
                      const importance = row.importanceByRole[role.id];
                      if (!importance) return <span className="muted">-</span>;
                      return importance;
                    },
                  })),
                  {
                    key: 'presentIn',
                    label: 'Roles',
                    align: 'num',
                    render: (row) => `${row.presentIn} / ${comparedRoles.length}`,
                  },
                  {
                    key: 'sharedByAll',
                    label: 'Shared by all',
                    render: (row) =>
                      row.sharedByAll ? (
                        <span className="badge badge-low">shared</span>
                      ) : (
                        <span className="muted">no</span>
                      ),
                  },
                ]}
              />
            )}
          </Card>

          <div className="grid grid-2 mt-3">
            <Card title="Skills shared by every compared role">
              {data.sharedSkills.length === 0 ? (
                <EmptyBlock message="No skill is common to all compared roles." />
              ) : (
                <div className="badge-row">
                  {data.sharedSkills.map((skill) => (
                    <span key={skill.skill_id} className="badge badge-accent">
                      {skill.name}
                    </span>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Role specific skills" note="Skills asked for by exactly one compared role">
              <dl className="kv-list">
                {comparedRoles.map((role) => {
                  const specific = data.roleSpecificSkills[role.id] || [];
                  return (
                    <div key={role.id}>
                      <dt>{role.title}</dt>
                      <dd>
                        {specific.length === 0 ? (
                          <span className="muted">none</span>
                        ) : (
                          specific.join(', ')
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
