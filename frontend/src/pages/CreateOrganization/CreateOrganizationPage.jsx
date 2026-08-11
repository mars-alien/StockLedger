import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { errorMessage } from '../../api/client';
import { useCreateOrganization } from '../../api/organizations';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { ErrorBanner } from '../../components/shared/ErrorBanner';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { useAuthStore } from '../../store/authStore';

const organizationSchema = z.object({
  name: z.string().trim().min(2, 'Give the organization a name'),
});

export function CreateOrganizationPage() {
  const navigate = useNavigate();
  const organization = useAuthStore((state) => state.organization);
  const createOrganization = useCreateOrganization();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(organizationSchema) });

  if (organization) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = (values) => {
    createOrganization.mutate(values, { onSuccess: () => navigate('/', { replace: true }) });
  };

  return (
    <AuthLayout
      title="Create your organization"
      subtitle="Everything you add lives inside it, and you can invite your team once it exists."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field
          label="Organization name"
          htmlFor="name"
          hint="Your shop or company name."
          error={errors.name?.message}
        >
          <Input id="name" invalid={Boolean(errors.name)} {...register('name')} />
        </Field>

        {createOrganization.isError && (
          <ErrorBanner>
            {errorMessage(createOrganization.error, 'Could not create the organization')}
          </ErrorBanner>
        )}

        <Button type="submit" className="w-full" disabled={createOrganization.isPending}>
          {createOrganization.isPending ? 'Creating' : 'Create organization'}
        </Button>
      </form>
    </AuthLayout>
  );
}
