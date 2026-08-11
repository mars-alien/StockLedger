import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { loadRazorpayCheckout } from '../utils/razorpay';

/**
 * One mutation covers the whole round trip: ask the server for a Razorpay order,
 * open the hosted checkout, then hand the result back for verification. The
 * signature is checked on the server, so nothing here decides that a payment
 * happened — the browser only reports what Razorpay told it.
 */
export function usePayOrder(organizationId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId }) => {
      const intent = await api.post(`/payments/orders/${orderId}/intent`).then((res) => res.data);

      const Razorpay = await loadRazorpayCheckout();

      const checkout = await new Promise((resolve, reject) => {
        const instance = new Razorpay({
          key: intent.keyId,
          amount: intent.amount,
          currency: intent.currency,
          order_id: intent.razorpayOrderId,
          name: 'StockLedger',
          description: `Order ${intent.orderNumber}`,
          prefill: { name: intent.customerName },
          handler: resolve,
          modal: { ondismiss: () => reject(new Error('Payment was cancelled')) },
        });
        instance.on('payment.failed', (event) =>
          reject(new Error(event.error?.description ?? 'The payment failed')),
        );
        instance.open();
      });

      return api
        .post('/payments/verify', {
          razorpayOrderId: checkout.razorpay_order_id,
          razorpayPaymentId: checkout.razorpay_payment_id,
          signature: checkout.razorpay_signature,
        })
        .then((res) => res.data);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['order', organizationId, variables.orderId] });
      queryClient.invalidateQueries({ queryKey: ['orders', organizationId] });
      queryClient.invalidateQueries({ queryKey: ['analytics', organizationId] });
    },
  });
}
