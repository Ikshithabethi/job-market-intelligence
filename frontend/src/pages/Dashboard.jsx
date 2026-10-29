/**
 * Dashboard - headline market metrics, all computed by the backend from the
 * seeded dataset (nothing on this page is hardcoded).
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { analyticsApi, skillApi } from '../services/api';
import useApiData from '../hooks/useApiData';
import { Card, PageHeader, StatCard } from '../components/Surface.jsx';
import { BarChart, DoughnutChart, HorizontalBarChart, LineChart, baseOptions } from '../components/Charts.jsx';
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
  formatCurrencyINR,
  formatNumber,
  formatPercent,
} from '../utils/format';

export default function Dashboard() {
  const dashboard = useApiData((signal) => analyticsApi.dashboard(signal), []);
  const trending = useApiData((signal) => skillApi.trending({ limit: 6 }, signal), []);

  const data = dashboard.data;
  const overview = data && data.overview;
  const disclaimer = data && data.dataSource ? data.dataSource.disclaimer : null;

  const quarterChart = useMemo(() => {
    const rows = (overview && overview.jobsPerQuarter) || [];
    return {
      labels: rows.map((row) => row.period),
      values: rows.map((row) => row.posting_count),
    };
  }, [overview]);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Totals, demand patterns and salary structure for the sample job market dataset. Every figure is aggregated from the database, not hardcoded."
        actions={
          <>
            <Link className="btn btn-sm" to="/jobs">
              Explore postings
            </Link>
            <Link className="btn btn-sm" to="/graph">
              Open knowledge graph
            </Link>
          </>
        }
      />

      {dashboard.loading && <LoadingBlock message="Loading dashboard metrics..." />}
      {dashboard.error && <ErrorBlock error={dashboard.error} onRetry={dashboard.reload} />}

      {!dashboard.loading && !dashboard.error && !data && (
        <EmptyBlock message="The dashboard returned no data. Load the dataset with 'npm run seed' in the backend folder." />
      )}

      {!dashboard.loading && !dashboard.error && data && (
        <>
          <SampleDataBanner disclaimer={disclaimer} />

          <div className="grid grid-5">
            <StatCard
              label="Job postings"
              value={formatNumber(overview.counts.total_jobs)}
              hint={`${overview.counts.total_locations} locations in the sample`}
            />
            <StatCard
              label="Companies"
              value={formatNumber(overview.counts.total_companies)}
              hint="Fictional employers"
            />
            <StatCard
              label="Job roles"
              value={formatNumber(overview.counts.total_roles)}
              hint={`${overview.experience.average} years average experience`}
            />
            <StatCard
              label="Skills tracked"
              value={formatNumber(overview.counts.total_skills)}
              hint="Distinct skills referenced"
            />
            <StatCard
              label="Average salary"
              value={formatCompact(overview.salary.average)}
              hint={`Range ${formatCompact(overview.salary.min)} - ${formatCompact(overview.salary.max)}`}
            />
          </div>

          <div className="grid grid-2 mt-3">
            <Card
              title="Postings per quarter"
              note="The final quarter is partial: the observation window ends mid quarter."
            >
              <LineChart
                labels={quarterChart.labels}
                values={quarterChart.values}
                label="Postings"
                className="chart-box chart-box-md"
              />
            </Card>

            <Card title="Average salary by role family" note="Illustrative annual salary, INR">
              <HorizontalBarChart
                labels={data.salaryInsights.byFamily.map((row) => row.family)}
                values={data.salaryInsights.byFamily.map((row) => row.avg_salary)}
                label="Average salary"
                className="chart-box chart-box-md"
              />
            </Card>
          </div>

          <div className="grid grid-3 mt-3">
            <Card title="Postings by experience band">
              <BarChart
                labels={data.demandStatistics.byExperience.map((row) => row.experience_band)}
                values={data.demandStatistics.byExperience.map((row) => row.posting_count)}
                label="Postings"
                className="chart-box chart-box-sm"
                options={baseOptions()}
              />
            </Card>

            <Card title="Employment type mix">
              <DoughnutChart
                labels={data.demandStatistics.byEmploymentType.map((row) => row.employment_type)}
                values={data.demandStatistics.byEmploymentType.map((row) => row.posting_count)}
                className="chart-box chart-box-sm"
              />
            </Card>

            <Card title="Average salary by seniority">
              <BarChart
                labels={data.salaryInsights.bySeniority.map((row) => row.seniority)}
                values={data.salaryInsights.bySeniority.map((row) => row.avg_salary)}
                label="Average salary"
                className="chart-box chart-box-sm"
              />
            </Card>
          </div>

          <div className="grid grid-sidebar-right mt-3">
            <Card
              title="Most advertised roles"
              note="Ranked by posting volume, with the demand score computed by the API."
            >
              <DataTable
                searchPlaceholder="Search roles..."
                rows={data.popularRoles}
                searchText={(row) => `${row.title} ${row.family} ${row.seniority}`}
                columns={[
                  { key: 'title', label: 'Role' },
                  {
                    key: 'family',
                    label: 'Family',
                    render: (row) => <span className="muted">{row.family}</span>,
                  },
                  { key: 'seniority', label: 'Level' },
                  {
                    key: 'posting_count',
                    label: 'Postings',
                    align: 'num',
                    render: (row) => formatNumber(row.posting_count),
                  },
                  {
                    key: 'demand_score',
                    label: 'Demand score',
                    align: 'num',
                    render: (row) => Number(row.demand_score).toFixed(1),
                  },
                  {
                    key: 'avg_salary',
                    label: 'Avg salary (actual postings)',
                    align: 'num',
                    render: (row) => formatCompact(row.avg_salary),
                  },
                ]}
              />
            </Card>

            <div className="grid" style={{ gap: 16, alignContent: 'start' }}>
              <Card
                title="Emerging skills"
                note="Statistically significant share growth between the baseline and recent quarters."
              >
                {trending.loading && <LoadingBlock message="Loading trends..." />}
                {trending.error && <ErrorBlock error={trending.error} onRetry={trending.reload} />}
                {trending.data && (
                  <>
                    {trending.data.emerging.length === 0 ? (
                      <EmptyBlock message="No skill met the significance threshold in this dataset." />
                    ) : (
                      <>
                        <div className="badge-row">
                          {trending.data.emerging.map((skill) => (
                            <TrendBadge
                              key={skill.id}
                              trend="emerging"
                              growthRate={skill.growth_rate}
                            />
                          ))}
                        </div>
                        <table className="data-table mt-2">
                          <tbody>
                            {trending.data.emerging.map((skill) => (
                              <tr key={skill.id}>
                                <td>{skill.name}</td>
                                <td className="num">
                                  {formatCompact(skill.posting_count)} postings
                                </td>
                                <td className="num">
                                  z = {Number(skill.z_score).toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}
                    <div className="divider" />
                    <div className="card-note">
                      Compared windows: {trending.data.baselinePeriods.join(', ')} against{' '}
                      {trending.data.recentPeriods.join(', ')} (significance |z| &gt;={'\u00A0'}
                      {trending.data.significanceZ}, minimum {trending.data.minSample} postings).
                    </div>
                  </>
                )}
              </Card>

              <Card title="Top hiring companies" note="By number of sample postings">
                <DataTable
                  searchable={false}
                  rows={data.topCompanies}
                  columns={[
                    { key: 'name', label: 'Company' },
                    { key: 'industry', label: 'Industry' },
                    {
                      key: 'posting_count',
                      label: 'Postings',
                      align: 'num',
                      render: (row) => formatNumber(row.posting_count),
                    },
                    {
                      key: 'avg_salary',
                      label: 'Avg salary',
                      align: 'num',
                      render: (row) => formatCompact(row.avg_salary),
                    },
                  ]}
                />
              </Card>
            </div>
          </div>

          <div className="grid grid-2 mt-3">
            <Card title="Highest paying locations" note="Average salary of postings in each location">
              <DataTable
                searchable={false}
                rows={data.salaryInsights.byLocation}
                columns={[
                  { key: 'location', label: 'Location' },
                  {
                    key: 'posting_count',
                    label: 'Postings',
                    align: 'num',
                    render: (row) => formatNumber(row.posting_count),
                  },
                  {
                    key: 'avg_salary',
                    label: 'Average salary',
                    align: 'num',
                    render: (row) => formatCurrencyINR(row.avg_salary),
                  },
                ]}
              />
            </Card>

            <Card title="How to read these numbers">
              <InfoBanner tone="info">
                The dataset is generated by <code>python-analysis/generate_seed.py</code> with a
                fixed random seed and covers {formatNumber(overview.counts.total_jobs)} postings
                across {formatNumber(overview.counts.total_roles)} roles and{' '}
                {formatNumber(overview.counts.total_companies)} companies.
              </InfoBanner>
              <dl className="kv-list">
                <div>
                  <dt>Average salary</dt>
                  <dd>{formatCurrencyINR(overview.salary.average)}</dd>
                </div>
                <div>
                  <dt>Advertised range midpoint spread</dt>
                  <dd>
                    {formatCurrencyINR(overview.salary.average_min)} to{' '}
                    {formatCurrencyINR(overview.salary.average_max)}
                  </dd>
                </div>
                <div>
                  <dt>Full-time share</dt>
                  <dd>
                    {formatPercent(
                      data.demandStatistics.byEmploymentType.find(
                        (row) => row.employment_type === 'Full-time'
                      )?.share_percent
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Experience range</dt>
                  <dd>
                    {overview.experience.min} - {overview.experience.max} years
                  </dd>
                </div>
              </dl>
              <div className="card-note mt-2">
                Generated at {new Date(data.generatedAt).toLocaleString('en-IN')}.
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
