import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { useOrders } from '../../api/orders';
import { PageHeader } from '../../components/layout/PageHeader';
import { EmptyState } from '../../components/shared/EmptyState';
import { ErrorState } from '../../components/shared/ErrorState';
import { TableSkeleton } from '../../components/shared/Loader';
import { Pagination } from '../../components/shared/Pagination';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Input, Select } from '../../components/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableRow } from '../../components/ui/Table';
import { useAuthStore } from '../../store/authStore';
import { formatDateTime } from '../../utils/datetime';
import { formatPaise } from '../../utils/money';

const STATUS_TONES = { PLACED: 'indigo', CANCELLED: 'slate' };
const PAYMENT_TONES = { PAID: 'indigo', UNPAID: 'amber', FAILED: 'amber' };

export function OrdersPage() {
  const organizationId = useAuthStore((state) => state.organization?.id);

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [search, setSearch] = useState('');

  const orders = useOrders({ organizationId, page, status, paymentStatus, search });

  const changeFilter = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description="Everything sold, newest first."
        action={
          <Link to="/orders/new">
            <Button>New order</Button>
          </Link>
        }
      />

      <Card>
        <CardHeader
          title="All orders"
          action={
            <div className="flex flex-wrap gap-2">
              <Input
                aria-label="Search orders"
                placeholder="Order number or customer"
                className="max-w-52"
                value={search}
                onChange={changeFilter(setSearch)}
              />
              <Select
                aria-label="Filter by status"
                className="max-w-36"
                value={status}
                onChange={changeFilter(setStatus)}
              >
                <option value="">Any status</option>
                <option value="PLACED">Placed</option>
                <option value="CANCELLED">Cancelled</option>
              </Select>
              <Select
                aria-label="Filter by payment"
                className="max-w-36"
                value={paymentStatus}
                onChange={changeFilter(setPaymentStatus)}
              >
                <option value="">Any payment</option>
                <option value="UNPAID">Unpaid</option>
                <option value="PAID">Paid</option>
                <option value="FAILED">Failed</option>
              </Select>
            </div>
          }
        />

        {orders.isPending && <TableSkeleton columns={6} />}

        {orders.isError && (
          <ErrorState
            message={errorMessage(orders.error, 'Orders did not load')}
            onRetry={orders.refetch}
          />
        )}

        {orders.isSuccess && orders.data.data.length === 0 && (
          <EmptyState
            title="No orders yet"
            description="Take the first one and it will show up here."
            action={
              <Link to="/orders/new">
                <Button>New order</Button>
              </Link>
            }
          />
        )}

        {orders.isSuccess && orders.data.data.length > 0 && (
          <>
            <Table>
              <TableHead
                columns={[
                  'Order',
                  'Customer',
                  'Placed',
                  { label: 'Lines', align: 'right' },
                  { label: 'Total', align: 'right' },
                  'Status',
                  'Payment',
                ]}
              />
              <TableBody>
                {orders.data.data.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Link
                        to={`/orders/${order.id}`}
                        className="font-mono text-xs font-medium text-indigo-700 hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{order.customerName}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {formatDateTime(order.createdAt)}
                    </TableCell>
                    <TableCell align="right">{order._count.lines}</TableCell>
                    <TableCell align="right" className="font-medium text-slate-900">
                      {formatPaise(order.totalCents)}
                    </TableCell>
                    <TableCell>
                      <Badge tone={STATUS_TONES[order.status]}>{order.status.toLowerCase()}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge tone={PAYMENT_TONES[order.paymentStatus]}>
                        {order.paymentStatus.toLowerCase()}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Pagination
              page={orders.data.page}
              totalPages={orders.data.totalPages}
              total={orders.data.total}
              onChange={setPage}
            />
          </>
        )}
      </Card>
    </div>
  );
}
