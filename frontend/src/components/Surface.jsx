/**
 * Small presentational building blocks used by every page.
 */

export function Card({ title, note, actions, children, className = '', style }) {
  return (
    <section className={`card ${className}`.trim()} style={style}>
      {(title || actions) && (
        <header className="card-header">
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {note && <div className="card-note">{note}</div>}
          </div>
          {actions && <div className="badge-row">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <header className="page-header">
      <div className="page-header-row">
        <div>
          <h1>{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="badge-row">{actions}</div>}
      </div>
    </header>
  );
}

export function StatCard({ label, value, hint }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export default Card;
