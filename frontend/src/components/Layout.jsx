/**
 * Layout: persistent sidebar navigation plus a slim top bar.
 * The sidebar collapses behind a toggle on narrow screens.
 */
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import ApiStatusBanner from './ApiStatusBanner.jsx';

const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [{ to: '/', label: 'Dashboard', end: true }],
  },
  {
    label: 'Market analysis',
    items: [
      { to: '/jobs', label: 'Job Market Intelligence' },
      { to: '/roles', label: 'Job Role Comparison' },
      { to: '/graph', label: 'Knowledge Graph' },
    ],
  },
  {
    label: 'Career planning',
    items: [
      { to: '/career', label: 'Career Path Analytics' },
      { to: '/skills', label: 'Skill Recommendations' },
    ],
  },
  {
    label: 'Account',
    items: [{ to: '/profile', label: 'Profile' }],
  },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const closeSidebar = () => setSidebarOpen(false);

  const handleLogout = async () => {
    await logout();
    closeSidebar();
    navigate('/', { replace: true });
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-title">Job Market Intelligence</div>
          <div className="sidebar-brand-subtitle">
            Career path analytics using knowledge graphs
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <div className="sidebar-section-label">{section.label}</div>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                  onClick={closeSidebar}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          {isAuthenticated ? (
            <>
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>
                {user.full_name || user.email}
              </div>
              <div className="mt-1">
                <button type="button" className="btn btn-sm btn-block" onClick={handleLogout}>
                  Log out
                </button>
              </div>
            </>
          ) : (
            <>
              <div>Signed out. Browsing is read-only.</div>
              <div className="mt-1">
                <NavLink to="/login" className="btn btn-sm btn-block" onClick={closeSidebar}>
                  Log in
                </NavLink>
              </div>
            </>
          )}
        </div>
      </aside>

      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={closeSidebar} role="presentation" />
      )}

      <div className="main-area">
        <div className="topbar">
          <button
            type="button"
            className="btn btn-sm sidebar-toggle"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label="Toggle navigation"
          >
            Menu
          </button>
          <span className="topbar-title">
            Web-Based Job Market Intelligence and Career Path Analytics
          </span>
          <span className="topbar-spacer" />
          {isAuthenticated ? (
            <span className="topbar-user">
              {user.full_name || user.email}
              <br />
              <NavLink to="/profile" className="small">
                View profile
              </NavLink>
            </span>
          ) : (
            <span className="topbar-user">
              <NavLink to="/login" className="small">
                Log in
              </NavLink>
            </span>
          )}
        </div>

        <main className="page">
          <ApiStatusBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
