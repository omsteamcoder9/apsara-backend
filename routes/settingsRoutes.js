// routes/settingsRoutes.js - SIMPLIFIED
import {
  getSettings,
  updateSettings,
  getPublicSettings,
  handleFileUpload,  // ← Use the controller's function
  deleteQrCode,
  uploadQrCode
} from '../controller/settingsController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

export default async function settingsRoutes(fastify, opts) {
  // Public route for frontend
  fastify.get('/public', getPublicSettings);

  // QR code specific routes
  fastify.delete('/qr-code/:type', { preHandler: [protect, authorize('admin')] }, deleteQrCode);
  fastify.post('/qr-code/:type', { 
    preHandler: [protect, authorize('admin'), handleFileUpload] 
  }, uploadQrCode);

  // Admin routes
  fastify.get('/', { preHandler: [protect, authorize('admin')] }, getSettings);
  fastify.put('/', { 
    preHandler: [protect, authorize('admin'), handleFileUpload] 
  }, updateSettings);
}