import { create } from 'zustand';

const ACTIVE_ORGANIZATION_KEY = 'stockledger.activeOrganizationId';

// The access token is deliberately held in memory only. The organization id is
// not a secret, so it can survive a reload and tell the refresh call which
// organization to sign the next token for.
export const useAuthStore = create((set) => ({
  status: 'loading',
  accessToken: null,
  user: null,
  organization: null,

  setSession: ({ user, organization, accessToken }) => {
    if (organization) {
      localStorage.setItem(ACTIVE_ORGANIZATION_KEY, organization.id);
    }
    set({ status: 'authenticated', accessToken, user, organization: organization ?? null });
  },

  setOrganization: ({ organization, accessToken }) => {
    localStorage.setItem(ACTIVE_ORGANIZATION_KEY, organization.id);
    set({ organization, accessToken });
  },

  clear: () => {
    localStorage.removeItem(ACTIVE_ORGANIZATION_KEY);
    set({ status: 'anonymous', accessToken: null, user: null, organization: null });
  },
}));

export function getActiveOrganizationId() {
  return localStorage.getItem(ACTIVE_ORGANIZATION_KEY) ?? undefined;
}
