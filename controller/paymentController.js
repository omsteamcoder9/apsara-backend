// controllers/paymentController.js
import Razorpay from 'razorpay';
import crypto from 'crypto';
import dotenv from 'dotenv';
import Order from '../models/orderModel.js';
import Product from '../models/productModel.js';
import User from '../models/userModel.js';
import Setting from '../models/Setting.js';
import bcrypt from 'bcryptjs';
import { emailTemplates, sendEmail, sendOrderConfirmation, sendOrderStatusUpdate, sendGuestPasswordEmail } from './emailController.js';
import Shipping from '../models/shippingModel.js';
import shippingService from '../services/shippingService.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  BusinessLogicError
} from '../utils/errors.js';

dotenv.config();

// Helper function to get price for a specific size
const getSizePrice = (sizes, selectedSize, defaultPrice) => {
  if (!sizes || sizes.length === 0) return defaultPrice;
  
  const sizeData = sizes.find(s => s.size === selectedSize);
  if (sizeData && sizeData.price !== null && sizeData.price !== undefined) {
    return sizeData.price;
  }
  return defaultPrice;
};

// Get Razorpay instance dynamically using settings
const getRazorpayInstance = async () => {
  const settings = await Setting.getSettings();
  
  if (!settings.razorpayKeyId) {
    throw new DatabaseError('Razorpay key ID not configured in settings');
  }
  
  if (!settings.razorpayKeySecret) {
    throw new DatabaseError('Razorpay key secret not configured in settings');
  }
  
  return new Razorpay({
    key_id: settings.razorpayKeyId,
    key_secret: settings.razorpayKeySecret,
  });
};

// Utility: Generate guest password from email
const generateGuestPassword = (email) => {
  try {
    if (!email || !email.includes('@')) {
      throw new Error('Invalid email address for password generation');
    }
    
    const usernamePart = email.split('@')[0];
    const cleanUsername = usernamePart.replace(/[^a-zA-Z0-9]/g, '');
    
    let namePart;
    if (cleanUsername.length >= 5) {
      namePart = cleanUsername.substring(0, 5).toLowerCase();
    } else {
      namePart = cleanUsername.toLowerCase();
      while (namePart.length < 5) {
        namePart += 'x';
      }
    }
    
    const randomNum = Math.floor(Math.random() * 10) + 1;
    const password = namePart + randomNum;
    
    return password.substring(0, 6);
    
  } catch (error) {
    console.error('Password generation error:', error);
    return 'guest' + (Math.floor(Math.random() * 9) + 1);
  }
};

/* -------------------------------------------------------------------------- */
/* 🧩 1. Create Razorpay order                                                */
/* -------------------------------------------------------------------------- */
export const createRazorpayOrder = async (req, reply) => {
  const { orderId } = req.body;

  if (!orderId) {
    throw new ValidationError('Order ID is required', { field: 'orderId' });
  }

  // Find order (check both guest & registered)
  const order = await Order.findOne({ orderId });
  if (!order) {
    throw new NotFoundError('Order', { orderId });
  }

  if (order.paymentStatus === 'completed') {
    throw new ConflictError('Order already paid', { orderId, paymentStatus: order.paymentStatus });
  }

  // Get Razorpay instance with settings
  const razorpay = await getRazorpayInstance();
  
  // Check if Razorpay is enabled in settings
  const settings = await Setting.findOne().lean();
  if (!settings.razorpayEnabled) {
    throw new BusinessLogicError('Razorpay payments are currently disabled', {
      paymentMethod: 'razorpay'
    });
  }

  // Create Razorpay order
  const razorpayOrder = await razorpay.orders.create({
    amount: Math.round(order.finalAmount * 100), 
    currency: 'INR',
    receipt: order.orderId,
    notes: {
      orderId: order.orderId,
      type: order.isGuestOrder ? 'guest' : 'user',
      ...(order.isGuestOrder
        ? { guestEmail: order.guestUser?.email }
        : { userId: order.user?.toString() }),
    },
  });

  // Save Razorpay details
  order.razorpayOrderId = razorpayOrder.id;
  order.paymentMethod = 'razorpay';
  await order.save();

  reply.send({
    success: true,
    order: razorpayOrder,
    key: settings.razorpayKeyId,
  });
};

