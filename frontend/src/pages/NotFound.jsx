/**
 * Fallback page for any URL that does not match a route.
 * Rendered inside the app Layout, so the sidebar stays available.
 */
import { Link, useLocation } from 'react-router-dom';

import { Card, PageHeader } from '../components/Surface.jsx';
import { EmptyBlock } from '../components/StateBlocks.jsx';

export default function NotFound() {
  const location = useLocation();

  return (
    <div>
      <PageHeader title="Page not found" subtitle="That address does not match any page in this application." />

      <Card title="Nothing at this address">
        <EmptyBlock message={`No page is registered for "${location.pathname}".`} />
        <div className="filter-actions">
          <Link className="btn btn-primary" to="/">
            Go to the dashboard
          </Link>
          <Link className="btn" to="/jobs">
            Browse job postings
          </Link>
          <Link className="btn" to="/career">
            Career path analytics
          </Link>
        </div>
      </Card>
    </div>
  );
}
