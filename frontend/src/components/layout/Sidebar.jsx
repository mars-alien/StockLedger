import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { cn } from '../../utils/cn';

const links = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/orders', label: 'Orders' },
  { to: '/products', label: 'Products' },
  { to: '/categories', label: 'Categories' },
  { to: '/inventory', label: 'Inventory' },
  { to: '/members', label: 'Members', ownerOnly: true },
  { to: '/demo/concurrency', label: 'Concurrency demo', managerOnly: true },
];

export function Sidebar() {
  const role = useAuthStore((state) => state.organization?.role);
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const closeSidebar = useUiStore((state) => state.closeSidebar);

  const visible = links.filter((link) => {
    if (link.ownerOnly) {
      return role === 'OWNER';
    }
    if (link.managerOnly) {
      return role === 'OWNER' || role === 'MANAGER';
    }
    return true;
  });

  return (
    <>
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={closeSidebar}
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-60 border-r border-slate-200 bg-white transition-transform',
          'lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center px-5 text-sm font-semibold text-slate-900">
          StockLedger
        </div>
        <nav className="space-y-0.5 px-3">
          {visible.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              onClick={closeSidebar}
              className={({ isActive }) =>
                cn(
                  'block rounded-md px-3 py-2 text-sm',
                  isActive
                    ? 'bg-indigo-50 font-medium text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-100',
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