/* -------------------------------------------------------------------------- */
/* 🧩 2. Verify Razorpay payment + update stock                              */
/* -------------------------------------------------------------------------- */
export const verifyPayment = async (req, reply) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw new ValidationError('Missing payment verification data', {
      fields: {
        razorpay_order_id: !!razorpay_order_id,
        razorpay_payment_id: !!razorpay_payment_id,
        razorpay_signature: !!razorpay_signature
      }
    });
  }

  const razorpay = await getRazorpayInstance();
  const settings = await Setting.getSettings();
  const generatedSignature = crypto
    .createHmac('sha256', settings.razorpayKeySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (generatedSignature !== razorpay_signature) {
    throw new ValidationError('Payment verification failed', {
      message: 'Signature mismatch'
    });
  }

  // Find order by Razorpay order ID
  const order = await Order.findOne({ razorpayOrderId: razorpay_order_id })
    .populate('user', 'name email')
    .populate('guestUser', 'name email phone')
    .populate('products.product', 'name price stock');
  
  if (!order) {
    throw new NotFoundError('Order', { razorpayOrderId: razorpay_order_id });
  }

  // Update stock only if not already deducted and payment is not completed
  if (order.paymentStatus !== 'completed') {
    for (const item of order.products) {
      if (item.product && item.product.stock >= item.quantity) {
        await Product.findByIdAndUpdate(item.product._id, {
          $inc: { stock: -item.quantity },
        });
        console.log(`Updated stock for ${item.product.name}: -${item.quantity}`);
      }
    }
  }

  // Update payment details
  order.paymentId = razorpay_payment_id;
  order.paymentStatus = 'completed';
  order.orderStatus = 'confirmed';
  order.paidAt = new Date();
  await order.save();

  // Handle guest user account creation
  if (order.isGuestOrder) {
    try {
      console.log('🎯 Processing guest user account creation');
      
      let guestEmail = '';
      
      if (order.guestUser && order.guestUser.email) {
        guestEmail = order.guestUser.email;
        console.log('📧 Using email from guestUser:', guestEmail);
      } else if (order.shippingAddress && order.shippingAddress.email) {
        guestEmail = order.shippingAddress.email;
        console.log('📧 Using email from shipping address:', guestEmail);
      } else if (order.user) {
        const userDoc = await User.findById(order.user);
        if (userDoc && userDoc.email) {
          guestEmail = userDoc.email;
          console.log('📧 Using email from user document:', guestEmail);
        }
      }
      
      if (guestEmail && guestEmail.includes('@')) {
        console.log(`📧 Found guest email: ${guestEmail}`);
        
        const generatedPassword = generateGuestPassword(guestEmail);
        console.log(`🔑 Generated password: ${generatedPassword}`);
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(generatedPassword, salt);
        
        let existingUser = await User.findOne({ email: guestEmail.toLowerCase() });
        
        if (existingUser) {
          console.log(`ℹ️ User already exists with email: ${guestEmail}`);
          existingUser.isGuest = false;
          existingUser.password = hashedPassword;
          existingUser.role = 'user';
          await existingUser.save();
          console.log(`✅ Updated existing user with new password`);
        } else {
          const newUser = await User.create({
            name: order.guestUser?.name || 
                  order.shippingAddress?.fullName || 
                  order.shippingAddress?.name || 
                  'Guest Customer',
            email: guestEmail.toLowerCase(),
            phone: order.guestUser?.phone || order.shippingAddress?.phone || '',
            password: hashedPassword,
            isGuest: false,
            role: 'user',
            accountCreatedFromOrder: order.orderId
          });
          console.log(`✅ Created new user account for guest: ${newUser._id}`);
        }
        
        try {
          console.log(`📧 Attempting to send password email to guest: ${guestEmail}`);
          const emailResult = await sendGuestPasswordEmail(guestEmail, generatedPassword, order);
          
          if (emailResult.success) {
            console.log(`✅ Guest password email sent successfully to: ${guestEmail}`);
          } else {
            console.error(`❌ Guest password email failed:`, emailResult.error);
          }
        } catch (emailError) {
          console.error('❌ Guest password email failed with error:', emailError.message);
        }
      } else {
        console.warn('⚠️ No valid guest email found, skipping account creation');
      }
    } catch (guestError) {
      console.error('❌ Guest account creation failed:', guestError.message);
    }
  }

  // Auto-create shipment on ShipRocket after payment verification
  let shipmentResult = null;
  try {
    console.log('🚀 Attempting to auto-create shipment for order:', order.orderId);
    
    const shippingService = await import('../services/shippingService.js');
    const shipment = await shippingService.default.createShipment(order, {});
    
    if (shipment && shipment.shipment_id) {
      console.log('📦 ShipRocket shipment created successfully:', shipment.shipment_id);
      
      const Shipping = await import('../models/shippingModel.js');
      
      const shippingData = {
        orderId: order.orderId,
        order: order._id,
        shipmentId: shipment.shipment_id.toString(),
        userType: order.isGuestOrder ? 'guest' : 'user',
        userId: order.isGuestOrder ? order.guestUser?._id : order.user?._id,
        pickupLocation: {},
        shippingStatus: 'pending',
        awbNumber: shipment.awb_code || null,
        courierName: shipment.courier_name || null,
        courierCompanyId: shipment.courier_company_id || null,
        shippingCharges: order.shippingAmount || 0,
        shipRocketResponse: shipment,
        labelUrl: shipment.label_url || null,
        manifestUrl: shipment.manifest_url || null
      };

      if (!order.isGuestOrder && order.user?._id) {
        shippingData.user = order.user._id;
      }

      const shippingDoc = await Shipping.default.create(shippingData);

      order.shipmentId = shipment.shipment_id.toString();
      order.shippingStatus = shipment.status || 'pending';
      order.awbNumber = shipment.awb_code || null;
      order.courierName = shipment.courier_name || null;
      await order.save();

      shipmentResult = {
        shipmentId: shipment.shipment_id,
        awbNumber: shipment.awb_code,
        courierName: shipment.courier_name,
        status: shipment.status,
        labelUrl: shipment.label_url,
        manifestUrl: shipment.manifest_url
      };
      
      console.log('✅ Shipment created and order updated successfully');
    }
  } catch (shipmentError) {
    console.error('❌ Auto-shipment creation failed:', shipmentError.message);
    shipmentResult = {
      error: shipmentError.message,
      note: 'Shipment will need to be created manually'
    };
  }

  // Send regular order confirmation email
  try {
    const emailResult = await sendOrderConfirmation(order._id);
    
    if (!emailResult.userEmail || emailResult.userEmail.success === false) {
      console.warn('⚠️ Order confirmation email failed, but order was created successfully');
      console.log('Order details:', {
        orderId: order.orderId,
        amount: order.finalAmount,
        paymentStatus: order.paymentStatus
      });
    } else {
      console.log('✅ Order confirmation email sent successfully');
    }
  } catch (emailError) {
    console.error('❌ Email sending failed, but order was created:', emailError.message);
  }

  // Populate order for response
  let populatedOrder;
  if (order.isGuestOrder) {
    populatedOrder = await Order.findById(order._id)
      .populate('guestUser', 'name email phone')
      .populate('products.product', 'name image price');
  } else {
    populatedOrder = await Order.findById(order._id)
      .populate('user', 'name email')
      .populate('products.product', 'name image price');
  }

  const response = {
    success: true,
    order: populatedOrder,
    message: 'Payment verified and order confirmed successfully',
  };

  if (shipmentResult) {
    if (shipmentResult.error) {
      response.shipment = {
        success: false,
        message: 'Auto-shipment creation failed',
        error: shipmentResult.error,
        note: shipmentResult.note
      };
    } else {
      response.shipment = {
        success: true,
        message: 'Shipment created automatically',
        data: shipmentResult
      };
    }
  }

  reply.send(response);
};

