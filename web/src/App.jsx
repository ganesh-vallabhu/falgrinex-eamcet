import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider.jsx';
import { PageLoader } from './components/Feedback.jsx';
import AppShell from './components/AppShell.jsx';
import { useRouteSeo } from './lib/seo.js';

const Landing = lazy(() => import('./pages/Landing.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const SetPassword = lazy(() => import('./pages/SetPassword.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Subjects = lazy(() => import('./pages/Subjects.jsx'));
const Tests = lazy(() => import('./pages/Tests.jsx'));
const QuizRunner = lazy(() => import('./pages/QuizRunner.jsx'));
const ResultPage = lazy(() => import('./pages/ResultPage.jsx'));
const Resources = lazy(() => import('./pages/Resources.jsx'));
const Leaderboard = lazy(() => import('./pages/Leaderboard.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const Admin = lazy(() => import('./pages/Admin.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

function Protected({ children, adminOnly = false }) {
  const { loading, isAuthenticated, isAdmin } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader label="Checking your session" />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (adminOnly && !isAdmin) return <Navigate to="/app" replace />;
  return children;
}

export default function App() {
  useRouteSeo();
  const location = useLocation();
  return (
    <Suspense fallback={<PageLoader label="Loading" />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/set-password" element={<SetPassword />} />
        <Route
          path="/app"
          element={<Protected><AppShell /></Protected>}
        >
          <Route index element={<Dashboard />} />
          <Route path="subjects" element={<Subjects />} />
          <Route path="practice/:subject/:chapter/:difficulty" element={<QuizRunner key={location.pathname} mode="practice" />} />
          <Route path="tests" element={<Tests />} />
          <Route path="test/:bank/:title" element={<QuizRunner key={location.pathname} mode="test" />} />
          <Route path="result/:uid/:attemptId" element={<ResultPage />} />
          <Route path="resources" element={<Resources />} />
          <Route path="leaderboard" element={<Leaderboard />} />
          <Route path="profile" element={<Profile />} />
          <Route
            path="admin"
            element={<Protected adminOnly><Admin /></Protected>}
          />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
