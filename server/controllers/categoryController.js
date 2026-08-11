import * as categoryService from '../services/categoryService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const list = asyncHandler(async (req, res) => {
  const result = await categoryService.list({
    organizationId: req.organizationId,
    ...req.validated.query,
  });
  res.json(result);
});

export const create = asyncHandler(async (req, res) => {
  const result = await categoryService.create({
    organizationId: req.organizationId,
    actorUserId: req.user.id,
    ...req.validated.body,
  });
  res.status(201).json(result);
});

export const update = asyncHandler(async (req, res) => {
  const result = await categoryService.update({
    organizationId: req.organizationId,
    actorUserId: req.user.id,
    categoryId: req.validated.params.categoryId,
    ...req.validated.body,
  });
  res.json(result);
});

export const remove = asyncHandler(async (req, res) => {
  await categoryService.remove({
    organizationId: req.organizationId,
    actorUserId: req.user.id,
    categoryId: req.validated.params.categoryId,
  });
  res.status(204).end();
});
