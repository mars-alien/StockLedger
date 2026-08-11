import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useRegister } from '../../api/auth';
import { errorMessage } from '../../api/client';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { ErrorBanner } from '../../components/shared/ErrorBanner';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name'),
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters'),
});

export function RegisterPage() {
  const navigate = useNavigate();
  const createAccount = useRegister();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(registerSchema) });

  const onSubmit = (values) => {
    createAccount.mutate(values, {
      onSuccess: () => navigate('/onboarding', { replace: true }),
    });
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="You will set up your organization next."
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className="font-medium text-indigo-600 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field label="Full name" htmlFor="name" error={errors.name?.message}>
          <Input id="name" invalid={Boolean(errors.name)} {...register('name')} />
        </Field>

        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            invalid={Boolean(errors.email)}
            {...register('email')}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          hint="At least 8 characters."
          error={errors.password?.message}
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            invalid={Boolean(errors.password)}
            {...register('password')}
          />
        </Field>

        {createAccount.isError && (
          <ErrorBanner>
            {errorMessage(createAccount.error, 'Could not create the account')}
          </ErrorBanner>
        )}

        <Button type="submit" className="w-full" disabled={createAccount.isPending}>
          {createAccount.isPending ? 'Creating account' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  );
}
