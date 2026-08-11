import * as organizationService from '../services/organizationService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const create = asyncHandler(async (req, res) => {
  const result = await organizationService.create({
    userId: req.user.id,
    name: req.validated.body.name,
  });
  res.status(201).json(result);
});

export const list = asyncHandler(async (req, res) => {
  const result = await organizationService.listForUser({
    userId: req.user.id,
    ...req.validated.query,
  });
  res.json(result);
});

export const current = asyncHandler(async (req, res) => {
  const result = await organizationService.current({
    userId: req.user.id,
    organizationId: req.organizationId,
  });
  res.json(result);
});

export const switchTo = asyncHandler(async (req, res) => {
  const result = await organizationService.switchTo({
    userId: req.user.id,
    organizationId: req.validated.params.organizationId,
  });
  res.json(result);
});
