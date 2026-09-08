import { 
  sendEmail, 
  sendOrderConfirmation, 
  sendOrderStatusUpdate,
  sendOrderCancellationNotification,
  testEmail,
  emailTemplates
} from '../controller/emailController.js';
import { protect, admin } from '../middleware/authMiddleware.js';
import Order from '../models/orderModel.js';

export default async function emailRoutes(fastify, opts) {
  // @desc    Test email sending
  // @route   POST /api/email/test
  // @access  Private/Admin
  fastify.post('/test', { preHandler: [protect, admin] }, async (req, reply) => {
    try {
      const { to, subject, message } = req.body;
      
      const result = await sendEmail(
        to, 
        subject || 'Test Email', 
        message || '<h1>Test Email</h1><p>This is a test email from your application.</p>'
      );

      reply.send({
        success: true,
        message: 'Test email sent successfully',
        result
      });
    } catch (error) {
      reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // @desc    Resend order confirmation
  // @route   POST /api/email/order-confirmation/:orderId
  // @access  Private/Admin
  fastify.post('/order-confirmation/:orderId', { preHandler: [protect, admin] }, async (req, reply) => {
    try {
      const result = await sendOrderConfirmation(req.params.orderId);
      
      reply.send({
        success: true,
        message: 'Order confirmation email sent successfully',
        result
      });
    } catch (error) {
      reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // @desc    Send order status update
  // @route   POST /api/email/order-status/:orderId
  // @access  Private/Admin
  fastify.put('/order-status/:orderId', { preHandler: [protect, admin] }, async (req, reply) => {
    try {
      const { oldStatus, newStatus } = req.body;
      
      // Find the order first
      const order = await Order.findById(req.params.orderId)
        .populate('user', 'name email')
        .populate('guestUser', 'name email phone')
        .populate('products.product', 'name price');
      
      if (!order) {
        return reply.status(404).send({
          success: false,
          message: 'Order not found'
        });
      }

      // Send status update email to customer
      const emailTemplate = emailTemplates.orderStatusUpdate(order, oldStatus, newStatus);
      const result = await sendEmail(
        order.isGuestOrder ? order.guestUser?.email : order.user?.email,
        emailTemplate.subject,
        emailTemplate.html
      );
      
      reply.send({
        success: true,
        message: 'Order status update email sent successfully',
        result
      });
    } catch (error) {
      reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // @desc    Send order cancellation notification (Admin only)
  // @route   POST /api/email/order-cancellation/:orderId
  // @access  Private/Admin
  fastify.post('/order-cancellation/:orderId', { preHandler: [protect, admin] }, async (req, reply) => {
    try {
      const { cancellationReason } = req.body;
      
      // Find the order
      const order = await Order.findById(req.params.orderId)
        .populate('user', 'name email')
        .populate('guestUser', 'name email phone')
        .populate('products.product', 'name price');
      
      if (!order) {
        return reply.status(404).send({
          success: false,
          message: 'Order not found'
        });
      }

      // Send cancellation notification to admin
      const result = await sendOrderCancellationNotification(
        order, 
        'admin', 
        cancellationReason || 'Admin initiated cancellation'
      );
      
      reply.send({
        success: true,
        message: 'Order cancellation notification sent to admin',
        result
      });
    } catch (error) {
      reply.status(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // @desc    Test email configuration
  // @route   GET /api/email/test-config
  // @access  Private/Admin
  fastify.get('/test-config', { preHandler: [protect, admin] }, testEmail);
}