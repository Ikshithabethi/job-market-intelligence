/**
 * Chart.js wrappers.
 *
 * Chart.js needs a real <canvas> and an imperative instance, so the wrapper
 * creates and destroys the chart inside an effect. The chart is keyed on a
 * serialised copy of its config, which keeps a parent re-render from tearing
 * the chart down when nothing actually changed.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

/** Soft blue/teal/grey palette - readable on white, no bright accent colours. */
export const CHART_COLORS = [
  '#2f6fd0',
  '#4f93e0',
  '#7ab0e8',
  '#1f7a4d',
  '#54a37a',
  '#9a6510',
  '#c8873c',
  '#6b7f99',
  '#94a6bd',
  '#b3261e',
];

export const AXIS_COLOR = '#dfe4ec';
export const TICK_COLOR = '#5c6b80';

export function baseOptions(overrides = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false, labels: { color: TICK_COLOR, boxWidth: 12, font: { size: 11 } } },
      tooltip: {
        backgroundColor: '#1f2733',
        titleFont: { size: 12 },
        bodyFont: { size: 12 },
        padding: 10,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: TICK_COLOR, font: { size: 11 }, maxRotation: 45, minRotation: 0 },
      },
      y: {
        grid: { color: AXIS_COLOR },
        ticks: { color: TICK_COLOR, font: { size: 11 } },
        beginAtZero: true,
      },
    },
    ...overrides,
  };
}

/** Horizontal bar charts hide the y grid and swap the axes round. */
export function horizontalBarOptions(overrides = {}) {
  return baseOptions({
    indexAxis: 'y',
    scales: {
      x: {
        grid: { color: AXIS_COLOR },
        ticks: { color: TICK_COLOR, font: { size: 11 } },
        beginAtZero: true,
      },
      y: {
        grid: { display: false },
        ticks: { color: TICK_COLOR, font: { size: 11 } },
      },
    },
    ...overrides,
  });
}

export function doughnutOptions(overrides = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '58%',
    plugins: {
      legend: {
        display: true,
        position: 'right',
        labels: { color: TICK_COLOR, boxWidth: 12, font: { size: 11 } },
      },
      tooltip: { backgroundColor: '#1f2733', padding: 10 },
    },
    ...overrides,
  };
}

export function ChartCanvas({ type, data, options, className = 'chart-box chart-box-md' }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const configKey = useMemo(() => JSON.stringify({ type, data, options }), [type, data, options]);

  useEffect(() => {
    if (!canvasRef.current) return undefined;

    chartRef.current = new Chart(canvasRef.current.getContext('2d'), {
      type,
      data: JSON.parse(configKey).data,
      options: JSON.parse(configKey).options,
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [configKey, type]);

  return (
    <div className={className}>
      <canvas ref={canvasRef} />
    </div>
  );
}

export function BarChart({ labels, values, label = 'Value', options, className, colors }) {
  const data = useMemo(
    () => ({
      labels,
      datasets: [
        {
          label,
          data: values,
          backgroundColor: colors || CHART_COLORS[0],
          borderRadius: 4,
          maxBarThickness: 42,
        },
      ],
    }),
    [labels, values, label, colors]
  );
  return <ChartCanvas type="bar" data={data} options={options || baseOptions()} className={className} />;
}

export function HorizontalBarChart({ labels, values, label = 'Value', options, className }) {
  const data = useMemo(
    () => ({
      labels,
      datasets: [
        {
          label,
          data: values,
          backgroundColor: CHART_COLORS[0],
          borderRadius: 4,
          maxBarThickness: 22,
        },
      ],
    }),
    [labels, values, label]
  );
  return (
    <ChartCanvas
      type="bar"
      data={data}
      options={options || horizontalBarOptions()}
      className={className || 'chart-box chart-box-md'}
    />
  );
}

export function LineChart({
  labels,
  values,
  label = 'Value',
  options,
  className,
  color = CHART_COLORS[0],
  fill = true,
}) {
  const data = useMemo(
    () => ({
      labels,
      datasets: [
        {
          label,
          data: values,
          borderColor: color,
          backgroundColor: fill ? 'rgba(47, 111, 208, 0.12)' : color,
          fill,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: color,
          borderWidth: 2,
        },
      ],
    }),
    [labels, values, label, color, fill]
  );
  return (
    <ChartCanvas
      type="line"
      data={data}
      options={options || baseOptions()}
      className={className || 'chart-box chart-box-md'}
    />
  );
}

export function MultiLineChart({ labels, series, options, className }) {
  const data = useMemo(
    () => ({
      labels,
      datasets: series.map((entry, index) => ({
        label: entry.label,
        data: entry.values,
        borderColor: CHART_COLORS[index % CHART_COLORS.length],
        backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
        fill: false,
        tension: 0.3,
        pointRadius: 2,
        borderWidth: 2,
      })),
    }),
    [labels, series]
  );
  return (
    <ChartCanvas
      type="line"
      data={data}
      options={options || baseOptions({ plugins: { legend: { display: true, labels: { color: TICK_COLOR, boxWidth: 12, font: { size: 11 } } } } })}
      className={className || 'chart-box chart-box-md'}
    />
  );
}

/**
 * Grouped bar chart: one group of bars per label, one bar per series.
 * series: [{ label, values: number[] }]
 */
export function MultiBarChart({ labels, series, options, className }) {
  const data = useMemo(
    () => ({
      labels,
      datasets: series.map((entry, index) => ({
        label: entry.label,
        data: entry.values,
        backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
        borderRadius: 4,
        maxBarThickness: 32,
      })),
    }),
    [labels, series]
  );

  const legendOptions = baseOptions({
    plugins: {
      legend: { display: true, labels: { color: TICK_COLOR, boxWidth: 12, font: { size: 11 } } },
      tooltip: { backgroundColor: '#1f2733', padding: 10 },
    },
  });

  return (
    <ChartCanvas
      type="bar"
      data={data}
      options={options || legendOptions}
      className={className || 'chart-box chart-box-md'}
    />
  );
}

export function DoughnutChart({ labels, values, options, className }) {
  const data = useMemo(
    () => ({
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: CHART_COLORS,
          borderColor: '#ffffff',
          borderWidth: 2,
        },
      ],
    }),
    [labels, values]
  );
  return (
    <ChartCanvas
      type="doughnut"
      data={data}
      options={options || doughnutOptions()}
      className={className || 'chart-box chart-box-md'}
    />
  );
}

export default ChartCanvas;
