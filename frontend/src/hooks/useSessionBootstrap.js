import { useEffect } from 'react';
import { refreshSession } from '../api/client';
import { useAuthStore } from '../store/authStore';

// The access token only lives in memory, so a reload starts with no session at
// all. One refresh call on mount turns the cookie back into a usable token.
export function useSessionBootstrap() {
  useEffect(() => {
    refreshSession().catch(() => useAuthStore.getState().clear());
  }, []);

  return useAuthStore((state) => state.status);
}
