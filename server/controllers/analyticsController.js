import * as analyticsService from '../services/analyticsService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const dashboard = asyncHandler(async (req, res) => {
  const result = await analyticsService.dashboard({
    organizationId: req.organizationId,
    ...req.validated.query,
  });
  res.json(result);
});
