import {
  createShipment,
  shipRocketLogin,
  getPickupLocations,
  getCourierServiceability,
  getServiceabilityByOrder,
  getOrderShipment,           
  getAllShipments,            
  getShipmentStatistics,
  trackShipmentById,
  cancelShipment // ✅ ADD CANCELLATION IMPORT
} from '../controller/shippingController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

export default async function shippingRoutes(fastify, opts) {
  // Existing routes
  fastify.post('/orders/:orderId/shipment', { preHandler: [protect, admin] }, createShipment);
  fastify.get('/login', { preHandler: [protect, admin] }, shipRocketLogin);
  fastify.get('/pickup-locations', { preHandler: [protect, admin] }, getPickupLocations);
  fastify.get('/serviceability', { preHandler: [protect, admin] }, getCourierServiceability);
  fastify.get('/orders/:orderId/serviceability', { preHandler: [protect, admin] }, getServiceabilityByOrder);

  // ✅ ADMIN SHIPMENT ROUTES
  fastify.get('/orders/:orderId/shipment', { preHandler: [protect, admin] }, getOrderShipment);
  fastify.get('/shipments', { preHandler: [protect, admin] }, getAllShipments);
  fastify.get('/statistics', { preHandler: [protect, admin] }, getShipmentStatistics);
  fastify.get('/track/:shipmentId', { preHandler: [protect, admin] }, trackShipmentById);

  // ✅ CANCELLATION ROUTE
  fastify.post('/orders/:orderId/cancel', { preHandler: [protect, admin] }, cancelShipment);
}