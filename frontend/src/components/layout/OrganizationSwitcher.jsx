import { useOrganizations, useSwitchOrganization } from '../../api/organizations';
import { useAuthStore } from '../../store/authStore';
import { Select } from '../ui/Input';

export function OrganizationSwitcher() {
  const organization = useAuthStore((state) => state.organization);
  const { data, isPending } = useOrganizations();
  const switchOrganization = useSwitchOrganization();

  const organizations = data?.data ?? [];

  if (isPending || organizations.length <= 1) {
    return <span className="text-sm font-medium text-slate-900">{organization?.name}</span>;
  }

  return (
    <Select
      aria-label="Active organization"
      className="max-w-52"
      value={organization?.id ?? ''}
      disabled={switchOrganization.isPending}
      onChange={(event) => switchOrganization.mutate(event.target.value)}
    >
      {organizations.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </Select>
  );
}
