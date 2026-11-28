import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute, { AdminRoute, GuestRoute, RootRoute } from './components/layout/ProtectedRoute';
import FeatureRoute from './components/layout/FeatureRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import NotFoundPage from './pages/NotFoundPage';
import TelegramGooglePage from './pages/TelegramGooglePage';
import { ForgotPasswordPage, ResetPasswordPage } from './pages/ForgotPasswordPage';
import { Skeleton } from './components/common/ui';
import { useTheme } from './context/ThemeContext';
import { useI18n } from './i18n';
import { usePageTracking } from './hooks/usePageTracking';
import Splash from './components/layout/Splash';
import WelcomeOverlay from './components/layout/WelcomeOverlay';

// App pages are code-split so the login screen loads fast and charts load on demand.
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ProductsPage = lazy(() => import('./pages/ProductsPage'));
const InventoryPage = lazy(() => import('./pages/InventoryPage'));
const SalesPage = lazy(() => import('./pages/SalesPage'));
const ExpensesPage = lazy(() => import('./pages/ExpensesPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const ForecastPage = lazy(() => import('./pages/ForecastPage'));
const ImportPage = lazy(() => import('./pages/ImportPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const BillingPage = lazy(() => import('./pages/BillingPage'));
const CustomersPage = lazy(() => import('./pages/CustomersPage'));
const SuppliersPage = lazy(() => import('./pages/SuppliersPage'));
const StaffPage = lazy(() => import('./pages/StaffPage'));
const BonusPage = lazy(() => import('./pages/BonusPage'));
const StockCountPage = lazy(() => import('./pages/StockCountPage'));
const LabelsPage = lazy(() => import('./pages/LabelsPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const ContestPage = lazy(() => import('./pages/ContestPage'));
const ShopsMapPage = lazy(() => import('./pages/ShopsMapPage'));
const ShopCatalogPage = lazy(() => import('./pages/ShopCatalogPage'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
// Admin panel: only for role 'admin' (menu item + route); every request is checked on the backend.
const AdminPage = lazy(() => import('./pages/AdminPage'));

function PageFallback() {
  const { t } = useI18n();
  return (
    <div aria-busy="true" aria-label={t('common.loading')}>
      <Skeleton className="mb-6 h-8 w-56" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      <Skeleton className="h-80" />
    </div>
  );
}

export default function App() {
  const { isDark } = useTheme();
  usePageTracking();
  return (
    <>
      <Splash />
      <WelcomeOverlay />
      <Routes>
        <Route path="/" element={<RootRoute landing={<Suspense fallback={null}><LandingPage /></Suspense>} />} />
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout fallback={<PageFallback />} />}>
            {/* Sellers (staff): sales, nasiya and their profile. */}
            <Route path="/sales" element={<SalesPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/shops" element={<ShopsMapPage />} />
            <Route path="/shops/:id" element={<ShopCatalogPage />} />
            <Route element={<FeatureRoute feature="debts" />}>
              <Route path="/customers" element={<CustomersPage />} />
            </Route>
            {/* Owner only */}
            <Route element={<FeatureRoute ownerOnly />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/inventory/count" element={<StockCountPage />} />
              <Route path="/labels" element={<LabelsPage />} />
              <Route path="/forecast" element={<ForecastPage />} />
              <Route path="/ai" element={<Navigate to="/forecast" replace />} />
              <Route path="/import" element={<ImportPage />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/staff" element={<StaffPage />} />
              <Route path="/bonus" element={<BonusPage />} />
              <Route path="/contest" element={<ContestPage />} />
              {/* Pro plan and up */}
              <Route element={<FeatureRoute feature="expenses" />}>
                <Route path="/expenses" element={<ExpensesPage />} />
              </Route>
              <Route element={<FeatureRoute feature="analytics" />}>
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/reports" element={<ReportsPage />} />
              </Route>
              <Route element={<FeatureRoute feature="suppliers" />}>
                <Route path="/suppliers" element={<SuppliersPage />} />
              </Route>
            </Route>
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<AdminPage />} />
            </Route>
          </Route>
        </Route>
        {/* Outside GuestRoute: it must work even if this browser is already signed in. */}
        <Route path="/tg-google" element={<TelegramGooglePage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Toaster
        position={window.matchMedia('(max-width: 1023px)').matches ? 'top-center' : 'top-right'}
        containerStyle={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
        toastOptions={{
          duration: 3500,
          style: {
            fontSize: '14px',
            borderRadius: '10px',
            background: isDark ? '#18181b' : '#fff',
            color: isDark ? '#f4f4f5' : '#18181b',
            border: `1px solid ${isDark ? '#27272a' : '#e4e4e7'}`,
          },
          success: { iconTheme: { primary: '#059669', secondary: '#fff' } },
        }}
      />
    </>
  );
}


