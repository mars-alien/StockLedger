import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { Loader } from './components/shared/Loader';
import { ProtectedRoute, PublicOnlyRoute } from './components/shared/ProtectedRoute';
import { useSessionBootstrap } from './hooks/useSessionBootstrap';
import { AcceptInvitationPage } from './pages/AcceptInvitation/AcceptInvitationPage';
import { CategoriesPage } from './pages/Categories/CategoriesPage';
import { CreateOrderPage } from './pages/Orders/CreateOrderPage';
import { CreateOrganizationPage } from './pages/CreateOrganization/CreateOrganizationPage';
import { InventoryPage } from './pages/Inventory/InventoryPage';
import { LoginPage } from './pages/Login/LoginPage';
import { MembersPage } from './pages/Members/MembersPage';
import { OrderDetailPage } from './pages/Orders/OrderDetailPage';
import { OrdersPage } from './pages/Orders/OrdersPage';
import { ProductDetailPage } from './pages/Products/ProductDetailPage';
import { ProductsPage } from './pages/Products/ProductsPage';
import { RegisterPage } from './pages/Register/RegisterPage';

// The charting library is most of the bundle and only these two screens need
// it, so they are fetched when somebody actually opens one.
const DashboardPage = lazy(() =>
  import('./pages/Dashboard/DashboardPage').then((module) => ({ default: module.DashboardPage })),
);
const ConcurrencyDemoPage = lazy(() =>
  import('./pages/Demo/ConcurrencyDemoPage').then((module) => ({
    default: module.ConcurrencyDemoPage,
  })),
);

export function App() {
  useSessionBootstrap();

  return (
    <Suspense fallback={<Loader label="Loading" />}>
      <Routes>
        <Route path="/accept-invitation" element={<AcceptInvitationPage />} />

        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route path="/onboarding" element={<CreateOrganizationPage />} />
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/products/:productId" element={<ProductDetailPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/orders/new" element={<CreateOrderPage />} />
            <Route path="/orders/:orderId" element={<OrderDetailPage />} />
            <Route path="/members" element={<MembersPage />} />
            <Route path="/demo/concurrency" element={<ConcurrencyDemoPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
