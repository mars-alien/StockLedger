import { useState } from 'react';
import { errorMessage } from '../../api/client';
import {
  useChangeRole,
  useInvitations,
  useMembers,
  useRemoveMember,
  useRevokeInvitation,
} from '../../api/members';
import { EmptyState } from '../../components/shared/EmptyState';
import { ErrorBanner } from '../../components/shared/ErrorBanner';
import { ErrorState } from '../../components/shared/ErrorState';
import { TableSkeleton } from '../../components/shared/Loader';
import { Pagination } from '../../components/shared/Pagination';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Input, Select } from '../../components/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableRow } from '../../components/ui/Table';
import { useAuthStore } from '../../store/authStore';
import { formatDate } from '../../utils/datetime';
import { InviteMemberModal } from './InviteMemberModal';

const roles = ['OWNER', 'MANAGER', 'STAFF'];

export function MembersPage() {
  const organizationId = useAuthStore((state) => state.organization?.id);
  const currentUserId = useAuthStore((state) => state.user?.id);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);

  const members = useMembers({ organizationId, page, search });
  const invitations = useInvitations({ organizationId });
  const changeRole = useChangeRole(organizationId);
  const removeMember = useRemoveMember(organizationId);
  const revokeInvitation = useRevokeInvitation(organizationId);

  const actionError = changeRole.error ?? removeMember.error ?? revokeInvitation.error;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Members</h1>
          <p className="text-sm text-slate-500">Who can sign in to this organization.</p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>Invite member</Button>
      </div>

      {actionError && (
        <ErrorBanner>{errorMessage(actionError, 'That change did not go through')}</ErrorBanner>
      )}

      <Card>
        <CardHeader
          title="Team"
          action={
            <Input
              aria-label="Search members"
              placeholder="Search name or email"
              className="max-w-56"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          }
        />

        {members.isPending && <TableSkeleton columns={4} />}

        {members.isError && (
          <ErrorState
            message={errorMessage(members.error, 'The member list did not load')}
            onRetry={members.refetch}
          />
        )}

        {members.isSuccess && members.data.data.length === 0 && (
          <EmptyState
            title="No members match"
            description="Try a different search, or invite somebody new."
          />
        )}

        {members.isSuccess && members.data.data.length > 0 && (
          <>
            <Table>
              <TableHead columns={['Name', 'Email', 'Role', '']} />
              <TableBody>
                {members.data.data.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium text-slate-900">{member.user.name}</TableCell>
                    <TableCell>{member.user.email}</TableCell>
                    <TableCell>
                      {member.user.id === currentUserId ? (
                        <Badge tone="indigo">{member.role.toLowerCase()}</Badge>
                      ) : (
                        <Select
                          aria-label={`Role for ${member.user.name}`}
                          className="max-w-36"
                          value={member.role}
                          disabled={changeRole.isPending}
                          onChange={(event) =>
                            changeRole.mutate({
                              membershipId: member.id,
                              role: event.target.value,
                            })
                          }
                        >
                          {roles.map((role) => (
                            <option key={role} value={role}>
                              {role.toLowerCase()}
                            </option>
                          ))}
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {member.user.id !== currentUserId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={removeMember.isPending}
                          onClick={() => removeMember.mutate(member.id)}
                        >
                          Remove
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Pagination
              page={members.data.page}
              totalPages={members.data.totalPages}
              total={members.data.total}
              onChange={setPage}
            />
          </>
        )}
      </Card>

      <Card>
        <CardHeader title="Pending invitations" />

        {invitations.isPending && <TableSkeleton columns={3} rows={2} />}

        {invitations.isError && (
          <ErrorState
            message={errorMessage(invitations.error, 'Invitations did not load')}
            onRetry={invitations.refetch}
          />
        )}

        {invitations.isSuccess && invitations.data.data.length === 0 && (
          <EmptyState
            title="Nothing pending"
            description="Invitations you send will show up here."
          />
        )}

        {invitations.isSuccess && invitations.data.data.length > 0 && (
          <Table>
            <TableHead columns={['Email', 'Role', 'Expires', '']} />
            <TableBody>
              {invitations.data.data.map((invitation) => (
                <TableRow key={invitation.id}>
                  <TableCell className="font-medium text-slate-900">{invitation.email}</TableCell>
                  <TableCell>{invitation.role.toLowerCase()}</TableCell>
                  <TableCell>{formatDate(invitation.expiresAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={revokeInvitation.isPending}
                      onClick={() => revokeInvitation.mutate(invitation.id)}
                    >
                      Revoke
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <InviteMemberModal
        open={inviteOpen}
        organizationId={organizationId}
        onClose={() => setInviteOpen(false)}
      />
    </div>
  );
}
