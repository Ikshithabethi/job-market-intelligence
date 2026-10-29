/**
 * Route table.
 *
 * Public pages read the market dataset; /profile is the only page that needs an
 * account because it reads and writes user-scoped saved skills and roadmaps.
 */
import { Route, Routes } from 'react-router-dom';

import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

import Dashboard from './pages/Dashboard.jsx';
import JobMarket from './pages/JobMarket.jsx';
import RoleComparison from './pages/RoleComparison.jsx';
import KnowledgeGraph from './pages/KnowledgeGraph.jsx';
import CareerPath from './pages/CareerPath.jsx';
import SkillRecommendations from './pages/SkillRecommendations.jsx';
import Profile from './pages/Profile.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="jobs" element={<JobMarket />} />
        <Route path="roles" element={<RoleComparison />} />
        <Route path="graph" element={<KnowledgeGraph />} />
        <Route path="career" element={<CareerPath />} />
        <Route path="skills" element={<SkillRecommendations />} />
        <Route
          path="profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
