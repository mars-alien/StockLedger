import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export function useOrders({ organizationId, page = 1, status, paymentStatus, search }) {
  const filters = { page, status, paymentStatus, search };

  return useQuery({
    queryKey: ['orders', organizationId, filters],
    queryFn: () =>
      api
        .get('/orders', {
          params: {
            page,
            limit: 20,
            status: status || undefined,
            paymentStatus: paymentStatus || undefined,
            search: search || undefined,
          },
        })
        .then((res) => res.data),
    enabled: Boolean(organizationId),
    placeholderData: keepPreviousData,
  });
}

export function useOrder({ organizationId, orderId }) {
  return useQuery({
    queryKey: ['order', organizationId, orderId],
    queryFn: () => api.get(`/orders/${orderId}`).then((res) => res.data),
    enabled: Boolean(organizationId && orderId),
  });
}

// A placement changes the ledger and the variant totals as well as the order
// list, so all three families of key are refreshed.
function invalidateAfterOrder(queryClient, organizationId) {
  queryClient.invalidateQueries({ queryKey: ['orders', organizationId] });
  queryClient.invalidateQueries({ queryKey: ['stock-movements', organizationId] });
  queryClient.invalidateQueries({ queryKey: ['variants', organizationId] });
  queryClient.invalidateQueries({ queryKey: ['product', organizationId] });
}

export function usePlaceOrder(organizationId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ idempotencyKey, ...payload }) =>
      api
        .post('/orders', payload, { headers: { 'Idempotency-Key': idempotencyKey } })
        .then((res) => res.data),
    onSuccess: () => invalidateAfterOrder(queryClient, organizationId),
  });
}

// Fetched through axios rather than linked to directly, because the access
// token lives in memory and a plain anchor would arrive without it.
export async function downloadInvoice({ orderId, orderNumber }) {
  const response = await api.get(`/orders/${orderId}/invoice`, { responseType: 'blob' });
  const url = URL.createObjectURL(response.data);

  const link = document.createElement('a');
  link.href = url;
  link.download = `invoice-${orderNumber}.pdf`;

  // Firefox ignores a click on an anchor that is not in the document, and
  // revoking the url in the same tick can cancel the download before it has
  // started reading from it.
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function useCancelOrder(organizationId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, note }) =>
      api.post(`/orders/${orderId}/cancel`, { note }).then((res) => res.data),
    onSuccess: (_data, variables) => {
      invalidateAfterOrder(queryClient, organizationId);
      queryClient.invalidateQueries({ queryKey: ['order', organizationId, variables.orderId] });
    },
  });
}
