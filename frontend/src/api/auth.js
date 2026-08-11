import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '../store/authStore';

export function useRegister() {
  const setSession = useAuthStore((state) => state.setSession);
  return useMutation({
    mutationFn: (payload) => api.post('/auth/register', payload).then((res) => res.data),
    onSuccess: setSession,
  });
}

export function useLogin() {
  const setSession = useAuthStore((state) => state.setSession);
  return useMutation({
    mutationFn: (payload) => api.post('/auth/login', payload).then((res) => res.data),
    onSuccess: setSession,
  });
}

export function useLogout() {
  const clear = useAuthStore((state) => state.clear);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSettled: () => {
      clear();
      queryClient.clear();
    },
  });
}

export function useInvitationPreview(token) {
  return useQuery({
    queryKey: ['invitation', token],
    queryFn: () => api.get(`/auth/invitations/${token}`).then((res) => res.data),
    enabled: Boolean(token),
    retry: false,
  });
}

export function useAcceptInvitation() {
  const setSession = useAuthStore((state) => state.setSession);
  return useMutation({
    mutationFn: (payload) => api.post('/auth/accept-invitation', payload).then((res) => res.data),
    onSuccess: setSession,
  });
}
