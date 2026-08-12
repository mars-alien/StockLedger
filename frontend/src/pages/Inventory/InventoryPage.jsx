import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { useStockMovements, useVariantSearch } from '../../api/inventory';
import { PageHeader } from '../../components/layout/PageHeader';
import { EmptyState } from '../../components/shared/EmptyState';
import { ErrorState } from '../../components/shared/ErrorState';
import { TableSkeleton } from '../../components/shared/Loader';
import { Pagination } from '../../components/shared/Pagination';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Select } from '../../components/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableRow } from '../../components/ui/Table';
import { useCanEditCatalog } from '../../hooks/usePermissions';
import { useAuthStore } from '../../store/authStore';
import { formatDateTime } from '../../utils/datetime';
import { StockMovementModal } from './StockMovementModal';

const REASONS = ['RECEIPT', 'SALE', 'ADJUSTMENT', 'CANCELLATION'];

export function InventoryPage() {
  const organizationId = useAuthStore((state) => state.organization?.id);
  const canMoveStock = useCanEditCatalog();

  const [page, setPage] = useState(1);
  const [reason, setReason] = useState('');
  const [variantId, setVariantId] = useState('');
  const [modalMode, setModalMode] = useState(null);

  const movements = useStockMovements({ organizationId, page, reason, variantId });
  const variants = useVariantSearch({ organizationId, search: '' });

  const changeFilter = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Every change to stock, in the order it happened."
        action={
          canMoveStock && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setModalMode('adjust')}>
                Adjust stock
              </Button>
              <Button onClick={() => setModalMode('receive')}>Receive stock</Button>
            </div>
          )
        }
      />

      <Card>
        <CardHeader
          title="Stock ledger"
          action={
            <div className="flex flex-wrap gap-2">
              <Select
                aria-label="Filter by variant"
                className="w-full sm:max-w-56"
                value={variantId}
                onChange={changeFilter(setVariantId)}
              >
                <option value="">All variants</option>
                {(variants.data?.data ?? []).map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.product.name} — {variant.name}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Filter by reason"
                className="w-full sm:max-w-40"
                value={reason}
                onChange={changeFilter(setReason)}
              >
                <option value="">Any reason</option>
                {REASONS.map((value) => (
                  <option key={value} value={value}>
                    {value.toLowerCase()}
                  </option>
                ))}
              </Select>
            </div>
          }
        />

        {movements.isPending && <TableSkeleton columns={6} />}

        {movements.isError && (
          <ErrorState
            message={errorMessage(movements.error, 'The ledger did not load')}
            onRetry={movements.refetch}
          />
        )}

        {movements.isSuccess && movements.data.data.length === 0 && (
          <EmptyState
            title="Nothing on the ledger"
            description="Receiving stock writes the first entry."
            action={
              canMoveStock && <Button onClick={() => setModalMode('receive')}>Receive stock</Button>
            }
          />
        )}

        {movements.isSuccess && movements.data.data.length > 0 && (
          <>
            <Table>
              <TableHead
                columns={[
                  'When',
                  'Product',
                  'Reason',
                  { label: 'Change', align: 'right' },
                  { label: 'Balance after', align: 'right' },
                  'By',
                ]}
              />
              <TableBody>
                {movements.data.data.map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {formatDateTime(movement.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/products/${movement.variant.product.id}`}
                        className="font-medium text-indigo-700 hover:underline"
                      >
                        {movement.variant.product.name}
                      </Link>
                      <span className="block text-xs text-slate-500">{movement.variant.name}</span>
                    </TableCell>
                    <TableCell>
                      <Badge tone={movement.delta > 0 ? 'indigo' : 'amber'}>
                        {movement.reason.toLowerCase()}
                      </Badge>
                      {movement.note && (
                        <span className="block text-xs text-slate-500">{movement.note}</span>
                      )}
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
                    <TableCell className="text-xs">{movement.createdByUser.name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Pagination
              page={movements.data.page}
              totalPages={movements.data.totalPages}
              total={movements.data.total}
              onChange={setPage}
            />
          </>
        )}
      </Card>

      <StockMovementModal
        open={modalMode !== null}
        organizationId={organizationId}
        mode={modalMode ?? 'receive'}
        onClose={() => setModalMode(null)}
      />
    </div>
  );
}
