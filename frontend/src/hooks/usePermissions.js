import { useAuthStore } from '../store/authStore';

export function useRole() {
  return useAuthStore((state) => state.organization?.role ?? null);
}

// Staff can read the catalog and the ledger but cannot change either, so the UI
// hides the controls the API would refuse anyway.
export function useCanEditCatalog() {
  const role = useRole();
  return role === 'OWNER' || role === 'MANAGER';
}

// Cancelling an order is a separate permission from editing the catalog. The
// two allow the same roles today, and borrowing one for the other would mean a
// change to catalog rules silently moved who can cancel.
export function useCanManageOrders() {
  const role = useRole();
  return role === 'OWNER' || role === 'MANAGER';
}
