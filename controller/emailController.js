// controllers/emailController.js
import nodemailer from 'nodemailer';
import Order from '../models/orderModel.js';
import User from '../models/userModel.js';
import Setting from '../models/Setting.js';
import {
  ValidationError,
  NotFoundError,
  DatabaseError
} from '../utils/errors.js';

// Create transporter (configure with your email service)
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.ADMIN_EMAIL,
      pass: process.env.ADMIN_PASS
    }
  });
};

// ✅ Helper: Fetch dynamic site name from settings
const getSiteName = async () => {
  try {
    const settings = await Setting.findOne().select('siteName');
    return settings?.siteName || 'Your Store';
  } catch (error) {
    console.error('Error fetching site name:', error);
    return 'Your Store';
  }
};

// Email templates - COMPLETE VERSION WITH ALL TEMPLATES
export const emailTemplates = {
  userOrderConfirmation: (order, siteName = 'Your Store', isGuest = false) => {
    // Safe data extraction with comprehensive fallbacks
    const userName = isGuest 
      ? (order.guestUser?.name || order.shippingAddress?.fullName || order.shippingAddress?.name || 'Customer')
      : (order.user?.name || 'Customer');
    
    const email = isGuest 
      ? (order.guestUser?.email || order.shippingAddress?.email || '')
      : (order.user?.email || '');

    // Safe order details extraction
    const orderId = order.orderId || 'N/A';
    const orderStatus = order.orderStatus || 'confirmed';
    const finalAmount = order.finalAmount || 0;
    const paymentMethod = order.paymentMethod || 'razorpay';
    const paymentStatus = order.paymentStatus || 'completed';
    
    // Safe products handling
    const products = order.products || [];
    const productsHtml = products.map(item => `
      <tr>
        <td>${item.product?.name || 'Product'}</td>
        <td>${item.quantity || 1}</td>
        <td>₹${item.price || 0}</td>
        <td>₹${(item.quantity || 1) * (item.price || 0)}</td>
      </tr>
    `).join('');

    // Safe shipping address handling
    const shippingAddress = order.shippingAddress || {};
    const shippingHtml = `
      <p>
        ${shippingAddress.fullName || shippingAddress.name || 'Customer'}<br>
        ${shippingAddress.address || 'Address not provided'}<br>
        ${shippingAddress.city || ''}, ${shippingAddress.state || ''} - ${shippingAddress.pincode || ''}<br>
        ${shippingAddress.phone ? `Phone: ${shippingAddress.phone}` : ''}
      </p>
    `;

    console.log('📧 Template user details:', { userName, email, isGuest, orderId });

    return {
      subject: `Order Confirmation - ${orderId}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
                .content { background: #f9f9f9; padding: 20px; }
                .order-details { width: 100%; border-collapse: collapse; margin: 20px 0; }
                .order-details th, .order-details td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
                .order-details th { background: #f2f2f2; }
                .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
                .status { padding: 5px 10px; border-radius: 3px; font-weight: bold; }
                .status-pending { background: #fff3cd; color: #856404; }
                .status-confirmed { background: #d1ecf1; color: #0c5460; }
                .status-delivered { background: #d4edda; color: #155724; }
                .amount-section { background: white; padding: 15px; margin: 15px 0; border-radius: 5px; border: 1px solid #ddd; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Order Confirmed!</h1>
                    <p>Thank you for your purchase</p>
                </div>
                <div class="content">
                    <h2>Hello ${userName},</h2>
                    <p>Your order has been successfully confirmed. Here are your order details:</p>
                    
                    <div class="amount-section">
                        <h3>Order Summary</h3>
                        <table class="order-details">
                            <tr>
                                <th>Order ID:</th>
                                <td>${orderId}</td>
                            </tr>
                            <tr>
                                <th>Order Date:</th>
                                <td>${new Date(order.createdAt || Date.now()).toLocaleString()}</td>
                            </tr>
                            <tr>
                                <th>Order Status:</th>
                                <td><span class="status status-confirmed">${orderStatus}</span></td>
                            </tr>
                            <tr>
                                <th>Payment Method:</th>
                                <td>${paymentMethod.toUpperCase()}</td>
                            </tr>
                            <tr>
                                <th>Payment Status:</th>
                                <td>${paymentStatus}</td>
                            </tr>
                            <tr>
                                <th>Total Amount:</th>
                                <td><strong>₹${finalAmount}</strong></td>
                            </tr>
                        </table>
                    </div>

                    <h3>Order Items:</h3>
                    <table class="order-details">
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>Quantity</th>
                                <th>Price</th>
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${productsHtml}
                        </tbody>
                    </table>

                    <h3>Shipping Address:</h3>
                    ${shippingHtml}

                    <div style="margin-top: 30px; padding: 15px; background: #e8f5e8; border-radius: 5px;">
                        <h3>What's Next?</h3>
                        <p>We're processing your order and will notify you when it ships. You can track your order status using your account.</p>
                    </div>

                    <p style="margin-top: 20px;">
                        If you have any questions about your order, please contact our support team.
                    </p>
                </div>
                <div class="footer">
                    <p>&copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.</p>
                    <p>This is an automated message, please do not reply to this email.</p>
                </div>
            </div>
        </body>
        </html>
      `
    };
  },

  // ADMIN ORDER NOTIFICATION TEMPLATE
  adminOrderNotification: (order, siteName = 'Your Store', isGuest = false) => {
    // Safe customer info extraction
    const customerInfo = isGuest 
      ? `Guest Customer: ${order.guestUser?.name || 'N/A'} (${order.guestUser?.email || 'No email'})`
      : `Registered User: ${order.user?.name || 'N/A'} (${order.user?.email || 'No email'})`;

    // Safe products handling
    const products = order.products || [];
    const productsHtml = products.map(item => `
      <tr>
        <td>${item.product?.name || 'Product'}</td>
        <td>${item.quantity || 1}</td>
        <td>₹${item.price || 0}</td>
        <td>₹${(item.quantity || 1) * (item.price || 0)}</td>
      </tr>
    `).join('');

    return {
      subject: `📦 New Order Received (${siteName}) - ${order.orderId || 'N/A'}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #ff6b35; color: white; padding: 20px; text-align: center; }
                .content { background: #f9f9f9; padding: 20px; }
                .order-details { width: 100%; border-collapse: collapse; margin: 20px 0; }
                .order-details th, .order-details td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
                .order-details th { background: #f2f2f2; }
                .alert { background: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 15px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>New Order Received!</h1>
                    <p>${siteName}</p>
                </div>
                <div class="content">
                    <div class="alert">
                        <strong>Action Required:</strong> Please process this order promptly.
                    </div>
                    
                    <h2>Order Summary</h2>
                    <table class="order-details">
                        <tr>
                            <th>Order ID:</th>
                            <td>${order.orderId || 'N/A'}</td>
                        </tr>
                        <tr>
                            <th>Customer:</th>
                            <td>${customerInfo}</td>
                        </tr>
                        <tr>
                            <th>Order Date:</th>
                            <td>${new Date(order.createdAt || Date.now()).toLocaleString()}</td>
                        </tr>
                        <tr>
                            <th>Order Status:</th>
                            <td>${order.orderStatus || 'confirmed'}</td>
                        </tr>
                        <tr>
                            <th>Payment Method:</th>
                            <td>${(order.paymentMethod || 'RAZORPAY').toUpperCase()}</td>
                        </tr>
                        <tr>
                            <th>Payment Status:</th>
                            <td>${order.paymentStatus || 'completed'}</td>
                        </tr>
                        <tr>
                            <th>Total Amount:</th>
                            <td><strong>₹${order.finalAmount || 0}</strong></td>
                        </tr>
                    </table>

                    <h3>Order Items:</h3>
                    <table class="order-details">
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>Quantity</th>
                                <th>Price</th>
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${productsHtml}
                        </tbody>
                    </table>

                    <h3>Shipping Address:</h3>
                    <p>
                        ${order.shippingAddress?.name || order.shippingAddress?.fullName || 'Customer'}<br>
                        ${order.shippingAddress?.address || 'Address not provided'}<br>
                        ${order.shippingAddress?.city || ''}, ${order.shippingAddress?.state || ''} - ${order.shippingAddress?.pincode || ''}<br>
                        ${order.shippingAddress?.phone ? `Phone: ${order.shippingAddress.phone}` : ''}
                    </p>

                    ${process.env.ADMIN_URL ? `
                    <p>
                        <a href="${process.env.ADMIN_URL}/orders/${order._id}" 
                           style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                           View Order in Admin Panel
                        </a>
                    </p>
                    ` : ''}
                </div>
            </div>
        </body>
        </html>
      `
    };
  },

  // ORDER STATUS UPDATE TEMPLATE
  orderStatusUpdate: (order, oldStatus, newStatus, siteName = 'Your Store') => {
    const userName = order.isGuestOrder ? 
      (order.guestUser?.name || 'Customer') : 
      (order.user?.name || 'Customer');
    
    return {
      subject: `📦 Order Status Updated - ${order.orderId || 'N/A'}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
            .status-update { background: #e3f2fd; padding: 15px; margin: 15px 0; border-radius: 5px; }
            .order-details { background: white; padding: 15px; margin: 10px 0; border-radius: 5px; border: 1px solid #ddd; }
            .footer { text-align: center; margin-top: 20px; color: #666; }
            .status-badge { 
              background: #4CAF50; 
              color: white; 
              padding: 5px 10px; 
              border-radius: 3px; 
              font-weight: bold; 
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Order Status Updated</h1>
              <p>Hello ${userName}!</p>
            </div>
            
            <div class="status-update">
              <h3>Status Update</h3>
              <p>Your order status has been updated:</p>
              <p><strong>From:</strong> ${oldStatus} → <strong>To:</strong> <span class="status-badge">${newStatus}</span></p>
            </div>

            <div class="order-details">
              <h3>Order Information</h3>
              <p><strong>Order ID:</strong> ${order.orderId || 'N/A'}</p>
              <p><strong>Order Date:</strong> ${new Date(order.createdAt || Date.now()).toLocaleDateString()}</p>
              <p><strong>Total Amount:</strong> ₹${order.finalAmount || 0}</p>
              <p><strong>Payment Status:</strong> ${order.paymentStatus || 'completed'}</p>
              ${order.deliveredAt ? `<p><strong>Delivered On:</strong> ${new Date(order.deliveredAt).toLocaleDateString()}</p>` : ''}
            </div>

            <div class="footer">
              <p>Thank you for shopping with ${siteName}!</p>
            </div>
          </div>
        </body>
        </html>
      `
    };
  },

  // USER REGISTRATION TEMPLATE
  userRegistration: (user, siteName = 'Your Store') => {
    return {
      subject: `Welcome to ${siteName}, ${user.name || 'Customer'}!`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #4CAF50; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                .button { display: inline-block; background: #4CAF50; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; margin: 15px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Welcome Aboard!</h1>
                </div>
                <div class="content">
                    <h2>Hello ${user.name || 'Customer'},</h2>
                    <p>We're excited to welcome you to ${siteName}! Your account has been successfully created.</p>
                    
                    <div style="text-align: center;">
                       <a href="${process.env.ALLOWED_ORIGINS?.split(',')[0] || 'http://localhost:3000'}/shop" class="button">
                            Start Shopping Now
                        </a>
                    </div>
                </div>
            </div>
        </body>
        </html>
      `
    };
  },

  // ORDER CANCELLATION NOTIFICATION TEMPLATE
  orderCancellationNotification: (order, cancelledBy = 'user', cancellationReason = 'Not specified', siteName = 'Your Store') => {
    // Safe customer info extraction
    const customerInfo = order.isGuestOrder 
      ? `Guest Customer: ${order.guestUser?.name || 'N/A'} (${order.guestUser?.email || 'No email'})`
      : `Registered User: ${order.user?.name || 'N/A'} (${order.user?.email || 'No email'})`;

    // Safe products handling
    const products = order.products || [];
    const productsHtml = products.map(item => `
      <tr>
        <td>${item.product?.name || 'Product'}</td>
        <td>${item.quantity || 1}</td>
        <td>₹${item.price || 0}</td>
        <td>₹${(item.quantity || 1) * (item.price || 0)}</td>
      </tr>
    `).join('');

    const cancelledByText = cancelledBy === 'admin' ? 'by Admin' : 'by Customer';
    const totalAmount = order.finalAmount || 0;

    return {
      subject: `🚨 ORDER CANCELLED (${siteName}) - ${order.orderId || 'N/A'}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 8px; }
                .content { background: #f9f9f9; padding: 20px; margin-top: 20px; border-radius: 8px; }
                .alert { background: #f8d7da; color: #721c24; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #dc3545; }
                .order-details { width: 100%; border-collapse: collapse; margin: 20px 0; }
                .order-details th, .order-details td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
                .order-details th { background: #f2f2f2; }
                .cancellation-info { background: white; padding: 15px; margin: 15px 0; border-radius: 5px; border: 1px solid #ddd; }
                .button { display: inline-block; background: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🚨 Order Cancelled</h1>
                    <p>Order ID: ${order.orderId || 'N/A'}</p>
                    <p>${siteName}</p>
                </div>
                
                <div class="content">
                    <div class="alert">
                        <strong>IMPORTANT:</strong> This order has been cancelled ${cancelledByText}
                    </div>

                    <div class="cancellation-info">
                        <h3>Cancellation Details</h3>
                        <table class="order-details">
                            <tr>
                                <th>Order ID:</th>
                                <td>${order.orderId || 'N/A'}</td>
                            </tr>
                            <tr>
                                <th>Cancelled By:</th>
                                <td>${cancelledByText}</td>
                            </tr>
                            <tr>
                                <th>Cancellation Reason:</th>
                                <td>${cancellationReason}</td>
                            </tr>
                            <tr>
                                <th>Cancelled At:</th>
                                <td>${new Date(order.cancelledAt || Date.now()).toLocaleString()}</td>
                            </tr>
                            <tr>
                                <th>Customer:</th>
                                <td>${customerInfo}</td>
                            </tr>
                            <tr>
                                <th>Total Amount:</th>
                                <td><strong>₹${totalAmount}</strong></td>
                            </tr>
                        </table>
                    </div>

                    <h3>Cancelled Items:</h3>
                    <table class="order-details">
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>Quantity</th>
                                <th>Price</th>
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${productsHtml}
                        </tbody>
                    </table>

                    <h3>Shipping Address:</h3>
                    <p>
                        ${order.shippingAddress?.name || order.shippingAddress?.fullName || 'Customer'}<br>
                        ${order.shippingAddress?.address || 'Address not provided'}<br>
                        ${order.shippingAddress?.city || ''}, ${order.shippingAddress?.state || ''} - ${order.shippingAddress?.pincode || ''}<br>
                        ${order.shippingAddress?.phone ? `Phone: ${order.shippingAddress.phone}` : ''}
                    </p>

                    <div style="margin-top: 20px; padding: 15px; background: #e9ecef; border-radius: 5px;">
                        <h4>📊 Stock Impact</h4>
                        <p>Product stock has been automatically restored for the cancelled items.</p>
                    </div>

                    ${process.env.ADMIN_URL ? `
                    <p style="text-align: center; margin-top: 20px;">
                        <a href="${process.env.ADMIN_URL}/orders/${order._id}" class="button">
                            View Order Details
                        </a>
                    </p>
                    ` : ''}
                </div>
            </div>
        </body>
        </html>
      `
    };
  },

  // PASSWORD RESET EMAIL TEMPLATE
  passwordResetEmail: (user, resetUrl, siteName = 'Your Store') => {
    return {
      subject: `🔐 Password Reset Request - ${siteName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #ff6b35; color: white; padding: 20px; text-align: center; border-radius: 8px; }
                .content { background: #f9f9f9; padding: 20px; margin-top: 20px; border-radius: 8px; }
                .button { display: inline-block; background: #ff6b35; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; margin: 15px 0; }
                .alert { background: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #ffc107; }
                .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Password Reset Request</h1>
                </div>
                
                <div class="content">
                    <h2>Hello ${user.name || 'Customer'},</h2>
                    <p>We received a request to reset your password for your ${siteName} account. Click the button below to create a new password:</p>
                    
                    <div style="text-align: center;">
                        <a href="${resetUrl}" class="button">
                            Reset Your Password
                        </a>
                    </div>

                    <div class="alert">
                        <strong>Important:</strong> This link will expire in 1 hour for security reasons.
                    </div>

                    <p>If the button doesn't work, copy and paste this link into your browser:</p>
                    <p style="word-break: break-all; background: white; padding: 10px; border-radius: 5px;">
                        ${resetUrl}
                    </p>

                    <p>If you didn't request a password reset, please ignore this email. Your password will remain unchanged.</p>
                </div>

                <div class="footer">
                    <p>&copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.</p>
                    <p>This is an automated message, please do not reply to this email.</p>
                </div>
            </div>
        </body>
        </html>
      `
    };
  },

  // PASSWORD RESET CONFIRMATION TEMPLATE
  passwordResetConfirmation: (user, siteName = 'Your Store') => {
    return {
      subject: `✅ Password Successfully Reset - ${siteName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 8px; }
                .content { background: #f9f9f9; padding: 20px; margin-top: 20px; border-radius: 8px; }
                .success-alert { background: #d4edda; color: #155724; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #28a745; }
                .button { display: inline-block; background: #4CAF50; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; margin: 15px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Password Reset Successful</h1>
                </div>
                
                <div class="content">
                    <h2>Hello ${user.name || 'Customer'},</h2>
                    
                    <div class="success-alert">
                        <strong>Success!</strong> Your password has been reset successfully.
                    </div>

                    <p>You can now login to your ${siteName} account using your new password.</p>

                    <div style="text-align: center;">
                        <a href="${process.env.ALLOWED_ORIGINS?.split(',')[0] || 'http://localhost:3000'}/login" class="button">
                            Login to Your Account
                        </a>
                    </div>

                    <p style="margin-top: 20px;">
                        <strong>Security Tip:</strong> If you didn't make this change, please contact our support team immediately.
                    </p>
                </div>
            </div>
        </body>
        </html>
      `
    };
  },

  // GUEST PASSWORD EMAIL TEMPLATE
  guestPasswordEmail: (email, password, order, siteName = 'Your Store') => {
    const orderId = order.orderId || 'N/A';
    const userName = order.guestUser?.name || 
                     order.shippingAddress?.fullName || 
                     order.shippingAddress?.name || 
                     'Customer';
    
    return {
      subject: `🔐 Your Account Password - Order #${orderId}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 8px; }
            .content { background: #f9f9f9; padding: 20px; margin-top: 20px; border-radius: 8px; }
            .password-box { 
              background: white; 
              padding: 15px; 
              margin: 15px 0; 
              border: 2px solid #4CAF50; 
              border-radius: 5px; 
              font-size: 20px; 
              font-weight: bold; 
              text-align: center; 
              letter-spacing: 2px;
            }
            .alert { background: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #ffc107; }
            .button { display: inline-block; background: #4CAF50; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; margin: 15px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Your Account is Ready!</h1>
              <p>Order #${orderId}</p>
              <p>${siteName}</p>
            </div>
            
            <div class="content">
              <h2>Hello ${userName},</h2>
              <p>Thank you for your order at ${siteName}! We've created a user account for you so you can track your order and make future purchases more easily.</p>
              
              <div class="alert">
                <strong>Important:</strong> Your login credentials
              </div>
              
              <h3>Your Login Details:</h3>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Temporary Password:</strong></p>
              <div class="password-box">${password}</div>
              
              <p>Please change your password after your first login for security.</p>
              
              <div style="text-align: center;">
               <a href="${process.env.ALLOWED_ORIGINS?.split(',')[0] || 'http://localhost:3000'}/login" class="button">
                  Login to Your Account
                </a>
              </div>
              
              <h3>Order Information:</h3>
              <p><strong>Order ID:</strong> ${orderId}</p>
              <p><strong>Order Date:</strong> ${new Date(order.createdAt || Date.now()).toLocaleDateString()}</p>
              <p><strong>Total Amount:</strong> ₹${order.finalAmount || 0}</p>
              
              <div class="alert">
                <strong>Security Note:</strong> 
                <ul>
                  <li>Keep your password confidential</li>
                  <li>Change your password after first login</li>
                  <li>Never share your password with anyone</li>
                </ul>
              </div>
              
              <p>If you have any questions, please contact our support team.</p>
            </div>
            
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.</p>
              <p>This is an automated message, please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };
  }
};

// Send email function with enhanced error handling
export const sendEmail = async (to, subject, html) => {
  try {
    console.log('📧 Attempting to send email...');
    console.log('To:', to);
    console.log('Subject:', subject);
    
    // Validate recipient
    if (!to) {
      throw new Error('No recipient email provided (to field is empty)');
    }

    if (typeof to !== 'string' || !to.includes('@')) {
      throw new Error(`Invalid email address: ${to}`);
    }

    // Validate email configuration
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASS) {
      throw new Error('Email configuration missing: ADMIN_EMAIL or ADMIN_PASS not set in environment variables');
    }

    const transporter = createTransporter();
    const siteName = await getSiteName();
    
    const mailOptions = {
      from: `"${siteName}" <${process.env.ADMIN_EMAIL}>`,
      to: to,
      subject: subject,
      html: html
    };

    console.log('📤 Sending email with options:', {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject
    });

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('❌ Email sending failed:', error.message);
    return { success: false, error: error.message };
  }
};

export const sendRegistrationEmail = async (user) => {
  try {
    console.log('🚀 Sending registration email to:', user.email);

    // Validate user data
    if (!user || !user.email) {
      throw new Error('Invalid user data for registration email');
    }

    const siteName = await getSiteName();

    // Get email template
    const emailTemplate = emailTemplates.userRegistration(user, siteName);
    
    // Send email
    const result = await sendEmail(user.email, emailTemplate.subject, emailTemplate.html);
    
    console.log('✅ Registration email sent successfully to:', user.email);
    return result;
  } catch (error) {
    console.error('❌ Send registration email error:', error.message);
    throw error;
  }
};

// Send password reset email
export const sendPasswordResetEmail = async (user, resetUrl) => {
  try {
    console.log('🔐 Sending password reset email to:', user.email);

    if (!user || !user.email) {
      throw new Error('Invalid user data for password reset email');
    }

    const siteName = await getSiteName();
    const emailTemplate = emailTemplates.passwordResetEmail(user, resetUrl, siteName);
    const result = await sendEmail(user.email, emailTemplate.subject, emailTemplate.html);
    
    console.log('✅ Password reset email sent successfully to:', user.email);
    return result;
  } catch (error) {
    console.error('❌ Send password reset email error:', error.message);
    throw error;
  }
};

// Send password reset confirmation email
export const sendPasswordResetConfirmation = async (user) => {
  try {
    console.log('✅ Sending password reset confirmation to:', user.email);

    if (!user || !user.email) {
      throw new Error('Invalid user data for password reset confirmation');
    }

    const siteName = await getSiteName();
    const emailTemplate = emailTemplates.passwordResetConfirmation(user, siteName);
    const result = await sendEmail(user.email, emailTemplate.subject, emailTemplate.html);
    
    console.log('✅ Password reset confirmation sent successfully to:', user.email);
    return result;
  } catch (error) {
    console.error('❌ Send password reset confirmation error:', error.message);
    throw error;
  }
};

// Send order confirmation to user with comprehensive error handling for user
export const sendOrderConfirmation = async (orderId) => {
  try {
    console.log('🚀 sendOrderConfirmation called for order:', orderId);

    // Validate emailTemplates object first
    if (!emailTemplates || typeof emailTemplates.adminOrderNotification !== 'function') {
      console.error('❌ Email templates not properly initialized');
      throw new Error('Email templates configuration error');
    }

    // Get the order with proper population
    const order = await Order.findById(orderId)
      .populate('user', 'name email')
      .populate('guestUser', 'name email phone')
      .populate('products.product', 'name image price')
      .lean();

    if (!order) {
      throw new Error(`Order not found with ID: ${orderId}`);
    }

    console.log('📦 Order structure for debugging:', JSON.stringify({
      orderId: order.orderId,
      isGuestOrder: order.isGuestOrder,
      user: order.user,
      guestUser: order.guestUser,
      shippingAddress: order.shippingAddress,
      products: order.products?.map(p => ({
        product: p.product,
        quantity: p.quantity,
        price: p.price
      }))
    }, null, 2));

    // Fetch dynamic site name
    const siteName = await getSiteName();

    let userEmail;
    let userName;
    let isGuest = order.isGuestOrder;

    // Enhanced recipient determination
    if (order.isGuestOrder) {
      if (order.guestUser && order.guestUser.email) {
        userEmail = order.guestUser.email;
        userName = order.guestUser.name || 'Customer';
        console.log('✅ Using guest user email from guestUser document');
      } else if (order.shippingAddress && order.shippingAddress.email) {
        userEmail = order.shippingAddress.email;
        userName = order.shippingAddress.fullName || order.shippingAddress.name || 'Customer';
        console.log('⚠️ Using email from shipping address');
      } else if (order.user && order.user.email) {
        userEmail = order.user.email;
        userName = order.user.name || 'Customer';
        console.log('ℹ️ Using email from user reference');
      } else {
        throw new Error('No email address available for guest order');
      }
    } else {
      if (order.user && order.user.email) {
        userEmail = order.user.email;
        userName = order.user.name || 'Customer';
        console.log('✅ Using registered user email');
      } else {
        throw new Error('No email address available for registered user order');
      }
    }

    console.log('📧 Final email recipient:', { userEmail, userName, isGuest });

    // Validate email
    if (!userEmail || typeof userEmail !== 'string' || !userEmail.includes('@')) {
      throw new Error(`Invalid email address: ${userEmail}`);
    }

    // Send email to user
    const userTemplate = emailTemplates.userOrderConfirmation(order, siteName, isGuest);
    const userResult = await sendEmail(userEmail, userTemplate.subject, userTemplate.html);
    
    if (userResult.success) {
      console.log('✅ User email sent successfully to:', userEmail);
    } else {
      console.error('❌ User email failed:', userResult.error);
    }

    // Send admin notification
    let adminResult = null;
    if (process.env.ADMIN_EMAIL) {
      const adminTemplate = emailTemplates.adminOrderNotification(order, siteName, isGuest);
      adminResult = await sendEmail(process.env.ADMIN_EMAIL, adminTemplate.subject, adminTemplate.html);
      
      if (adminResult.success) {
        console.log('✅ Admin notification sent successfully');
      } else {
        console.error('❌ Admin email failed:', adminResult.error);
      }
    } else {
      console.warn('⚠️ ADMIN_EMAIL not configured, skipping admin notification');
    }

    return {
      success: true,
      userEmail: userResult,
      adminEmail: adminResult,
      userEmailAddress: userEmail
    };
  } catch (error) {
    console.error('❌ Send order confirmation error:', error.message);
    console.error('Error stack:', error.stack);
    
    return {
      success: false,
      error: error.message,
      userEmail: null,
      adminEmail: null
    };
  }
};

// Send order status update
export const sendOrderStatusUpdate = async (req, reply) => {
  try {
    const { orderStatus } = req.body;
    const orderId = req.params.id || req.params.orderId;

    // Find order (try by MongoDB _id first, then by orderId)
    let order = await Order.findById(orderId);
    if (!order) {
      order = await Order.findOne({ orderId: orderId });
    }

    if (!order) {
      throw new NotFoundError('Order', { orderId });
    }

    const oldStatus = order.orderStatus;
    order.orderStatus = orderStatus;

    if (orderStatus === 'delivered') {
      order.deliveredAt = new Date();
      if (order.paymentMethod === 'cod') {
        order.paymentStatus = 'completed';
      }
    }

    await order.save();

    // Send email (only once)
    try {
      const siteName = await getSiteName();
      // This should call the email template, not recursively call this function
      const emailTemplate = emailTemplates.orderStatusUpdate(order, oldStatus, orderStatus, siteName);
      const userEmail = order.isGuestOrder ? order.guestUser?.email : order.user?.email;
      
      if (userEmail) {
        await sendEmail(userEmail, emailTemplate.subject, emailTemplate.html);
      }
    } catch (emailError) {
      console.error('Order status update email failed:', emailError);
    }

    const updatedOrder = await Order.findById(order._id)
      .populate('user', 'name email')
      .populate('guestUser', 'name email')
      .populate('products.product', 'name image');

    reply.send({
      success: true,
      order: updatedOrder,
    });
  } catch (error) {
    console.error('Update order status error:', error);
    if (error instanceof NotFoundError) throw error;
    throw new DatabaseError('Failed to update order status', {
      error: error.message
    });
  }
};

// Send bulk admin notification (for multiple new orders)
export const sendBulkAdminNotification = async (orders) => {
  try {
    const siteName = await getSiteName();
    const subject = `📦 ${orders.length} New Orders Received (${siteName})`;
    
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #ff6b35; color: white; padding: 20px; text-align: center; }
          .order-item { background: #f9f9f9; padding: 15px; margin: 10px 0; border-left: 4px solid #ff6b35; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${orders.length} New Orders Received</h1>
            <p>${siteName}</p>
          </div>
    `;

    orders.forEach(order => {
      const customerInfo = order.isGuestOrder 
        ? `Guest: ${order.guestUser?.name || 'N/A'}`
        : `User: ${order.user?.name || 'N/A'}`;
      
      html += `
        <div class="order-item">
          <h3>Order: ${order.orderId}</h3>
          <p><strong>Customer:</strong> ${customerInfo}</p>
          <p><strong>Amount:</strong> ₹${order.finalAmount}</p>
          <p><strong>Date:</strong> ${new Date(order.createdAt).toLocaleString()}</p>
          <a href="${process.env.ADMIN_URL}/orders/${order._id}">View Order</a>
        </div>
      `;
    });

    html += `
        </div>
      </body>
      </html>
    `;

    const result = await sendEmail(process.env.ADMIN_EMAIL, subject, html);
    return result;
  } catch (error) {
    console.error('Send bulk admin notification error:', error);
    throw error;
  }
};

// Send order cancellation notification to admin
export const sendOrderCancellationNotification = async (order, cancelledBy = 'user', cancellationReason = 'Not specified') => {
  try {
    console.log('🚨 Sending order cancellation notification for order:', order.orderId);
    
    // Validate admin email configuration
    if (!process.env.ADMIN_EMAIL) {
      console.warn('⚠️ ADMIN_EMAIL not configured, skipping cancellation notification');
      return { success: false, error: 'ADMIN_EMAIL not configured' };
    }

    // Get the order with proper population if needed
    let populatedOrder = order;
    if (!order.products || !order.products[0]?.product?.name) {
      populatedOrder = await Order.findById(order._id)
        .populate('user', 'name email')
        .populate('guestUser', 'name email phone')
        .populate('products.product', 'name price')
        .lean();
    }

    const siteName = await getSiteName();

    // Get email template
    const emailTemplate = emailTemplates.orderCancellationNotification(
      populatedOrder, 
      cancelledBy, 
      cancellationReason,
      siteName
    );

    // Send email to admin
    const result = await sendEmail(process.env.ADMIN_EMAIL, emailTemplate.subject, emailTemplate.html);
    
    if (result.success) {
      console.log('✅ Order cancellation notification sent successfully to admin');
    } else {
      console.error('❌ Order cancellation notification failed:', result.error);
    }

    return result;

  } catch (error) {
    console.error('❌ Send order cancellation notification error:', error.message);
    return { success: false, error: error.message };
  }
};

// Send guest password email
export const sendGuestPasswordEmail = async (email, password, order) => {
  try {
    console.log('🔐 Sending guest password email to:', email);
    
    if (!email || !email.includes('@')) {
      throw new Error(`Invalid email address: ${email}`);
    }

    const siteName = await getSiteName();
    
    // Get email template
    const emailTemplate = emailTemplates.guestPasswordEmail(email, password, order, siteName);
    
    // Send email
    const result = await sendEmail(email, emailTemplate.subject, emailTemplate.html);
    
    console.log('✅ Guest password email sent successfully to:', email);
    return result;
  } catch (error) {
    console.error('❌ Send guest password email error:', error.message);
    throw error;
  }
};

// Test email endpoint
export const testEmail = async (req, reply) => {
  try {
    const testEmail = req.body.email || "test@example.com";
    const siteName = await getSiteName();
    const testSubject = `Test Email from ${siteName}`;
    const testHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Test Email</h1>
            <p>${siteName}</p>
          </div>
          <div class="content">
            <h2>Email Configuration Test</h2>
            <p>If you receive this, your email configuration is working correctly.</p>
            <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>From:</strong> ${process.env.ADMIN_EMAIL}</p>
            <p><strong>To:</strong> ${testEmail}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    console.log('🧪 Testing email configuration...');
    console.log('Admin Email:', process.env.ADMIN_EMAIL);
    
    const result = await sendEmail(testEmail, testSubject, testHtml);
    
    reply.send({
      success: true,
      message: 'Test email sent',
      result: result
    });
  } catch (error) {
    console.error('Test email failed:', error);
    throw new DatabaseError('Test email failed', {
      error: error.message
    });
  }
};

export default {
  sendEmail,
  sendOrderConfirmation,
  sendOrderStatusUpdate,
  sendBulkAdminNotification,
  sendOrderCancellationNotification,
  sendPasswordResetEmail,
  sendPasswordResetConfirmation,
  sendGuestPasswordEmail,
  testEmail
};