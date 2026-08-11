import * as paymentService from '../services/paymentService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const createIntent = asyncHandler(async (req, res) => {
  const result = await paymentService.createIntent({
    organizationId: req.organizationId,
    orderId: req.validated.params.orderId,
  });
  res.status(201).json(result);
});

export const verifyCheckout = asyncHandler(async (req, res) => {
  const result = await paymentService.verifyCheckout({
    organizationId: req.organizationId,
    actorUserId: req.user.id,
    ...req.validated.body,
  });
  res.json(result);
});

export const handleWebhook = asyncHandler(async (req, res) => {
  const result = await paymentService.handleWebhook({
    rawBody: req.rawBody,
    signature: req.headers['x-razorpay-signature'],
  });
  res.json(result);
});
