import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export function useProducts({ organizationId, page = 1, search, categoryId, isActive }) {
  const filters = { page, search, categoryId, isActive };

  return useQuery({
    queryKey: ['products', organizationId, filters],
    queryFn: () =>
      api
        .get('/products', {
          params: {
            page,
            limit: 20,
            search: search || undefined,
            categoryId: categoryId || undefined,
            isActive: isActive || undefined,
          },
        })
        .then((res) => res.data),
    enabled: Boolean(organizationId),
    placeholderData: keepPreviousData,
  });
}

export function useProduct({ organizationId, productId }) {
  return useQuery({
    queryKey: ['product', organizationId, productId],
    queryFn: () => api.get(`/products/${productId}`).then((res) => res.data),
    enabled: Boolean(organizationId && productId),
  });
}

export function useCreateProduct(organizationId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.post('/products', payload).then((res) => res.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products', organizationId] }),
  });
}

export function useUpdateProduct(organizationId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, ...payload }) =>
      api.patch(`/products/${productId}`, payload).then((res) => res.data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['products', organizationId] });
      queryClient.invalidateQueries({ queryKey: ['product', organizationId, variables.productId] });
    },
  });
}

export function useDeleteProduct(organizationId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (productId) => api.delete(`/products/${productId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products', organizationId] }),
  });
}

export function useUploadProductImage(organizationId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, file }) => {
      const form = new FormData();
      form.append('image', file);
      // Content-Type is left alone so the browser can add the multipart boundary.
      return api.post(`/products/${productId}/image`, form).then((res) => res.data);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['products', organizationId] });
      queryClient.invalidateQueries({ queryKey: ['product', organizationId, variables.productId] });
    },
  });
}

export function useAddVariant(organizationId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, ...payload }) =>
      api.post(`/products/${productId}/variants`, payload).then((res) => res.data),
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: ['product', organizationId, variables.productId] }),
  });
}

export function useUpdateVariant(organizationId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, variantId, ...payload }) =>
      api.patch(`/products/${productId}/variants/${variantId}`, payload).then((res) => res.data),
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: ['product', organizationId, variables.productId] }),
  });
}

export function useDeleteVariant(organizationId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, variantId }) =>
      api.delete(`/products/${productId}/variants/${variantId}`),
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: ['product', organizationId, variables.productId] }),
  });
}
