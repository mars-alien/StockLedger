import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export function useDemoState({ organizationId }) {
  return useQuery({
    queryKey: ['demo', organizationId],
    queryFn: () => api.get('/demo/state').then((res) => res.data),
    enabled: Boolean(organizationId),
  });
}

export function useResetDemo(organizationId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/demo/reset').then((res) => res.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['demo', organizationId] }),
  });
}

// Fired outside React Query on purpose: this is not state to cache, it is fifty
// requests leaving at once and the individual outcomes are the whole point.
export function placeDemoOrder({ variantId, unsafe }) {
  if (unsafe) {
    return api.post('/demo/orders-unsafe');
  }

  return api.post(
    '/orders',
    { customerName: 'Concurrency demo', lines: [{ variantId, quantity: 1 }] },
    { headers: { 'Idempotency-Key': crypto.randomUUID() } },
  );
}
