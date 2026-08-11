import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { errorMessage } from '../../api/client';
import { useCreateCategory, useUpdateCategory } from '../../api/categories';
import { ErrorBanner } from '../../components/shared/ErrorBanner';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';

const categorySchema = z.object({
  name: z.string().trim().min(1, 'Give the category a name').max(60),
});

export function CategoryFormModal({ open, organizationId, category, onClose }) {
  const create = useCreateCategory(organizationId);
  const update = useUpdateCategory(organizationId);
  const saving = category ? update : create;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({ resolver: zodResolver(categorySchema), defaultValues: { name: '' } });

  useEffect(() => {
    reset({ name: category?.name ?? '' });
  }, [category, open, reset]);

  const close = () => {
    saving.reset();
    onClose();
  };

  const onSubmit = (values) => {
    const payload = category ? { categoryId: category.id, ...values } : values;
    saving.mutate(payload, { onSuccess: close });
  };

  return (
    <Modal open={open} title={category ? 'Rename category' : 'New category'} onClose={close}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field label="Name" htmlFor="category-name" error={errors.name?.message}>
          <Input id="category-name" invalid={Boolean(errors.name)} {...register('name')} />
        </Field>

        {saving.isError && (
          <ErrorBanner>{errorMessage(saving.error, 'Could not save the category')}</ErrorBanner>
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
