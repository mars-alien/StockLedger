import axios from 'axios';
import { getActiveOrganizationId, useAuthStore } from '../store/authStore';

const baseURL = import.meta.env.VITE_API_URL ?? '/api';

export const api = axios.create({ baseURL, withCredentials: true });

// A bare instance, so a failing refresh cannot re-enter the interceptor below.
const refreshClient = axios.create({ baseURL, withCredentials: true });

let inFlightRefresh = null;

export function refreshSession() {
  // Every request that hits a 401 at the same time waits on this one promise,
  // so only one refresh call is ever sent and the rotated token is not reused.
  if (!inFlightRefresh) {
    inFlightRefresh = refreshClient
      .post('/auth/refresh', { organizationId: getActiveOrganizationId() })
      .then((response) => {
        useAuthStore.getState().setSession(response.data);
        return response.data.accessToken;
      })
      .finally(() => {
        inFlightRefresh = null;
      });
  }
  return inFlightRefresh;
}

api.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Signing in is allowed to fail with a 401 and mean it. Refreshing after one
// would be answering "your session expired" to somebody who never had a
// session, and it is their credentials that were wrong.
const CREDENTIAL_ROUTES = ['/auth/login', '/auth/register', '/auth/accept-invitation'];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config;
    const isAuthFailure = error.response?.status === 401;
    const isCredentialCheck = CREDENTIAL_ROUTES.some((route) => request?.url?.startsWith(route));

    if (!isAuthFailure || isCredentialCheck || request?.retried) {
      return Promise.reject(error);
    }

    request.retried = true;

    try {
      const accessToken = await refreshSession();
      request.headers.Authorization = `Bearer ${accessToken}`;
      return await api(request);
    } catch {
      // Rejected with the original failure, not the refresh one. What the
      // caller wants to show is why their request failed, not the mechanics of
      // the recovery attempt that also failed.
      useAuthStore.getState().clear();
      return Promise.reject(error);
    }
  },
);

export function errorMessage(error, fallback = 'Something went wrong') {
  return error?.response?.data?.error?.message ?? fallback;
}
