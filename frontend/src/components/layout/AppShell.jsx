import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell() {
  const organization = useAuthStore((state) => state.organization);

  // Signed in but with nothing to look at yet.
  if (!organization) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="min-h-screen lg:pl-60">
      <Sidebar />
      <Topbar />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
