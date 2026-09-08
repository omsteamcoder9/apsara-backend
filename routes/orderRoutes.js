import {
  createOrder,
  getOrders,
  getUserOrders,
  getOrderById,
  updateOrderStatus,
  getOrderSummary,
  printOrderReceipt,
  printOrderReceiptPDF,
  cancelOrder,
  deleteOrder
} from '../controller/orderController.js';
import { protect, admin } from '../middleware/authMiddleware.js';
import { refundPayment } from '../controller/paymentController.js';

export default async function orderRoutes(fastify, opts) {
  // Create order (authenticated) / Get all orders (admin)
  fastify.post('/', { preHandler: [protect] }, createOrder);
fastify.get('/', { preHandler: [protect] }, getOrders);

  // Get user's own orders
  fastify.get('/my-orders', { preHandler: [protect] }, getUserOrders);

  // Get order summary (admin only)
  fastify.get('/summary', { preHandler: [protect, admin] }, getOrderSummary);

  // Get single order by ID
  fastify.get('/:id', { preHandler: [protect] }, getOrderById);

  // Update order status (admin only)
  fastify.put('/:id/status', { preHandler: [protect, admin] }, updateOrderStatus);

  // Delete order (admin only)
  fastify.delete('/:id', { preHandler: [protect, admin] }, deleteOrder);

  // Cancel order endpoint (authenticated user or admin)
  fastify.put('/:id/cancel', { preHandler: [protect] }, cancelOrder);

  // Receipt endpoints
  fastify.get('/:id/receipt', { preHandler: [protect] }, printOrderReceipt);        // JSON or PDF based on request
  fastify.get('/:id/receipt/pdf', { preHandler: [protect] }, printOrderReceiptPDF); // Force PDF download
}