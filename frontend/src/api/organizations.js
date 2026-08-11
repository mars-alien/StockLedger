import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '../store/authStore';

export function useOrganizations() {
  return useQuery({
    queryKey: ['organizations'],
    queryFn: () => api.get('/organizations', { params: { limit: 50 } }).then((res) => res.data),
  });
}

export function useCurrentOrganization({ organizationId }) {
  return useQuery({
    queryKey: ['organization', organizationId],
    queryFn: () => api.get('/organizations/current').then((res) => res.data),
    enabled: Boolean(organizationId),
  });
}

export function useCreateOrganization() {
  const setOrganization = useAuthStore((state) => state.setOrganization);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => api.post('/organizations', payload).then((res) => res.data),
    onSuccess: (data) => {
      // The server hands back a token scoped to the new organization, so the
      // client swaps it in rather than asking the user to sign in again.
      setOrganization(data);
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
}

export function useSwitchOrganization() {
  const setOrganization = useAuthStore((state) => state.setOrganization);

  return useMutation({
    mutationFn: (organizationId) =>
      api.post(`/organizations/${organizationId}/switch`).then((res) => res.data),
    onSuccess: setOrganization,
  });
}
