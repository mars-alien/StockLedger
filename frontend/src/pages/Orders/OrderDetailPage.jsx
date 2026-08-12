import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { useStockMovements } from '../../api/inventory';
import { downloadInvoice, useCancelOrder, useOrder } from '../../api/orders';
import { usePayOrder } from '../../api/payments';
import { PageHeader } from '../../components/layout/PageHeader';
import { ErrorBanner } from '../../components/shared/ErrorBanner';
import { ErrorState } from '../../components/shared/ErrorState';
import { Loader } from '../../components/shared/Loader';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Table, TableBody, TableCell, TableHead, TableRow } from '../../components/ui/Table';
import { useCanManageOrders } from '../../hooks/usePermissions';
import { useAuthStore } from '../../store/authStore';
import { formatDateTime } from '../../utils/datetime';
import { formatPaise } from '../../utils/money';

export function OrderDetailPage() {
  const { orderId } = useParams();
  const organizationId = useAuthStore((state) => state.organization?.id);
  const canCancel = useCanManageOrders();

  const [cancelOpen, setCancelOpen] = useState(false);
  const [note, setNote] = useState('');
  const [invoiceError, setInvoiceError] = useState(null);

  const order = useOrder({ organizationId, orderId });
  const movements = useStockMovements({ organizationId, orderId });
  const cancelOrder = useCancelOrder(organizationId);
  const payOrder = usePayOrder(organizationId);

  if (order.isPending) {
    return <Loader label="Loading order" />;
  }

  if (order.isError) {
    return (
      <ErrorState
        message={errorMessage(order.error, 'That order could not be loaded')}
        onRetry={order.refetch}
      />
    );
  }

  const item = order.data;
  const timeline = movements.data?.data ?? [];

  const confirmCancel = () => {
    cancelOrder.mutate(
      { orderId: item.id, note: note.trim() || undefined },
      {
        onSuccess: () => {
          setCancelOpen(false);
          setNote('');
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <Link to="/orders" className="text-sm text-indigo-700 hover:underline">
          Back to orders
        </Link>
      </div>

      <PageHeader
        title={item.orderNumber}
        description={`${item.customerName}${item.customerPhone ? ` · ${item.customerPhone}` : ''} · placed ${formatDateTime(item.createdAt)} by ${item.placedByUser.name}`}
        action={
          <div className="flex flex-wrap gap-2">
            {item.status === 'PLACED' && item.paymentStatus !== 'PAID' && (
              <Button disabled={payOrder.isPending} onClick={() => payOrder.mutate({ orderId })}>
                {payOrder.isPending ? 'Opening checkout' : 'Take payment'}
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() =>
                downloadInvoice({ orderId, orderNumber: item.orderNumber }).catch((error) =>
                  setInvoiceError(error),
                )
              }
            >
              Download invoice
            </Button>
            {/* Money has changed hands, so the server refuses a cancellation.
                Offering the button anyway only leads to a 409. */}
            {canCancel && item.status === 'PLACED' && item.paymentStatus !== 'PAID' && (
              <Button variant="danger" onClick={() => setCancelOpen(true)}>
                Cancel order
              </Button>
            )}
          </div>
        }
      />

      {cancelOrder.isError && (
        <ErrorBanner>{errorMessage(cancelOrder.error, 'That order was not cancelled')}</ErrorBanner>
      )}

      {payOrder.isError && (
        <ErrorBanner>{errorMessage(payOrder.error, payOrder.error.message)}</ErrorBanner>
      )}

      {invoiceError && (
        <ErrorBanner>{errorMessage(invoiceError, 'The invoice could not be built')}</ErrorBanner>
      )}

      <div className="flex flex-wrap gap-2">
        <Badge tone={item.status === 'CANCELLED' ? 'slate' : 'indigo'}>
          {item.status.toLowerCase()}
        </Badge>
        <Badge tone={item.paymentStatus === 'PAID' ? 'indigo' : 'amber'}>
          {item.paymentStatus.toLowerCase()}
        </Badge>
      </div>

      <Card>
        <CardHeader title="Items" />
        <Table>
          <TableHead
            columns={[
              'Item',
              'SKU',
              { label: 'Unit price', align: 'right' },
              { label: 'Quantity', align: 'right' },
              { label: 'Line total', align: 'right' },
            ]}
          />
          <TableBody>
            {item.lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell className="font-medium text-slate-900">
                  {line.variant.product.name}
                  <span className="block text-xs text-slate-500">{line.variant.name}</span>
                </TableCell>
                <TableCell className="font-mono text-xs">{line.variant.sku}</TableCell>
                <TableCell align="right">{formatPaise(line.unitPriceCents)}</TableCell>
                <TableCell align="right">{line.quantity}</TableCell>
                <TableCell align="right" className="font-medium text-slate-900">
                  {formatPaise(line.lineTotalCents)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <dl className="ml-auto max-w-xs space-y-1 border-t border-slate-200 px-5 py-4 text-sm tabular-nums">
          <div className="flex justify-between text-slate-600">
            <dt>Subtotal</dt>
            <dd>{formatPaise(item.subtotalCents)}</dd>
          </div>
          <div className="flex justify-between text-slate-600">
            <dt>Tax</dt>
            <dd>{formatPaise(item.taxCents)}</dd>
          </div>
          <div className="flex justify-between text-base font-medium text-slate-900">
            <dt>Total</dt>
            <dd>{formatPaise(item.totalCents)}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardHeader
          title="Stock effect"
          description="What this order did to the ledger, and what a cancellation put back."
        />
        {timeline.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">No movements to show.</p>
        ) : (
          <Table>
            <TableHead
              columns={[
                'When',
                'Item',
                'Reason',
                { label: 'Change', align: 'right' },
                { label: 'Balance after', align: 'right' },
              ]}
            />
            <TableBody>
              {timeline.map((movement) => (
                <TableRow key={movement.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {formatDateTime(movement.createdAt)}
                  </TableCell>
                  <TableCell>{movement.variant.name}</TableCell>
                  <TableCell>
                    <Badge tone={movement.delta > 0 ? 'indigo' : 'amber'}>
                      {movement.reason.toLowerCase()}
                    </Badge>
                  </TableCell>
                  <TableCell
                    align="right"
                    className={movement.delta > 0 ? 'text-slate-700' : 'text-amber-700'}
                  >
                    {movement.delta > 0 ? `+${movement.delta}` : movement.delta}
                  </TableCell>
                  <TableCell align="right" className="font-medium text-slate-900">
                    {movement.balanceAfter}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Modal open={cancelOpen} title="Cancel this order" onClose={() => setCancelOpen(false)}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Every line goes back to the ledger as a cancellation movement. This cannot be undone.
          </p>

          <Field label="Reason" htmlFor="cancel-note" hint="Optional, kept on the audit trail.">
            <Input
              id="cancel-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>
              Keep it
            </Button>
            <Button variant="danger" disabled={cancelOrder.isPending} onClick={confirmCancel}>
              {cancelOrder.isPending ? 'Cancelling' : 'Cancel order'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
