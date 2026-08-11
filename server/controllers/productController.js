import * as productService from '../services/productService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const list = asyncHandler(async (req, res) => {
  const result = await productService.list({
    organizationId: req.organizationId,
    ...req.validated.query,
  });
  res.json(result);
});

export const get = asyncHandler(async (req, res) => {
  const result = await productService.get({
    organizationId: req.organizationId,
    productId: req.validated.params.productId,
  });
  res.json(result);
});

export const create = asyncHandler(async (req, res) => {
  const result = await productService.create({
    organizationId: req.organizationId,
    actorUserId: req.user.id,
    ...req.validated.body,
  });
  res.status(201).json(result);
});

export const update = asyncHandler(async (req, res) => {
  const result = await productService.update({
    organizationId: req.organizationId,
    actorUserId: req.user.id,
    productId: req.validated.params.productId,
    ...req.validated.body,
  });
  res.json(result);
});

export const remove = asyncHandler(async (req, res) => {
  await productService.remove({
    organizationId: req.organizationId,
    actorUserId: req.user.id,
    productId: req.validated.params.productId,
  });
  res.status(204).end();
});

export const uploadImage = asyncHandler(async (req, res) => {
  const result = await productService.setImage({
    organizationId: req.organizationId,
    actorUserId: req.user.id,
    productId: req.validated.params.productId,
    file: req.file,
  });
  res.json(result);
});

export const addVariant = asyncHandler(async (req, res) => {
  const result = await productService.addVariant({
    organizationId: req.organizationId,
    actorUserId: req.user.id,
    productId: req.validated.params.productId,
    ...req.validated.body,
  });
  res.status(201).json(result);
});

export const updateVariant = asyncHandler(async (req, res) => {
  const result = await productService.updateVariant({
    organizationId: req.organizationId,
    actorUserId: req.user.id,
    variantId: req.validated.params.variantId,
    ...req.validated.body,
  });
  res.json(result);
});

export const removeVariant = asyncHandler(async (req, res) => {
  await productService.removeVariant({
    organizationId: req.organizationId,
    actorUserId: req.user.id,
    variantId: req.validated.params.variantId,
  });
  res.status(204).end();
});
