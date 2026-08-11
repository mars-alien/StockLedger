import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export function useMembers({ organizationId, page, search }) {
  return useQuery({
    queryKey: ['members', organizationId, { page, search }],
    queryFn: () =>
      api
        .get('/members', { params: { page, limit: 20, search: search || undefined } })
        .then((res) => res.data),
    enabled: Boolean(organizationId),
    placeholderData: keepPreviousData,
  });
}

export function useInvitations({ organizationId }) {
  return useQuery({
    queryKey: ['invitations', organizationId],
    queryFn: () => api.get('/members/invitations').then((res) => res.data),
    enabled: Boolean(organizationId),
  });
}

export function useInviteMember(organizationId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.post('/members/invitations', payload).then((res) => res.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invitations', organizationId] }),
  });
}

export function useRevokeInvitation(organizationId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invitationId) => api.delete(`/members/invitations/${invitationId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invitations', organizationId] }),
  });
}

export function useChangeRole(organizationId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ membershipId, role }) =>
      api.patch(`/members/${membershipId}`, { role }).then((res) => res.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members', organizationId] }),
  });
}

export function useRemoveMember(organizationId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (membershipId) => api.delete(`/members/${membershipId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members', organizationId] }),
  });
}
