import {
  createRazorpayOrder,
  verifyPayment,
  paymentFailed,
  getPaymentDetails,
  refundPayment,
  createGuestOrder,
  getGuestOrder,
  getRazorpayOrderDetails,
  updatePaymentStatus
} from '../controller/paymentController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

export default async function paymentRoutes(fastify, opts) {
  // Guest routes (no authentication required)
  fastify.post('/guest-order', createGuestOrder);
  fastify.get('/guest-order/:orderId', getGuestOrder);

  // Payment routes (no authentication required for verification & failure)
  fastify.post('/create-order', createRazorpayOrder);
  fastify.post('/verify', verifyPayment);
  fastify.post('/failed', paymentFailed);

  // Protected routes
  fastify.get('/:paymentId', { preHandler: [protect] }, getPaymentDetails);
  fastify.post('/:paymentId/refund', { preHandler: [protect, admin] }, refundPayment);
  fastify.post('/:orderId/getpaydetails', getRazorpayOrderDetails);
  fastify.put('/:orderId/status', { preHandler: [protect, admin] }, updatePaymentStatus);
}