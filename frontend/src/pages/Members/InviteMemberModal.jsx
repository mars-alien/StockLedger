import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { errorMessage } from '../../api/client';
import { useInviteMember } from '../../api/members';
import { ErrorBanner } from '../../components/shared/ErrorBanner';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Input, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { formatDate } from '../../utils/datetime';

const inviteSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  role: z.enum(['OWNER', 'MANAGER', 'STAFF']),
});

export function InviteMemberModal({ open, organizationId, onClose }) {
  const invite = useInviteMember(organizationId);
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({ resolver: zodResolver(inviteSchema), defaultValues: { role: 'STAFF' } });

  const close = () => {
    reset();
    invite.reset();
    setCreated(null);
    setCopied(false);
    onClose();
  };

  const onSubmit = (values) => {
    invite.mutate(values, { onSuccess: setCreated });
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(created.inviteUrl);
    setCopied(true);
  };

  if (created) {
    return (
      <Modal open={open} title="Invitation ready" onClose={close}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Send this link to {created.email}. It works once, expires on{' '}
            {formatDate(created.expiresAt)}, and is shown only now — the server keeps a hash, not
            the link.
          </p>

          <div className="flex gap-2">
            <Input readOnly value={created.inviteUrl} onFocus={(event) => event.target.select()} />
            <Button variant="secondary" onClick={copyLink}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>

          <div className="flex justify-end">
            <Button onClick={close}>Done</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} title="Invite a member" onClose={close}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field label="Email" htmlFor="invite-email" error={errors.email?.message}>
          <Input
            id="invite-email"
            type="email"
            invalid={Boolean(errors.email)}
            {...register('email')}
          />
        </Field>

        <Field label="Role" htmlFor="invite-role" error={errors.role?.message}>
          <Select id="invite-role" {...register('role')}>
            <option value="STAFF">Staff</option>
            <option value="MANAGER">Manager</option>
            <option value="OWNER">Owner</option>
          </Select>
        </Field>

        {invite.isError && (
          <ErrorBanner>{errorMessage(invite.error, 'Could not create the invitation')}</ErrorBanner>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={invite.isPending}>
            {invite.isPending ? 'Creating' : 'Create invite link'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
