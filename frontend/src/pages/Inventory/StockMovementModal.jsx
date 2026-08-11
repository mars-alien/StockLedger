import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { errorMessage } from '../../api/client';
import { useAdjustStock, useReceiveStock, useVariantSearch } from '../../api/inventory';
import { ErrorBanner } from '../../components/shared/ErrorBanner';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Input, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';

const receiveSchema = z.object({
  variantId: z.string().uuid('Pick a variant'),
  quantity: z.coerce.number().int().min(1, 'Receive at least one unit'),
  note: z.string().trim().max(200).optional(),
});

const adjustSchema = z.object({
  variantId: z.string().uuid('Pick a variant'),
  delta: z.coerce
    .number()
    .int()
    .refine((value) => value !== 0, 'An adjustment cannot be zero'),
  note: z.string().trim().min(1, 'Say why the stock is being corrected').max(200),
});

export function StockMovementModal({ open, organizationId, mode, onClose }) {
  const receiving = mode === 'receive';
  const [search, setSearch] = useState('');

  const variants = useVariantSearch({ organizationId, search });
  const receive = useReceiveStock(organizationId);
  const adjust = useAdjustStock(organizationId);
  const saving = receiving ? receive : adjust;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm({ resolver: zodResolver(receiving ? receiveSchema : adjustSchema) });

  useEffect(() => {
    reset({ variantId: '', quantity: 1, delta: 0, note: '' });
    setSearch('');
  }, [open, mode, reset]);

  const options = variants.data?.data ?? [];
  const selected = options.find((option) => option.id === watch('variantId'));

  const close = () => {
    saving.reset();
    onClose();
  };

  const onSubmit = (values) => {
    saving.mutate({ ...values, note: values.note || undefined }, { onSuccess: close });
  };

  return (
    <Modal open={open} title={receiving ? 'Receive stock' : 'Adjust stock'} onClose={close}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field label="Find a variant" htmlFor="variant-search">
          <Input
            id="variant-search"
            placeholder="Search product, variant or SKU"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </Field>

        <Field label="Variant" htmlFor="movement-variant" error={errors.variantId?.message}>
          <Select id="movement-variant" {...register('variantId')}>
            <option value="">Select a variant</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.product.name} — {option.name} ({option.sku})
              </option>
            ))}
          </Select>
        </Field>

        {selected && (
          <p className="text-xs text-slate-500">Currently {selected.quantityOnHand} in stock.</p>
        )}

        {receiving ? (
          <Field
            label="Quantity received"
            htmlFor="movement-quantity"
            error={errors.quantity?.message}
          >
            <Input
              id="movement-quantity"
              type="number"
              min="1"
              invalid={Boolean(errors.quantity)}
              {...register('quantity')}
            />
          </Field>
        ) : (
          <Field
            label="Change"
            htmlFor="movement-delta"
            hint="Negative removes stock, positive adds it."
            error={errors.delta?.message}
          >
            <Input
              id="movement-delta"
              type="number"
              invalid={Boolean(errors.delta)}
              {...register('delta')}
            />
          </Field>
        )}

        <Field
          label={receiving ? 'Note' : 'Reason'}
          htmlFor="movement-note"
          hint={receiving ? 'Optional.' : 'Required, and kept on the ledger for good.'}
          error={errors.note?.message}
        >
          <Input id="movement-note" invalid={Boolean(errors.note)} {...register('note')} />
        </Field>

        {saving.isError && (
          <ErrorBanner>{errorMessage(saving.error, 'That movement was refused')}</ErrorBanner>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving.isPending}>
            {saving.isPending ? 'Saving' : receiving ? 'Receive' : 'Adjust'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
