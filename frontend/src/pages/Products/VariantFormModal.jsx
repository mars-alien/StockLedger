import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { errorMessage } from '../../api/client';
import { useAddVariant, useUpdateVariant } from '../../api/products';
import { ErrorBanner } from '../../components/shared/ErrorBanner';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { paiseToRupees, rupeesToPaise } from '../../utils/money';

const variantSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(1, 'A SKU is required')
    .regex(/^[A-Za-z0-9._-]+$/, 'Letters, numbers, dot, dash or underscore only'),
  name: z.string().trim().min(1, 'Name this variant, for example Large / Blue'),
  price: z.coerce.number().min(0, 'Price cannot be negative'),
  cost: z.coerce.number().min(0, 'Cost cannot be negative'),
});

const emptyVariant = { sku: '', name: '', price: '0.00', cost: '0.00' };

export function VariantFormModal({ open, organizationId, productId, variant, onClose }) {
  const add = useAddVariant(organizationId);
  const update = useUpdateVariant(organizationId);
  const saving = variant ? update : add;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({ resolver: zodResolver(variantSchema), defaultValues: emptyVariant });

  useEffect(() => {
    reset(
      variant
        ? {
            sku: variant.sku,
            name: variant.name,
            price: paiseToRupees(variant.priceCents),
            cost: paiseToRupees(variant.costCents),
          }
        : emptyVariant,
    );
  }, [variant, open, reset]);

  const close = () => {
    saving.reset();
    onClose();
  };

  const onSubmit = (values) => {
    const payload = {
      productId,
      sku: values.sku,
      name: values.name,
      priceCents: rupeesToPaise(values.price),
      costCents: rupeesToPaise(values.cost),
    };
    saving.mutate(variant ? { variantId: variant.id, ...payload } : payload, { onSuccess: close });
  };

  return (
    <Modal open={open} title={variant ? 'Edit variant' : 'New variant'} onClose={close}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field label="SKU" htmlFor="variant-sku" error={errors.sku?.message}>
          <Input id="variant-sku" invalid={Boolean(errors.sku)} {...register('sku')} />
        </Field>

        <Field label="Name" htmlFor="variant-name" error={errors.name?.message}>
          <Input
            id="variant-name"
            placeholder="Large / Blue"
            invalid={Boolean(errors.name)}
            {...register('name')}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Selling price" htmlFor="variant-price" error={errors.price?.message}>
            <Input
              id="variant-price"
              type="number"
              step="0.01"
              min="0"
              invalid={Boolean(errors.price)}
              {...register('price')}
            />
          </Field>

          <Field label="Cost price" htmlFor="variant-cost" error={errors.cost?.message}>
            <Input
              id="variant-cost"
              type="number"
              step="0.01"
              min="0"
              invalid={Boolean(errors.cost)}
              {...register('cost')}
            />
          </Field>
        </div>

        {saving.isError && (
          <ErrorBanner>{errorMessage(saving.error, 'Could not save the variant')}</ErrorBanner>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving.isPending}>
            {saving.isPending ? 'Saving' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
