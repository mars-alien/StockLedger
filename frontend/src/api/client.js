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

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config;
    const isAuthFailure = error.response?.status === 401;

    if (!isAuthFailure || request?.retried) {
      return Promise.reject(error);
    }

    request.retried = true;

    try {
      const accessToken = await refreshSession();
      request.headers.Authorization = `Bearer ${accessToken}`;
      return await api(request);
    } catch (refreshError) {
      useAuthStore.getState().clear();
      return Promise.reject(refreshError);
    }
  },
);

export function errorMessage(error, fallback = 'Something went wrong') {
  return error?.response?.data?.error?.message ?? fallback;
}