/* -------------------------------------------------------------------------- */
/* 🧩 3. Payment failed                                                       */
/* -------------------------------------------------------------------------- */
export const paymentFailed = async (req, reply) => {
  const { razorpay_order_id } = req.body;
  const order = await Order.findOne({ razorpayOrderId: razorpay_order_id });

  if (order) {
    order.paymentStatus = 'failed';
    order.orderStatus = 'cancelled';
    await order.save();
  }

  reply.send({
    success: false,
    message: 'Payment failed. Please try again.',
  });
};

/* -------------------------------------------------------------------------- */
/* 🧩 4. Get payment details                                                  */
/* -------------------------------------------------------------------------- */
export const getPaymentDetails = async (req, reply) => {
  const razorpay = await getRazorpayInstance();
  const payment = await razorpay.payments.fetch(req.params.paymentId);
  reply.send({ success: true, payment });
};

/* -------------------------------------------------------------------------- */
/* 🧩 5. Refund payment                                                       */
/* -------------------------------------------------------------------------- */
export const refundPayment = async (req, reply) => {
  const { paymentId } = req.params;
  const { refund_amount } = req.body;

  console.log('🔁 Refund request:', { paymentId, refund_amount });

  if (!paymentId) {
    throw new ValidationError('Payment ID missing', { field: 'paymentId' });
  }

  if (!refund_amount || refund_amount <= 0) {
    throw new ValidationError('Invalid refund amount', {
      field: 'refund_amount',
      minValue: 1,
      received: refund_amount
    });
  }

  const razorpay = await getRazorpayInstance();
  
  const refund = await razorpay.payments.refund(paymentId, {
    amount: Math.round(refund_amount * 100),
  });

  // Find and update order
  const order = await Order.findOne({ paymentId })
    .populate('user', 'name email')
    .populate('guestUser', 'name email phone');

  if (order) {
    order.paymentStatus = 'refunded';
    order.orderStatus = 'cancelled';
    order.refundId = refund.id;
    order.refundAmount = refund_amount;
    order.refundedAt = new Date();
    await order.save();

    // ✅ ==========================================
    // ✅ SEND REFUND EMAIL TO CUSTOMER
    // ✅ ==========================================
    try {
      // Get customer email based on order type
      let customerEmail;
      let customerName;

      if (order.isGuestOrder) {
        customerEmail = order.guestUser?.email || order.shippingAddress?.email;
        customerName = order.guestUser?.name || order.shippingAddress?.fullName || 'Customer';
      } else {
        customerEmail = order.user?.email;
        customerName = order.user?.name || 'Customer';
      }

      if (customerEmail) {
        console.log(`📧 Sending refund email to: ${customerEmail}`);
        
        // Create refund email template
        const emailTemplate = createRefundEmailTemplate(order, refund_amount, refund.id);
        
        // Send email
        const emailResult = await sendEmail(
          customerEmail,
          emailTemplate.subject,
          emailTemplate.html
        );
        
        if (emailResult.success) {
          console.log('✅ Refund email sent successfully to:', customerEmail);
        } else {
          console.error('❌ Refund email failed:', emailResult.error);
        }
      } else {
        console.warn('⚠️ No customer email found for refund notification');
      }
    } catch (emailError) {
      console.error('❌ Refund email error:', emailError.message);
      // Don't fail the refund if email fails
    }

    // ✅ ==========================================
    // ✅ SEND ADMIN NOTIFICATION (Optional)
    // ✅ ==========================================
    try {
      if (process.env.ADMIN_EMAIL) {
        const adminTemplate = createAdminRefundTemplate(order, refund_amount, refund.id);
        await sendEmail(
          process.env.ADMIN_EMAIL,
          adminTemplate.subject,
          adminTemplate.html
        );
        console.log('✅ Admin refund notification sent');
      }
    } catch (adminEmailError) {
      console.error('❌ Admin refund email failed:', adminEmailError.message);
    }
  }

  return reply.status(200).send({
    success: true,
    refund,
    order: order ? {
      orderId: order.orderId,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      refundId: order.refundId,
      refundAmount: order.refundAmount
    } : null
  });
};

