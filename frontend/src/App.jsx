import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import LoginPage from './pages/LoginPage';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const AssetsPage = lazy(() => import('./pages/AssetsPage'));
const AssetDetailPage = lazy(() => import('./pages/AssetDetailPage'));
const AssetFormPage = lazy(() => import('./pages/AssetFormPage'));
const RepairsPage = lazy(() => import('./pages/RepairsPage'));
const QrLabelsPage = lazy(() => import('./pages/QrLabelsPage'));
const ScanPage = lazy(() => import('./pages/ScanPage'));
const ImportExportPage = lazy(() => import('./pages/ImportExportPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function FullPageSpinner() {
  return (
    <div className="grid min-h-[50vh] place-items-center text-slate-400">
      <Spinner className="size-6" />
    </div>
  );
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

function RequireAdmin({ children }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster position="top-right" richColors closeButton theme={theme} />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<FullPageSpinner />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                element={
                  <RequireAuth>
                    <Layout />
                  </RequireAuth>
                }
              >
                <Route index element={<DashboardPage />} />
                <Route path="assets" element={<AssetsPage />} />
                <Route path="assets/new" element={<RequireAdmin><AssetFormPage /></RequireAdmin>} />
                <Route path="assets/:id" element={<AssetDetailPage />} />
                <Route path="assets/:id/edit" element={<RequireAdmin><AssetFormPage /></RequireAdmin>} />
                <Route path="repairs" element={<RepairsPage />} />
                <Route path="qr-labels" element={<QrLabelsPage />} />
                <Route path="scan" element={<ScanPage />} />
                <Route path="scan/:tag" element={<ScanPage />} />
                <Route path="import-export" element={<ImportExportPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="users" element={<RequireAdmin><UsersPage /></RequireAdmin>} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </Suspense>
          <ThemedToaster />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
