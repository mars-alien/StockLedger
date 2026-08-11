import * as inventoryService from '../services/inventoryService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const listMovements = asyncHandler(async (req, res) => {
  const result = await inventoryService.listMovements({
    organizationId: req.organizationId,
    ...req.validated.query,
  });
  res.json(result);
});

export const listVariants = asyncHandler(async (req, res) => {
  const result = await inventoryService.listVariants({
    organizationId: req.organizationId,
    ...req.validated.query,
  });
  res.json(result);
});

export const receiveStock = asyncHandler(async (req, res) => {
  const result = await inventoryService.receiveStock({
    organizationId: req.organizationId,
    actorUserId: req.user.id,
    ...req.validated.body,
  });
  res.status(201).json(result);
});

export const adjustStock = asyncHandler(async (req, res) => {
  const result = await inventoryService.adjustStock({
    organizationId: req.organizationId,
    actorUserId: req.user.id,
    ...req.validated.body,
  });
  res.status(201).json(result);
});
