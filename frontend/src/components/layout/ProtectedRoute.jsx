import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Logo from './Logo';
import { isTelegram } from '../../telegram';
import { HomeRedirect } from './FeatureRoute';

function FullScreenLoader() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="flex flex-col items-center gap-3">
        <Logo />
        <div className="h-1 w-24 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-brand-500" />
        </div>
      </div>
    </div>
  );
}

export default function ProtectedRoute() {
  const { isAuthenticated, booting } = useAuth();
  const location = useLocation();
  if (booting) return <FullScreenLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/**
 * Only for role 'admin'; everyone else is sent back to the dashboard. This only hides the page:
 * the real protection is the backend, which answers 403 to non-admins on every /api/admin call.
 */
export function AdminRoute() {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return <Outlet />;
}

/**
 * "/": the landing page for visitors, the app (dashboard / sales) for signed-in users.
 * Inside Telegram the Mini App goes straight to sign-in.
 */
export function RootRoute({ landing }) {
  const { isAuthenticated, booting } = useAuth();
  if (booting) return <FullScreenLoader />;
  if (isAuthenticated) return <HomeRedirect />;
  if (isTelegram) return <Navigate to="/login" replace />;
  return landing;
}

export function GuestRoute() {
  const { isAuthenticated, booting } = useAuth();
  if (booting) return <FullScreenLoader />;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <Outlet />;
}
