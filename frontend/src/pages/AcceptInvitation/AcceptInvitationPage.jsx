import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { useAcceptInvitation, useInvitationPreview } from '../../api/auth';
import { errorMessage } from '../../api/client';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { ErrorBanner } from '../../components/shared/ErrorBanner';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { Loader } from '../../components/shared/Loader';

const newAccountSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name'),
  password: z.string().min(8, 'Use at least 8 characters'),
});

const existingAccountSchema = z.object({
  password: z.string().min(1, 'Enter your password'),
});

export function AcceptInvitationPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();

  const preview = useInvitationPreview(token);
  const accept = useAcceptInvitation();
  const needsAccount = preview.data?.requiresRegistration ?? true;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(needsAccount ? newAccountSchema : existingAccountSchema) });

  if (!token) {
    return (
      <AuthLayout title="Invitation link is incomplete">
        <p className="text-sm text-slate-500">
          Open the link straight from the invitation email so the token comes with it.
        </p>
      </AuthLayout>
    );
  }

  if (preview.isPending) {
    return (
      <AuthLayout title="Checking your invitation">
        <Loader label="One moment" />
      </AuthLayout>
    );
  }

  if (preview.isError) {
    return (
      <AuthLayout title="This invitation is not valid">
        <p className="text-sm text-slate-500">
          {errorMessage(preview.error, 'It may have expired or already been used.')}
        </p>
      </AuthLayout>
    );
  }

  const invitation = preview.data;
  const goToApp = () => navigate('/', { replace: true });

  return (
    <AuthLayout
      title={`Join ${invitation.organizationName}`}
      subtitle={`You were invited as ${invitation.role.toLowerCase()} using ${invitation.email}.`}
    >
      <form
        onSubmit={handleSubmit((values) =>
          accept.mutate({ token, ...values }, { onSuccess: goToApp }),
        )}
        className="space-y-4"
      >
        {needsAccount ? (
          <Field label="Full name" htmlFor="name" error={errors.name?.message}>
            <Input id="name" invalid={Boolean(errors.name)} {...register('name')} />
          </Field>
        ) : (
          <p className="text-sm text-slate-500">
            You already have an account with this email. Confirm your password to join.
          </p>
        )}

        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete={needsAccount ? 'new-password' : 'current-password'}
            invalid={Boolean(errors.password)}
            {...register('password')}
          />
        </Field>

        {accept.isError && (
          <ErrorBanner>{errorMessage(accept.error, 'Could not accept the invitation')}</ErrorBanner>
        )}

        <Button type="submit" className="w-full" disabled={accept.isPending}>
          {accept.isPending ? 'Joining' : needsAccount ? 'Create account and join' : 'Join'}
        </Button>
      </form>
    </AuthLayout>
  );
}
