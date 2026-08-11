import * as demoService from '../services/demoService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getState = asyncHandler(async (req, res) => {
  const result = await demoService.getState({ organizationId: req.organizationId });
  res.json(result);
});

export const reset = asyncHandler(async (req, res) => {
  const result = await demoService.reset({
    organizationId: req.organizationId,
    actorUserId: req.user.id,
  });
  res.json(result);
});

export const placeUnsafeOrder = asyncHandler(async (req, res) => {
  const result = await demoService.placeUnsafeOrder({
    organizationId: req.organizationId,
    actorUserId: req.user.id,
  });
  res.status(201).json(result);
});
