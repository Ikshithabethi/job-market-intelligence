/**
 * Small formatting helpers shared by the pages.
 * Salaries in this dataset are illustrative ANNUAL figures in INR (lakh/crore
 * notation is used because that is how Indian salary ranges are usually read).
 */

export function formatNumber(value, fallback = '--') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  return Number(value).toLocaleString('en-IN');
}

export function formatCompact(value, fallback = '--') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  const number = Number(value);
  if (Math.abs(number) >= 10000000) return `${(number / 10000000).toFixed(2)} Cr`;
  if (Math.abs(number) >= 100000) return `${(number / 100000).toFixed(2)} L`;
  if (Math.abs(number) >= 1000) return `${(number / 1000).toFixed(1)} K`;
  return String(number);
}

export function formatCurrencyINR(value, fallback = '--') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  return `INR ${Number(value).toLocaleString('en-IN')}`;
}

export function formatSalaryRange(min, max) {
  if (!min && !max) return 'Not stated';
  if (!max) return formatCompact(min);
  if (!min) return formatCompact(max);
  return `${formatCompact(min)} - ${formatCompact(max)}`;
}

export function formatPercent(value, digits = 1, fallback = '--') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  return `${Number(value).toFixed(digits)}%`;
}

export function formatSignedPercent(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
  const number = Number(value);
  return `${number > 0 ? '+' : ''}${number.toFixed(digits)}%`;
}

export function formatDate(value, fallback = '--') {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' });
}

export function formatDateTime(value, fallback = '--') {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatYears(value, fallback = '--') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  const number = Number(value);
  return `${number % 1 === 0 ? number.toFixed(0) : number.toFixed(1)} years`;
}

export function formatExperienceRange(min, max) {
  if (min === null && max === null) return 'Not stated';
  return `${min ?? 0}-${max ?? '?'} years`;
}

/** "data engineering" -> "Data Engineering" */
export function titleCase(value) {
  if (!value) return '';
  return String(value)
    .split(' ')
    .map((word) => (word.length ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

/** Maps a trend label from the API to a badge class. */
export function trendBadgeClass(trend) {
  if (trend === 'emerging' || trend === 'rising') return 'badge-low';
  if (trend === 'declining') return 'badge-critical';
  return 'badge';
}

/** Maps a recommendation priority label to a badge class. */
export function priorityBadgeClass(label) {
  if (label === 'critical') return 'badge-critical';
  if (label === 'high') return 'badge-high';
  if (label === 'medium') return 'badge-medium';
  return 'badge-low';
}

export function truncate(value, length = 140) {
  if (!value) return '';
  const text = String(value);
  return text.length > length ? `${text.slice(0, length - 1)}...` : text;
}
