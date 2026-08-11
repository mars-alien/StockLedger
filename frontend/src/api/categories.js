import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export function useCategories({ organizationId, page = 1, search }) {
  return useQuery({
    queryKey: ['categories', organizationId, { page, search }],
    queryFn: () =>
      api
        .get('/categories', { params: { page, limit: 20, search: search || undefined } })
        .then((res) => res.data),
    enabled: Boolean(organizationId),
    placeholderData: keepPreviousData,
  });
}

// The filter dropdown needs every category at once, not a page of them.
export function useCategoryOptions({ organizationId }) {
  return useQuery({
    queryKey: ['categories', organizationId, 'options'],
    queryFn: () => api.get('/categories', { params: { limit: 100 } }).then((res) => res.data.data),
    enabled: Boolean(organizationId),
  });
}

export function useCreateCategory(organizationId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.post('/categories', payload).then((res) => res.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories', organizationId] }),
  });
}

export function useUpdateCategory(organizationId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, ...payload }) =>
      api.patch(`/categories/${categoryId}`, payload).then((res) => res.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories', organizationId] }),
  });
}

export function useDeleteCategory(organizationId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (categoryId) => api.delete(`/categories/${categoryId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', organizationId] });
      queryClient.invalidateQueries({ queryKey: ['products', organizationId] });
    },
  });
}
