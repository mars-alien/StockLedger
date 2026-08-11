import { useLogout } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { OrganizationSwitcher } from './OrganizationSwitcher';

export function Topbar() {
  const user = useAuthStore((state) => state.user);
  const role = useAuthStore((state) => state.organization?.role);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const logout = useLogout();

  return (
    <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4">
      <Button variant="ghost" size="sm" className="lg:hidden" onClick={toggleSidebar}>
        Menu
      </Button>

      <OrganizationSwitcher />
      {role && <Badge tone="indigo">{role.toLowerCase()}</Badge>}

      <div className="ml-auto flex items-center gap-3">
        <span className="hidden text-sm text-slate-600 sm:inline">{user?.name}</span>
        <Button
          variant="secondary"
          size="sm"
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
        >
          Sign out
        </Button>
      </div>
    </header>
  );
}
