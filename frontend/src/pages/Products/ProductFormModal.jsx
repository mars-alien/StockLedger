import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useCategoryOptions } from '../../api/categories';
import { errorMessage } from '../../api/client';
import { useCreateProduct, useUpdateProduct } from '../../api/products';
import { ErrorBanner } from '../../components/shared/ErrorBanner';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Input, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';

const productSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(1, 'A SKU is required')
    .regex(/^[A-Za-z0-9._-]+$/, 'Letters, numbers, dot, dash or underscore only'),
  name: z.string().trim().min(1, 'Give the product a name'),
  description: z.string().trim().max(2000).optional(),
  categoryId: z.string().optional(),
});

const emptyProduct = { sku: '', name: '', description: '', categoryId: '' };

export function ProductFormModal({ open, organizationId, product, onClose }) {
  const categories = useCategoryOptions({ organizationId });
  const create = useCreateProduct(organizationId);
  const update = useUpdateProduct(organizationId);
  const saving = product ? update : create;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({ resolver: zodResolver(productSchema), defaultValues: emptyProduct });

  useEffect(() => {
    reset(
      product
        ? {
            sku: product.sku,
            name: product.name,
            description: product.description ?? '',
            categoryId: product.category?.id ?? '',
          }
        : emptyProduct,
    );
  }, [product, open, reset]);

  const close = () => {
    saving.reset();
    onClose();
  };

  const onSubmit = (values) => {
    // An empty select means "no category", which the API expects as null rather
    // than an empty string.
    const payload = {
      ...values,
      description: values.description || null,
      categoryId: values.categoryId || null,
    };
    saving.mutate(product ? { productId: product.id, ...payload } : payload, { onSuccess: close });
  };

  return (
    <Modal open={open} title={product ? 'Edit product' : 'New product'} onClose={close}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field label="SKU" htmlFor="product-sku" error={errors.sku?.message}>
          <Input id="product-sku" invalid={Boolean(errors.sku)} {...register('sku')} />
        </Field>

        <Field label="Name" htmlFor="product-name" error={errors.name?.message}>
          <Input id="product-name" invalid={Boolean(errors.name)} {...register('name')} />
        </Field>

        <Field label="Category" htmlFor="product-category">
          <Select id="product-category" {...register('categoryId')}>
            <option value="">No category</option>
            {(categories.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Description"
          htmlFor="product-description"
          error={errors.description?.message}
        >
          <textarea
            id="product-description"
            rows={3}
            className="w-full rounded-md bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 focus:ring-2 focus:ring-indigo-600 focus:outline-none"
            {...register('description')}
          />
        </Field>

        {saving.isError && (
          <ErrorBanner>{errorMessage(saving.error, 'Could not save the product')}</ErrorBanner>
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
