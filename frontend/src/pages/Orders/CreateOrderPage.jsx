import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { useVariantSearch } from '../../api/inventory';
import { usePlaceOrder } from '../../api/orders';
import { useCurrentOrganization } from '../../api/organizations';
import { PageHeader } from '../../components/layout/PageHeader';
import { EmptyState } from '../../components/shared/EmptyState';
import { ErrorBanner } from '../../components/shared/ErrorBanner';
import { TableSkeleton } from '../../components/shared/Loader';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableRow } from '../../components/ui/Table';
import { useAuthStore } from '../../store/authStore';
import { formatPaise } from '../../utils/money';

export function CreateOrderPage() {
  const organizationId = useAuthStore((state) => state.organization?.id);
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [lines, setLines] = useState([]);

  const variants = useVariantSearch({ organizationId, search });
  const organization = useCurrentOrganization({ organizationId });
  const placeOrder = usePlaceOrder(organizationId);

  // Comes from the server rather than a constant here, so the preview cannot
  // drift away from the rate the order is actually billed at.
  const taxRateBasisPoints = organization.data?.taxRateBasisPoints ?? null;

  // The key belongs to one basket, not to the page. Everything the server hashes
  // goes into the signature, so a network retry of an unchanged basket is
  // recognised as the same request, while changing anything at all produces a
  // genuinely new one instead of a 422 for reusing a key on different content.
  const signature = JSON.stringify({
    customerName: customerName.trim(),
    customerPhone: customerPhone.trim(),
    lines: lines.map((line) => [line.variantId, line.quantity]),
  });

  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    setIdempotencyKey(crypto.randomUUID());
  }, [signature]);

  const totals = useMemo(() => {
    const subtotalCents = lines.reduce((total, line) => total + line.priceCents * line.quantity, 0);

    if (taxRateBasisPoints === null) {
      return { subtotalCents, taxCents: null, totalCents: null };
    }

    const taxCents = Math.round((subtotalCents * taxRateBasisPoints) / 10_000);
    return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
  }, [lines, taxRateBasisPoints]);

  const addLine = (variant) => {
    setLines((current) => {
      const existing = current.find((line) => line.variantId === variant.id);
      if (existing) {
        return current.map((line) =>
          line.variantId === variant.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [
        ...current,
        {
          variantId: variant.id,
          label: `${variant.product.name} — ${variant.name}`,
          sku: variant.sku,
          priceCents: variant.priceCents,
          available: variant.quantityOnHand,
          quantity: 1,
        },
      ];
    });
  };

  const setQuantity = (variantId, quantity) => {
    setLines((current) =>
      current.map((line) => (line.variantId === variantId ? { ...line, quantity } : line)),
    );
  };

  const removeLine = (variantId) => {
    setLines((current) => current.filter((line) => line.variantId !== variantId));
  };

  const overCommitted = lines.some((line) => line.quantity > line.available);
  const canSubmit = customerName.trim().length > 0 && lines.length > 0 && !overCommitted;

  const submit = () => {
    placeOrder.mutate(
      {
        idempotencyKey,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        lines: lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
      },
      {
        onSuccess: (order) => navigate(`/orders/${order.id}`, { replace: true }),
        onError: (error) => {
          // Out of stock is a settled answer, not an unknown outcome, so trying
          // again is a new attempt and deserves a new key.
          if (error.response?.status === 409) {
            setIdempotencyKey(crypto.randomUUID());
          }
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader title="New order" description="Stock is checked again when you place it." />

      {placeOrder.isError && (
        <ErrorBanner>{errorMessage(placeOrder.error, 'The order was refused')}</ErrorBanner>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Add items"
            action={
              <Input
                aria-label="Search variants"
                placeholder="Search product, variant or SKU"
                className="max-w-64"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            }
          />

          {variants.isPending && <TableSkeleton columns={4} />}

          {variants.isSuccess && variants.data.data.length === 0 && (
            <EmptyState title="Nothing matches" description="Try a different search." />
          )}

          {variants.isSuccess && variants.data.data.length > 0 && (
            <Table>
              <TableHead
                columns={[
                  'Item',
                  'SKU',
                  { label: 'Price', align: 'right' },
                  { label: 'In stock', align: 'right' },
                  '',
                ]}
              />
              <TableBody>
                {variants.data.data.map((variant) => (
                  <TableRow key={variant.id}>
                    <TableCell className="font-medium text-slate-900">
                      {variant.product.name}
                      <span className="block text-xs text-slate-500">{variant.name}</span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{variant.sku}</TableCell>
                    <TableCell align="right">{formatPaise(variant.priceCents)}</TableCell>
                    <TableCell
                      align="right"
                      className={variant.quantityOnHand === 0 ? 'text-amber-700' : undefined}
                    >
                      {variant.quantityOnHand}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={variant.quantityOnHand === 0}
                        onClick={() => addLine(variant)}
                      >
                        Add
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader title="This order" />

          <div className="space-y-4 px-5 py-4">
            <Field label="Customer name" htmlFor="customer-name">
              <Input
                id="customer-name"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
              />
            </Field>

            <Field label="Phone" htmlFor="customer-phone" hint="Optional.">
              <Input
                id="customer-phone"
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
              />
            </Field>

            {lines.length === 0 ? (
              <p className="py-4 text-sm text-slate-500">No items yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {lines.map((line) => (
                  <li key={line.variantId} className="space-y-1 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-slate-900">{line.label}</span>
                      <Button variant="ghost" size="sm" onClick={() => removeLine(line.variantId)}>
                        Remove
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        aria-label={`Quantity for ${line.label}`}
                        type="number"
                        min="1"
                        className="max-w-20"
                        value={line.quantity}
                        onChange={(event) =>
                          setQuantity(line.variantId, Number(event.target.value) || 1)
                        }
                      />
                      <span className="text-xs text-slate-500">
                        {line.available} in stock · {formatPaise(line.priceCents * line.quantity)}
                      </span>
                    </div>
                    {line.quantity > line.available && (
                      <p className="text-xs text-red-600">Only {line.available} available.</p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <dl className="space-y-1 border-t border-slate-200 pt-3 text-sm tabular-nums">
              <div className="flex justify-between text-slate-600">
                <dt>Subtotal</dt>
                <dd>{formatPaise(totals.subtotalCents)}</dd>
              </div>
              <div className="flex justify-between text-slate-600">
                <dt>Tax{taxRateBasisPoints !== null && ` (${taxRateBasisPoints / 100}%)`}</dt>
                <dd>{totals.taxCents === null ? '—' : formatPaise(totals.taxCents)}</dd>
              </div>
              <div className="flex justify-between font-medium text-slate-900">
                <dt>Total</dt>
                <dd>{totals.totalCents === null ? '—' : formatPaise(totals.totalCents)}</dd>
              </div>
            </dl>

            <Button
              className="w-full"
              disabled={!canSubmit || placeOrder.isPending}
              onClick={submit}
            >
              {placeOrder.isPending ? 'Placing' : 'Place order'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
