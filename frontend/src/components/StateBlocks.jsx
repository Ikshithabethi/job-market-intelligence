/**
 * Loading / error / empty states and the sample-data notice.
 * Every page uses these so behaviour is consistent across the app.
 */
import { formatSignedPercent, priorityBadgeClass, trendBadgeClass } from '../utils/format';

export function LoadingBlock({ message = 'Loading data from the API...' }) {
  return (
    <div className="loading-block">
      <span className="spinner" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

export function ErrorBlock({ error, onRetry }) {
  const message =
    error && error.message
      ? error.message
      : 'Something went wrong while loading this section.';

  return (
    <div className="banner banner-error" role="alert">
      <div>
        <span className="banner-title">Error.</span>
        {message}
        {onRetry && (
          <div className="mt-1">
            <button type="button" className="btn btn-sm" onClick={onRetry}>
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function EmptyBlock({ message = 'No records match the current selection.' }) {
  return <div className="empty-block">{message}</div>;
}

export function InfoBanner({ children, tone = 'info', title }) {
  return (
    <div className={`banner banner-${tone}`}>
      <div>
        {title && <span className="banner-title">{title}</span>}
        {children}
      </div>
    </div>
  );
}

/**
 * The whole dataset is synthetic. This notice is rendered on every page that
 * shows market figures so the numbers are never mistaken for live statistics.
 */
export function SampleDataBanner({ disclaimer }) {
  return (
    <div className="banner banner-sample">
      <div>
        <span className="banner-title">Sample data.</span>
        All figures on this page are calculated from a synthetic sample dataset generated for
        academic use. They are not live job market statistics.
        {disclaimer ? ` ${disclaimer}` : ''}
      </div>
    </div>
  );
}

export function TrendBadge({ trend, growthRate }) {
  const label = trend === 'stable' ? 'stable' : `${trend} ${formatSignedPercent(growthRate)}`;
  return <span className={`badge ${trendBadgeClass(trend)}`}>{label}</span>;
}

export function PriorityBadge({ label }) {
  if (!label) return null;
  return <span className={`badge ${priorityBadgeClass(label)}`}>{label}</span>;
}

export function ProgressBar({ value, hint }) {
  const percent = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div>
      <div className="small muted">
        {percent.toFixed(0)}%{hint ? ` ${hint}` : ''}
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default LoadingBlock;