// ✅ ==========================================
// ✅ HELPER: Create Refund Email Template
// ✅ ==========================================
const createRefundEmailTemplate = (order, refundAmount, refundId) => {
  const customerName = order.isGuestOrder 
    ? (order.guestUser?.name || order.shippingAddress?.fullName || 'Customer')
    : (order.user?.name || 'Customer');

  const orderId = order.orderId || 'N/A';
  const finalAmount = order.finalAmount || 0;

  return {
    subject: `💰 Refund Processed - Order #${orderId}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #28a745; color: white; padding: 20px; text-align: center; border-radius: 8px; }
          .content { background: #f9f9f9; padding: 20px; margin-top: 20px; border-radius: 8px; }
          .refund-details { background: white; padding: 15px; margin: 15px 0; border-radius: 5px; border: 1px solid #ddd; }
          .alert { background: #d4edda; color: #155724; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #28a745; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>💰 Refund Processed</h1>
          </div>
          
          <div class="content">
            <h2>Hello ${customerName},</h2>
            
            <div class="alert">
              <strong>Refund Successful!</strong> Your refund has been processed successfully.
            </div>

            <div class="refund-details">
              <h3>Refund Details</h3>
              <table style="width: 100%;">
                <tr>
                  <td><strong>Order ID:</strong></td>
                  <td>${orderId}</td>
                </tr>
                <tr>
                  <td><strong>Refund Amount:</strong></td>
                  <td><strong>₹${refundAmount.toFixed(2)}</strong></td>
                </tr>
                <tr>
                  <td><strong>Original Order Amount:</strong></td>
                  <td>₹${finalAmount.toFixed(2)}</td>
                </tr>
                <tr>
                  <td><strong>Refund ID:</strong></td>
                  <td>${refundId}</td>
                </tr>
                <tr>
                  <td><strong>Refund Date:</strong></td>
                  <td>${new Date().toLocaleString()}</td>
                </tr>
              </table>
            </div>

            <div style="margin-top: 20px; padding: 15px; background: #e9ecef; border-radius: 5px;">
              <h4>📌 Important Information</h4>
              <ul>
                <li>The refund will reflect in your account within 3-7 business days</li>
                <li>Depending on your bank, it may take additional time to appear</li>
                <li>If you have any questions, please contact our support team</li>
              </ul>
            </div>

            <p style="margin-top: 20px;">
              We're sorry that your order didn't work out. We hope to serve you better in the future!
            </p>
          </div>

          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Your Store. All rights reserved.</p>
            <p>This is an automated message, please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };
};

// ✅ ==========================================
// ✅ HELPER: Admin Refund Notification Template
// ✅ ==========================================
const createAdminRefundTemplate = (order, refundAmount, refundId) => {
  const customerInfo = order.isGuestOrder 
    ? `Guest: ${order.guestUser?.name || 'N/A'} (${order.guestUser?.email || 'No email'})`
    : `User: ${order.user?.name || 'N/A'} (${order.user?.email || 'No email'})`;

  return {
    subject: `💰 REFUND PROCESSED - Order #${order.orderId || 'N/A'}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 8px; }
          .content { background: #f9f9f9; padding: 20px; margin-top: 20px; border-radius: 8px; }
          .refund-details { background: white; padding: 15px; margin: 15px 0; border-radius: 5px; border: 1px solid #ddd; }
          .alert { background: #f8d7da; color: #721c24; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #dc3545; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>💰 Refund Processed</h1>
            <p>Order #${order.orderId || 'N/A'}</p>
          </div>
          
          <div class="content">
            <div class="alert">
              <strong>ACTION:</strong> Refund has been processed for this order.
            </div>

            <div class="refund-details">
              <h3>Refund Details</h3>
              <table style="width: 100%;">
                <tr>
                  <td><strong>Order ID:</strong></td>
                  <td>${order.orderId || 'N/A'}</td>
                </tr>
                <tr>
                  <td><strong>Customer:</strong></td>
                  <td>${customerInfo}</td>
                </tr>
                <tr>
                  <td><strong>Refund Amount:</strong></td>
                  <td><strong>₹${refundAmount.toFixed(2)}</strong></td>
                </tr>
                <tr>
                  <td><strong>Original Amount:</strong></td>
                  <td>₹${(order.finalAmount || 0).toFixed(2)}</td>
                </tr>
                <tr>
                  <td><strong>Refund ID:</strong></td>
                  <td>${refundId}</td>
                </tr>
                <tr>
                  <td><strong>Refund Date:</strong></td>
                  <td>${new Date().toLocaleString()}</td>
                </tr>
                <tr>
                  <td><strong>Payment Method:</strong></td>
                  <td>${order.paymentMethod || 'Razorpay'}</td>
                </tr>
              </table>
            </div>

            <div style="margin-top: 20px; padding: 15px; background: #e9ecef; border-radius: 5px;">
              <h4>📊 Order Summary</h4>
              <table style="width: 100%;">
                <tr>
                  <td><strong>Products:</strong></td>
                  <td>${order.products?.length || 0} items</td>
                </tr>
                <tr>
                  <td><strong>Order Date:</strong></td>
                  <td>${new Date(order.createdAt || Date.now()).toLocaleString()}</td>
                </tr>
                <tr>
                  <td><strong>Payment Status:</strong></td>
                  <td>${order.paymentStatus || 'refunded'}</td>
                </tr>
                <tr>
                  <td><strong>Order Status:</strong></td>
                  <td>${order.orderStatus || 'cancelled'}</td>
                </tr>
              </table>
            </div>

            ${process.env.ADMIN_URL ? `
            <p style="text-align: center; margin-top: 20px;">
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
};


/* -------------------------------------------------------------------------- */
/* 🧩 6. Create guest order (with Buy Now support & SIZE support)            */
/* -------------------------------------------------------------------------- */
export const createGuestOrder = async (req, reply) => {
  const {
    products,
    shippingAddress,
    guestUser,
    paymentMethod = 'razorpay',
    skipCartClear = false  // For Buy Now mode
  } = req.body;

  console.log('📦 Received guest order request:', {
    productCount: products?.length,
    guestEmail: guestUser?.email,
    paymentMethod,
    skipCartClear,
    products: products
  });

  // Validate required fields
  if (!products || !Array.isArray(products) || products.length === 0) {
    throw new ValidationError('Products are required and must be an array', {
      field: 'products'
    });
  }

  if (!shippingAddress || !guestUser) {
    throw new ValidationError('Shipping address and guest user details are required', {
      fields: { shippingAddress: !!shippingAddress, guestUser: !!guestUser }
    });
  }

  if (!guestUser.email || !guestUser.email.includes('@')) {
    throw new ValidationError('Valid guest email is required', {
      field: 'email',
      received: guestUser.email
    });
  }

  // Check if user already exists with this email
  let existingUser = await User.findOne({ email: guestUser.email.toLowerCase() });
  
  let userId;
  if (existingUser) {
    userId = existingUser._id;
    console.log('✅ Using existing user:', existingUser.email);
  } else {
    const newUser = await User.create({
      name: guestUser.name || shippingAddress.fullName || 'Guest Customer',
      email: guestUser.email.toLowerCase(),
      phone: guestUser.phone || shippingAddress.phone || '',
      isGuest: true,
      role: 'guest'
    });
    userId = newUser._id;
    console.log('✅ Created new guest user:', guestUser.email);
  }

  let totalAmount = 0;
  const orderProducts = [];

  console.log('🔄 Processing products:', products.length);

  for (const item of products) {
    console.log('📝 Processing product item:', {
      productId: item.product,
      variantId: item.variantId,
      variantName: item.variantName,
      price: item.price,
      quantity: item.quantity,
      selectedSize: item.selectedSize,
      selectedSizePrice: item.selectedSizePrice
    });

    const product = await Product.findById(item.product);
    
    if (!product) {
      throw new NotFoundError('Product', { productId: item.product });
    }

    let price = item.price;
    let variantName = item.variantName || '';
    let variantId = item.variantId || null;
    let originalPrice = price;
    let selectedSize = item.selectedSize || '';
    let selectedSizePrice = null;
    let variantSizes = [];
    
    let variant = null;

    // If variantId is provided, get variant details
    if (item.variantId && product.variants && product.variants.length > 0) {
      variant = product.variants.find(v => 
        v._id.toString() === item.variantId
      );
      
      if (variant) {
        variantSizes = variant.sizes || [];
        variantName = variant.variantName || variantName;
        originalPrice = variant.originalPrice || variant.price || product.basePrice;
        
        // ✅ Get price for selected size
        if (selectedSize && variantSizes.length > 0) {
          price = getSizePrice(variantSizes, selectedSize, variant.price);
          selectedSizePrice = price !== variant.price ? price : null;
        } else {
          price = variant.price;
          selectedSizePrice = null;
        }
        
        // Check variant stock
        if (variant.stock < item.quantity) {
          throw new ValidationError(`Insufficient stock for ${product.name} - ${variantName}`, {
            product: product.name,
            variant: variantName,
            available: variant.stock,
            requested: item.quantity
          });
        }
      }
    } else {
      // Simple product with sizes
      if (selectedSize && product.sizes && product.sizes.length > 0) {
        variantSizes = product.sizes;
        price = getSizePrice(product.sizes, selectedSize, product.basePrice);
        selectedSizePrice = price !== product.basePrice ? price : null;
      } else {
        price = product.basePrice;
        selectedSizePrice = null;
      }
      
      // Check base product stock
      if (product.stock < item.quantity) {
        throw new ValidationError(`Insufficient stock for ${product.name}`, {
          product: product.name,
          available: product.stock,
          requested: item.quantity
        });
      }
    }

    // If price is not provided, get from variant or product
    if (typeof price !== 'number' || isNaN(price) || price <= 0) {
      console.log('💰 Price not provided in request, looking up from product/variant');
      
      if (variant) {
        price = variant.price || product.basePrice;
      } else {
        price = product.basePrice;
      }
    } else {
      console.log('✅ Using price from request:', price);
    }

    if (typeof price !== 'number' || isNaN(price) || price <= 0) {
      console.error('❌ Invalid price for product:', {
        productId: product._id,
        productName: product.name,
        price,
        basePrice: product.basePrice
      });
      throw new ValidationError(`Invalid price for ${product.name}`, {
        product: product.name,
        price: price
      });
    }

    const itemTotal = item.quantity * price;
    totalAmount += itemTotal;

    let discountPercentage = 0;
    if (originalPrice > price) {
      discountPercentage = Math.round(((originalPrice - price) / originalPrice) * 100);
    }

    const displayName = variantName 
      ? `${product.name} - ${variantName}`
      : product.name;

    console.log('🔍 Size debug for guest order:', {
      product: product.name,
      variantSelected: !!variant,
      variantName: variantName,
      selectedSize: selectedSize,
      selectedSizePrice: selectedSizePrice,
      variantSizes: variantSizes
    });

    orderProducts.push({
      product: product._id,
      variantId: variantId,
      variantName: variantName,
      selectedSize: selectedSize,
      variantSizes: variantSizes,
      selectedSizePrice: selectedSizePrice,
      quantity: item.quantity,
      price: price,
      originalPrice: originalPrice,
      discountPercentage: discountPercentage,
      name: displayName,
      image: product.images && product.images.length > 0 ? product.images[0].image : null
    });

    console.log('✅ Product added to guest order:', {
      displayName: displayName,
      variantName: variantName,
      price: price,
      quantity: item.quantity,
      selectedSize: selectedSize || 'N/A',
      selectedSizePrice: selectedSizePrice,
      itemTotal: itemTotal
    });
  }

  if (isNaN(totalAmount) || totalAmount <= 0) {
    console.error('❌ Invalid total amount calculated:', totalAmount);
    throw new ValidationError('Invalid order total calculated', {
      totalAmount: totalAmount
    });
  }

  const shippingFee = 0; 
  const taxAmount = Math.round(totalAmount * 5) / 100;
  const finalAmount = totalAmount + shippingFee + taxAmount;

  console.log('💰 Amount calculations:', {
    totalAmount,
    shippingFee,
    taxAmount,
    finalAmount
  });

  const settings = await Setting.findOne().lean();
  
  if (paymentMethod === 'razorpay' && !settings.razorpayEnabled) {
    throw new BusinessLogicError('Razorpay payments are currently disabled', {
      paymentMethod: 'razorpay'
    });
  }
  
  if (paymentMethod === 'cod' && !settings.cashOnDeliveryEnabled) {
    throw new BusinessLogicError('Cash on Delivery is currently disabled', {
      paymentMethod: 'cod'
    });
  }

  const order = new Order({
    isGuestOrder: true,
    user: userId,
    guestUser: existingUser?._id || userId,
    products: orderProducts,
    shippingAddress: {
      ...shippingAddress,
      email: guestUser.email
    },
    paymentMethod,
    paymentStatus: paymentMethod === 'cod' ? 'pending' : 'pending',
    orderStatus: paymentMethod === 'cod' ? 'pending' : 'pending',
    totalAmount: Number(totalAmount.toFixed(2)),
    shippingFee: Number(shippingFee.toFixed(2)),
    taxAmount: Number(taxAmount.toFixed(2)),
    finalAmount: Number(finalAmount.toFixed(2)),
    subtotal: totalAmount,
    discountAmount: orderProducts.reduce((sum, item) => {
      if (item.originalPrice > item.price) {
        return sum + ((item.originalPrice - item.price) * item.quantity);
      }
      return sum;
    }, 0)
  });

  console.log('📄 Order before save (SIZE CHECK):', {
    orderId: order.orderId,
    productsCount: order.products.length,
    totalAmount: order.totalAmount,
    finalAmount: order.finalAmount,
    taxAmount: order.taxAmount,
    products: order.products.map(p => ({
      name: p.name,
      variantName: p.variantName,
      price: p.price,
      selectedSize: p.selectedSize,
      selectedSizePrice: p.selectedSizePrice,
      quantity: p.quantity
    }))
  });

  await order.save();

  console.log('✅ Order after save:', {
    orderId: order.orderId,
    sNo: order.sNo,
    finalAmount: order.finalAmount,
    taxAmount: order.taxAmount,
    products: order.products.map(p => ({
      name: p.name,
      variantName: p.variantName,
      price: p.price,
      selectedSize: p.selectedSize,
      selectedSizePrice: p.selectedSizePrice,
      quantity: p.quantity
    }))
  });

  // For COD payments, update stock
  if (paymentMethod === 'cod') {
    try {
      for (const item of orderProducts) {
        const product = await Product.findById(item.product);
        
        if (product) {
          if (item.variantId && product.variants && product.variants.length > 0) {
            const variantIndex = product.variants.findIndex(v => 
              v._id.toString() === item.variantId
            );
            
            if (variantIndex !== -1) {
              product.variants[variantIndex].stock -= item.quantity;
              const totalStock = product.variants.reduce((sum, variant) => sum + (variant.stock || 0), 0);
              product.stock = totalStock;
              await product.save();
              console.log(`📦 Updated variant stock for ${product.name}: -${item.quantity}`);
            }
          } else {
            product.stock -= item.quantity;
            await product.save();
            console.log(`📦 Updated product stock for ${product.name}: -${item.quantity}`);
          }
        }
      }

      try {
        await sendOrderConfirmation(order._id);
        console.log('📧 Order confirmation email sent for COD guest order');
      } catch (emailError) {
        console.error('❌ Order confirmation email failed:', emailError);
      }
    } catch (stockError) {
      console.error('❌ Stock update failed for COD order:', stockError);
    }
  }

  // ✅ Log Buy Now mode status
  console.log(`🛒 Guest Buy Now mode - skipCartClear: ${skipCartClear}`);

  reply.send({
    success: true,
    message: 'Guest order created successfully',
    order: {
      _id: order._id,
      orderId: order.orderId,
      finalAmount: order.finalAmount,
      paymentMethod: order.paymentMethod,
      requiresPayment: paymentMethod !== 'cod',
      products: order.products.map(p => ({
        name: p.name,
        variantName: p.variantName,
        price: p.price,
        selectedSize: p.selectedSize,
        selectedSizePrice: p.selectedSizePrice,
        quantity: p.quantity
      }))
    }
  });
};

/* -------------------------------------------------------------------------- */
/* 🧩 7. Get guest order by ID                                                */
/* -------------------------------------------------------------------------- */
export const getGuestOrder = async (req, reply) => {
  const { id } = req.params;

  const guestOrder = await GuestOrder.findOne({
    $or: [
      { _id: id },
      { razorpay_order_id: id }
    ]
  });

  if (!guestOrder) {
    throw new NotFoundError('Guest order', { id });
  }

  let paymentDetails = null;
  if (guestOrder.razorpay_payment_id) {
    try {
      const razorpay = await getRazorpayInstance();
      paymentDetails = await razorpay.payments.fetch(guestOrder.razorpay_payment_id);
    } catch (error) {
      console.error('Error fetching payment details:', error);
    }
  }

  reply.status(200).send({
    success: true,
    guestOrder: {
      id: guestOrder._id,
      razorpay_order_id: guestOrder.razorpay_order_id,
      razorpay_payment_id: guestOrder.razorpay_payment_id,
      amount: guestOrder.amount,
      currency: guestOrder.currency,
      customer_name: guestOrder.customer_name,
      customer_email: guestOrder.customer_email,
      customer_phone: guestOrder.customer_phone,
      products: guestOrder.products,
      status: guestOrder.status,
      payment_details: paymentDetails,
      created_at: guestOrder.createdAt,
      updated_at: guestOrder.updatedAt
    }
  });
};

/* -------------------------------------------------------------------------- */
/* 🧩 8. Get Razorpay order details                                           */
/* -------------------------------------------------------------------------- */
export const getRazorpayOrderDetails = async (req, reply) => {
  const { orderId } = req.params;
  console.log(req.params);
  
  const razorpay = await getRazorpayInstance();
  const razorpayOrder = await razorpay.orders.fetch(orderId);
  
  reply.send({
    success: true,
    order: razorpayOrder
  });
};

/* -------------------------------------------------------------------------- */
/* 🧩 9. Update Payment Status (Manual/Admin Update)                         */
/* -------------------------------------------------------------------------- */
export const updatePaymentStatus = async (req, reply) => {
  const { orderId } = req.params;
  const { 
    paymentStatus, 
    orderStatus, 
    notes,
    refundId,
    refundAmount,
    cancellationReason
  } = req.body;

  console.log('📝 Update payment status request:', {
    orderId,
    paymentStatus,
    orderStatus,
    refundId,
    refundAmount
  });

  if (!paymentStatus && !orderStatus) {
    throw new ValidationError('At least one status (paymentStatus or orderStatus) is required', {
      fields: { paymentStatus: !!paymentStatus, orderStatus: !!orderStatus }
    });
  }

  const order = await Order.findOne({
    $or: [
      { orderId: orderId },
      { razorpayOrderId: orderId },
      { paymentId: orderId }
    ]
  })
    .populate('user', 'name email')
    .populate('guestUser', 'name email phone');

  if (!order) {
    throw new NotFoundError('Order', { orderId });
  }

  const updateHistory = [];

  if (paymentStatus) {
    const validPaymentStatus = ['pending', 'completed', 'failed', 'refunded', 'partially_refunded'];
    
    if (!validPaymentStatus.includes(paymentStatus)) {
      throw new ValidationError(`Invalid payment status. Valid values: ${validPaymentStatus.join(', ')}`, {
        field: 'paymentStatus',
        received: paymentStatus,
        validOptions: validPaymentStatus
      });
    }

    const oldPaymentStatus = order.paymentStatus;
    
    if (paymentStatus === 'refunded' || paymentStatus === 'partially_refunded') {
      let newRefundId = refundId || `RFND-${Date.now()}-${order.orderId.substring(-6)}`;
      console.log('Generated refund ID:', newRefundId);

      if (!order.refunds) {
        order.refunds = [];
      }
      
      order.refunds.push({
        refundId: newRefundId,
        amount: refundAmount || order.finalAmount,
        razorpayPaymentId: order.paymentId || 'N/A',
        type: paymentStatus === 'partially_refunded' ? 'partial' : 'full',
        createdAt: new Date(),
        notes: notes || `Status updated to ${paymentStatus} by admin`
      });
      
      order.markModified('refunds');

      if (paymentStatus === 'refunded') {
        try {
          for (const item of order.products) {
            const product = await Product.findById(item.product);
            if (product) {
              if (item.variantId && product.variants?.length > 0) {
                const variantIndex = product.variants.findIndex(v => 
                  v._id.toString() === item.variantId
                );
                if (variantIndex !== -1) {
                  product.variants[variantIndex].stock += item.quantity;
                  product.stock = product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
                  await product.save();
                }
              } else {
                product.stock += item.quantity;
                await product.save();
              }
            }
          }
        } catch (stockError) {
          console.error('❌ Stock restoration failed:', stockError);
        }
      }
    }

    order.paymentStatus = paymentStatus;
    updateHistory.push(`Payment status changed from "${oldPaymentStatus}" to "${paymentStatus}"`);
  }

  if (orderStatus) {
    const validOrderStatus = [
      'pending', 'confirmed', 'processing', 'shipped', 
      'delivered', 'cancelled', 'refunded', 'partially_refunded'
    ];
    
    if (!validOrderStatus.includes(orderStatus)) {
      throw new ValidationError(`Invalid order status. Valid values: ${validOrderStatus.join(', ')}`, {
        field: 'orderStatus',
        received: orderStatus,
        validOptions: validOrderStatus
      });
    }

    const oldOrderStatus = order.orderStatus;
    
    if (orderStatus === 'cancelled' && order.orderStatus !== 'cancelled') {
      order.cancelledAt = new Date();
      order.cancelledBy = req.user?._id || null;
      order.cancellationReason = cancellationReason || notes || 'Cancelled by admin';
      
      if (order.paymentStatus === 'completed' || order.paymentStatus === 'partially_refunded') {
        if (!order.refunds) {
          order.refunds = [];
        }
        
        order.refunds.push({
          refundId: `CANCEL-${Date.now()}-${order.orderId.substring(-6)}`,
          amount: order.finalAmount,
          razorpayPaymentId: order.paymentId || 'N/A',
          type: 'full',
          createdAt: new Date(),
          notes: `Order cancelled: ${order.cancellationReason}`
        });
        
        order.markModified('refunds');
        order.paymentStatus = 'refunded';
      }
      
      if (order.paymentStatus === 'completed' || order.paymentStatus === 'pending') {
        try {
          for (const item of order.products) {
            const product = await Product.findById(item.product);
            if (product) {
              if (item.variantId && product.variants?.length > 0) {
                const variantIndex = product.variants.findIndex(v => 
                  v._id.toString() === item.variantId
                );
                if (variantIndex !== -1) {
                  product.variants[variantIndex].stock += item.quantity;
                  product.stock = product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
                  await product.save();
                }
              } else {
                product.stock += item.quantity;
                await product.save();
              }
            }
          }
        } catch (stockError) {
          console.error('❌ Stock restoration for cancellation failed:', stockError);
        }
      }
    }

    if (orderStatus === 'delivered' && order.orderStatus !== 'delivered') {
      order.deliveredAt = new Date();
    }

    order.orderStatus = orderStatus;
    updateHistory.push(`Order status changed from "${oldOrderStatus}" to "${orderStatus}"`);
  }

  if (notes) {
    order.notes = order.notes ? `${order.notes}\n${new Date().toISOString()}: ${notes}` : notes;
  }

  await order.save();

  if (updateHistory.length > 0 && orderStatus) {
    try {
      console.log('📧 Preparing to send status update email for order:', order.orderId);
      
      let customerEmail;
      let customerName;
      
      if (order.isGuestOrder) {
        customerEmail = order.guestUser?.email || order.shippingAddress?.email;
        customerName = order.guestUser?.name || order.shippingAddress?.fullName || 'Customer';
      } else {
        customerEmail = order.user?.email;
        customerName = order.user?.name || 'Customer';
      }
      
      if (!customerEmail) {
        console.warn('⚠️ No customer email found for order:', order.orderId);
      } else {
        console.log('📧 Sending status update email to:', customerEmail);
        
        const oldStatus = updateHistory[0].split('"')[1] || 'pending';
        
        const emailTemplate = emailTemplates.orderStatusUpdate(
          order, 
          oldStatus, 
          orderStatus
        );
        
        const emailResult = await sendEmail(
          customerEmail,
          emailTemplate.subject,
          emailTemplate.html
        );
        
        if (emailResult.success) {
          console.log('✅ Status update email sent successfully to:', customerEmail);
        } else {
          console.error('❌ Status update email failed:', emailResult.error);
        }
      }
    } catch (emailError) {
      console.error('❌ Status update email error:', emailError.message);
    }
  }

  const updatedOrder = await Order.findById(order._id)
    .populate('user', 'name email')
    .populate('guestUser', 'name email phone')
    .populate('products.product', 'name price')
    .populate('cancelledBy', 'name email');

  reply.send({
    success: true,
    message: 'Payment status updated successfully',
    updates: updateHistory,
    order: updatedOrder
  });
};