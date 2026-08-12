import { useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useDashboard } from '../../api/analytics';
import { errorMessage } from '../../api/client';
import { PageHeader } from '../../components/layout/PageHeader';
import { EmptyState } from '../../components/shared/EmptyState';
import { ErrorState } from '../../components/shared/ErrorState';
import { Loader } from '../../components/shared/Loader';
import { Card, CardHeader } from '../../components/ui/Card';
import { Select } from '../../components/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableRow } from '../../components/ui/Table';
import { useRole } from '../../hooks/usePermissions';
import { useAuthStore } from '../../store/authStore';
import { formatDate } from '../../utils/datetime';
import { formatPaise, formatPaiseCompact } from '../../utils/money';

const RANGES = [
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 180, label: 'Last 6 months' },
  { value: 365, label: 'Last 12 months' },
];

export function DashboardPage() {
  const organizationId = useAuthStore((state) => state.organization?.id);
  const organizationName = useAuthStore((state) => state.organization?.name);
  const role = useRole();
  const [days, setDays] = useState(180);

  const dashboard = useDashboard({ organizationId, days });

  // Staff never see revenue, so they get the shell rather than an error.
  if (role === 'STAFF') {
    return (
      <div className="space-y-6">
        <PageHeader title={organizationName} />
        <Card>
          <EmptyState
            title="Nothing here for your role"
            description="Head to Orders to take an order, or Products to look something up."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={organizationName}
        description="How trade has been going."
        action={
          <Select
            aria-label="Reporting range"
            className="w-full sm:max-w-44"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            {RANGES.map((range) => (
              <option key={range.value} value={range.value}>
                {range.label}
              </option>
            ))}
          </Select>
        }
      />

      {dashboard.isPending && <Loader label="Crunching the numbers" />}

      {dashboard.isError && (
        <ErrorState
          message={errorMessage(dashboard.error, 'The dashboard did not load')}
          onRetry={dashboard.refetch}
        />
      )}

      {dashboard.isSuccess && (
        <>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Revenue" value={formatPaise(dashboard.data.totals.revenueCents)} />
            <Kpi label="Orders" value={dashboard.data.totals.orders.toLocaleString('en-IN')} />
            <Kpi
              label="Average order"
              value={formatPaise(dashboard.data.totals.averageOrderCents)}
            />
            <Kpi
              label="Units sold"
              value={dashboard.data.totals.unitsSold.toLocaleString('en-IN')}
            />
          </dl>

          <Card>
            <CardHeader
              title="Revenue"
              description={`${formatPaise(dashboard.data.totals.paidRevenueCents)} of it collected, across ${dashboard.data.totals.paidOrders.toLocaleString('en-IN')} paid orders.`}
            />
            <div className="h-72 px-2 py-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dashboard.data.trend}>
                  <defs>
                    <linearGradient id="revenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickFormatter={formatDate}
                    minTickGap={40}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickFormatter={formatPaiseCompact}
                    width={70}
                  />
                  <Tooltip
                    formatter={(value) => [formatPaise(value), 'Revenue']}
                    labelFormatter={formatDate}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenueCents"
                    stroke="#4f46e5"
                    strokeWidth={2}
                    fill="url(#revenue)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Orders per day" />
              <div className="h-64 px-2 py-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dashboard.data.trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickFormatter={formatDate}
                      minTickGap={40}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      allowDecimals={false}
                      width={30}
                    />
                    <Tooltip labelFormatter={formatDate} />
                    <Bar dataKey="orders" fill="#818cf8" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <CardHeader title="Top products" description="By revenue over the same period." />
              {dashboard.data.topProducts.length === 0 ? (
                <EmptyState title="Nothing sold yet" description="Take an order to fill this in." />
              ) : (
                <Table>
                  <TableHead
                    columns={[
                      'Product',
                      { label: 'Units', align: 'right' },
                      { label: 'Revenue', align: 'right' },
                    ]}
                  />
                  <TableBody>
                    {dashboard.data.topProducts.map((product) => (
                      <TableRow key={product.productId}>
                        <TableCell className="font-medium text-slate-900">{product.name}</TableCell>
                        <TableCell align="right">{product.units.toLocaleString('en-IN')}</TableCell>
                        <TableCell align="right">{formatPaise(product.revenueCents)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value }) {
  return (
    <div className="rounded-lg bg-white px-5 py-4 ring-1 ring-slate-200">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value}</dd>
    </div>
  );
}
