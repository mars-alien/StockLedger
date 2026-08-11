import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export function useStockMovements({
  organizationId,
  page = 1,
  variantId,
  productId,
  orderId,
  reason,
}) {
  const filters = { page, variantId, productId, orderId, reason };

  return useQuery({
    queryKey: ['stock-movements', organizationId, filters],
    queryFn: () =>
      api
        .get('/inventory/movements', {
          params: {
            page,
            limit: 20,
            variantId: variantId || undefined,
            productId: productId || undefined,
            orderId: orderId || undefined,
            reason: reason || undefined,
          },
        })
        .then((res) => res.data),
    enabled: Boolean(organizationId),
    placeholderData: keepPreviousData,
  });
}

export function useVariantSearch({ organizationId, search }) {
  return useQuery({
    queryKey: ['variants', organizationId, search],
    queryFn: () =>
      api
        .get('/inventory/variants', { params: { limit: 20, search: search || undefined } })
        .then((res) => res.data),
    enabled: Boolean(organizationId),
    placeholderData: keepPreviousData,
  });
}

// Any stock movement changes the ledger, the variant totals and whatever the
// product page is showing, so all three families of key are refreshed.
function invalidateStock(queryClient, organizationId) {
  queryClient.invalidateQueries({ queryKey: ['stock-movements', organizationId] });
  queryClient.invalidateQueries({ queryKey: ['variants', organizationId] });
  queryClient.invalidateQueries({ queryKey: ['product', organizationId] });
}

export function useReceiveStock(organizationId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.post('/inventory/receive', payload).then((res) => res.data),
    onSuccess: () => invalidateStock(queryClient, organizationId),
  });
}

export function useAdjustStock(organizationId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.post('/inventory/adjust', payload).then((res) => res.data),
    onSuccess: () => invalidateStock(queryClient, organizationId),
  });
}
