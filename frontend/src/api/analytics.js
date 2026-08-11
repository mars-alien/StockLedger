import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from './client';

export function useDashboard({ organizationId, days }) {
  return useQuery({
    queryKey: ['analytics', organizationId, days],
    queryFn: () => api.get('/analytics/dashboard', { params: { days } }).then((res) => res.data),
    enabled: Boolean(organizationId),
    placeholderData: keepPreviousData,
  });
}
