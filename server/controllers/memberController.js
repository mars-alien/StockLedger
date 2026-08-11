import * as memberService from '../services/memberService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const list = asyncHandler(async (req, res) => {
  const result = await memberService.list({
    organizationId: req.organizationId,
    ...req.validated.query,
  });
  res.json(result);
});

export const invite = asyncHandler(async (req, res) => {
  const result = await memberService.invite({
    organizationId: req.organizationId,
    actorUserId: req.user.id,
    ...req.validated.body,
  });
  res.status(201).json(result);
});

export const listInvitations = asyncHandler(async (req, res) => {
  const result = await memberService.listInvitations({
    organizationId: req.organizationId,
    ...req.validated.query,
  });
  res.json(result);
});

export const revokeInvitation = asyncHandler(async (req, res) => {
  await memberService.revokeInvitation({
    organizationId: req.organizationId,
    actorUserId: req.user.id,
    invitationId: req.validated.params.invitationId,
  });
  res.status(204).end();
});

export const changeRole = asyncHandler(async (req, res) => {
  const result = await memberService.changeRole({
    organizationId: req.organizationId,
    actorUserId: req.user.id,
    membershipId: req.validated.params.membershipId,
    role: req.validated.body.role,
  });
  res.json(result);
});

export const remove = asyncHandler(async (req, res) => {
  await memberService.remove({
    organizationId: req.organizationId,
    actorUserId: req.user.id,
    membershipId: req.validated.params.membershipId,
  });
  res.status(204).end();
});
