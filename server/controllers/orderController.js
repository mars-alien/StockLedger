import * as orderService from '../services/orderService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const list = asyncHandler(async (req, res) => {
  const result = await orderService.list({
    organizationId: req.organizationId,
    ...req.validated.query,
  });
  res.json(result);
});

export const get = asyncHandler(async (req, res) => {
  const result = await orderService.get({
    organizationId: req.organizationId,
    orderId: req.validated.params.orderId,
  });
  res.json(result);
});

export const create = asyncHandler(async (req, res) => {
  const result = await orderService.placeOrder({
    organizationId: req.organizationId,
    actorUserId: req.user.id,
    idempotencyKey: req.validated.headers.idempotencyKey,
    payload: req.validated.body,
  });

  res.set('Idempotency-Replayed', String(result.replayed));
  res.status(result.status).json(result.body);
});

export const downloadInvoice = asyncHandler(async (req, res) => {
  const { filename, document } = await orderService.buildInvoice({
    organizationId: req.organizationId,
    orderId: req.validated.params.orderId,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  document.pipe(res);
});

export const cancel = asyncHandler(async (req, res) => {
  const result = await orderService.cancelOrder({
    organizationId: req.organizationId,
    actorUserId: req.user.id,
    orderId: req.validated.params.orderId,
    note: req.validated.body.note,
  });
  res.json(result);
});
