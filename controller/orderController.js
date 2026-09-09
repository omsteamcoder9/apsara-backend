// controllers/orderController.js
import Order from '../models/orderModel.js';
import Cart from '../models/cartModel.js';
import Product from '../models/productModel.js';
import Shipping from '../models/shippingModel.js';
import shippingService from '../services/shippingService.js';
import Setting from '../models/Setting.js';
import User from '../models/userModel.js';
import { 
  emailTemplates, 
  sendEmail, 
  sendOrderConfirmation, 
  sendOrderStatusUpdate,
  sendOrderCancellationNotification 
} from './emailController.js';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  ConflictError,
  DatabaseError,
  BusinessLogicError
} from '../utils/errors.js';

// Helper functions for stock management
const restoreProductStock = async (products) => {
  for (const item of products) {
    await Product.findByIdAndUpdate(item.product, {
      $inc: { stock: item.quantity }
    });
  }
};

// Helper function to get price for a specific size
const getSizePrice = (sizes, selectedSize, defaultPrice) => {
  if (!sizes || sizes.length === 0) return defaultPrice;
  
  const sizeData = sizes.find(s => s.size === selectedSize);
  if (sizeData && sizeData.price !== null && sizeData.price !== undefined) {
    return sizeData.price;
  }
  return defaultPrice;
};

// Format sizes display helper for receipts
const formatSizesDisplay = (selectedSize, variantSizes) => {
  if (!selectedSize) return '-';
  
  // Find the price for the selected size
  const sizeData = variantSizes?.find(s => s.size === selectedSize);
  const price = sizeData?.price;
  
  if (price !== null && price !== undefined) {
    return `${selectedSize} (${price})`;
  }
  
  return selectedSize;
};

const reduceProductStock = async (products) => {
  for (const item of products) {
    const product = await Product.findById(item.product);
    if (product && product.stock >= item.quantity) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { stock: -item.quantity }
      });
    }
  }
};

// Auto cancel ShipRocket shipment helper function
const autoCancelShiprocketShipment = async (order, user, reason = 'Order cancelled') => {
  try {
    const shipping = await Shipping.findOne({ orderId: order.orderId });
    
    if (shipping && shipping.shipmentId) {
      console.log(`🚫 Auto-cancelling ShipRocket shipment for order: ${order.orderId}`);
      
      const result = await shippingService.cancelShipment(shipping);
      
      if (result.success) {
        shipping.shippingStatus = 'cancelled';
        shipping.cancellationReason = reason;
        shipping.cancelledAt = new Date();
        shipping.cancelledBy = user?._id;
        await shipping.save();
        
        console.log('✅ ShipRocket shipment auto-cancelled successfully');
        return { success: true, message: result.message };
      } else {
        throw new Error(result.message);
      }
    }
    return { success: true, message: 'No shipment found to cancel' };
  } catch (error) {
    console.error('❌ Auto ShipRocket cancellation failed:', error.message);
    return { success: false, message: error.message };
  }
};

// Helper function to format receipt data with size-specific pricing
const formatReceiptData = (order, settings = {}) => {
  const cleanPrice = (price) => {
    if (typeof price === 'string') {
      const cleaned = price.replace('¹', '').replace(/[^\d.]/g, '');
      return parseFloat(cleaned) || 0;
    }
    return price || 0;
  };

  const formatSize = (selectedSize, variantSizes) => {
    if (!selectedSize) return '-';
    const sizeData = variantSizes?.find(s => s.size === selectedSize);
    const price = sizeData?.price;
    if (price !== null && price !== undefined) {
      return `${selectedSize} (${price})`;
    }
    return selectedSize;
  };

  return {
    receiptNumber: order._id.toString(),
    orderNumber: order.orderId || order._id.toString(),
    date: order.createdAt,
    customer: {
      id: order.user?._id,
      name: order.user?.name || (order.guestUser?.name || 'Guest Customer'),
      email: order.user?.email || (order.guestUser?.email || 'N/A')
    },
    shippingAddress: order.shippingAddress,
    items: order.products.map(item => ({
      name: item.product?.name || 'Product not available',
      quantity: item.quantity,
      price: cleanPrice(item.price),
      total: (item.quantity * cleanPrice(item.price)).toFixed(2),
      image: item.product?.image,
      selectedSize: item.selectedSize || '',
      variantSizes: item.variantSizes || [],
      sizeDisplay: formatSize(item.selectedSize, item.variantSizes),
      variantName: item.variantName || '',
      selectedSizePrice: item.selectedSizePrice || null
    })),
    pricing: {
      subtotal: cleanPrice(order.totalAmount) || 0,
      tax: cleanPrice(order.taxAmount) || 0,
      shipping: cleanPrice(order.shippingFee) || 0,
      total: cleanPrice(order.finalAmount) || 0
    },
    payment: {
      method: order.paymentMethod,
      status: order.paymentStatus,
      paidAt: order.paidAt,
    },
    gstInfo: {
      gstin: settings.gstinNumber || '',
      taxableAmount: cleanPrice(order.totalAmount) || 0,
      cgst: cleanPrice(order.taxAmount / 2) || 0,
      sgst: cleanPrice(order.taxAmount / 2) || 0,
      totalTax: cleanPrice(order.taxAmount) || 0
    }
  };
};

// Helper function to generate PDF
const generateReceiptPDF = async (reply, receiptData) => {
  try {
    const settings = await Setting.findOne().lean();
    const doc = new PDFDocument({ margin: 50 });
    
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `inline; filename=receipt-${receiptData.orderNumber}.pdf`);
    
    doc.pipe(reply.raw);
    
    addHeader(settings, doc, receiptData);
    addCustomerInfo(settings, doc, receiptData);
    addItemsTable(doc, receiptData);
    addTotals(doc, receiptData);
    addGstDetails(doc, receiptData);
    addPaymentInfo(doc, receiptData);
    addFooter(doc, receiptData);

    doc.end();
  } catch (error) {
    throw new Error(`PDF generation failed: ${error.message}`);
  }
};

// PDF generation functions
const addHeader = (settings, doc, data) => {
  doc.fontSize(24)
     .font('Helvetica-Bold')
     .fillColor('#1a237e')
     .text(settings.siteName || 'GLAINIC', { align: 'center' })
     .moveDown(0.3);
  
  doc.fontSize(10)
     .font('Helvetica')
     .fillColor('#666')
     .text('', { align: 'center' })
     .moveDown(1.5);
};

const addCustomerInfo = (settings, doc, data) => {
  const startX = 50;
  const startY = doc.y;
  
  doc.fontSize(10)
    .font('Helvetica-Bold')
    .fillColor('#000')
    .text('FROM:', startX, startY);

  doc.moveDown(0.8);

  doc.font('Helvetica').fontSize(9);

  doc.text(settings.siteName || 'GLAINIC', startX);

  const addressLines = (settings.companyAddress || 
    'Ganga Enterprise, 2nd Floor, Spencer Plaza, Anna Salai Chennai'
  ).split(', ');

  addressLines.forEach(line => {
    doc.text(line, startX);
  });

  doc.text(`Phone: ${settings.contactNumber || '+91 7548851435'}`);
  doc.text(`Email: ${settings.contactEmail || 'gangaenterprice@gmail.com'}`);

  let fromBottomY = doc.y;
  
  const orderColumnX = startX + 200;
  
  doc.fontSize(14)
    .font('Helvetica-Bold')
    .fillColor('#000')
    .text('ORDER RECEIPT', orderColumnX, startY);
  
  let orderY = doc.y + 5;
  doc.fontSize(10)
    .font('Helvetica')
    .fillColor('#333')
    .text(`Order #: ${data.orderNumber}`, orderColumnX, orderY);
  
  orderY += 18;
  doc.text(`Date: ${new Date(data.date).toLocaleDateString()}`, orderColumnX, orderY);
  
  orderY += 18;
  doc.text(`Payment: ${data.payment.method}`, orderColumnX, orderY);
  
  orderY += 18;
  doc.text(`Status: ${data.payment.status}`, orderColumnX, orderY);
  
  const toColumnX = startX + 390;
  
  doc.fontSize(10)
    .font('Helvetica-Bold')
    .fillColor('#000')
    .text('TO:', toColumnX, startY);
  
  doc.font('Helvetica')
    .fontSize(9);
  
  const toWidth = 200;
  let toY = doc.y + 5;
  doc.text(data.customer.name || 'Customer Name', toColumnX, toY, { width: toWidth });
  toY += 15;
  
  if (data.shippingAddress) {
    if (data.shippingAddress.street) {
      doc.text(data.shippingAddress.street, toColumnX, toY, { width: toWidth });
      toY += 15;
    }
    if (data.shippingAddress.city || data.shippingAddress.state || data.shippingAddress.postalCode) {
      const cityStateZip = [
        data.shippingAddress.city,
        data.shippingAddress.state,
        data.shippingAddress.postalCode
      ].filter(Boolean).join(', ');
      doc.text(cityStateZip, toColumnX, toY, { width: toWidth });
      toY += 15;
    }
    if (data.shippingAddress.country) {
      doc.text(data.shippingAddress.country, toColumnX, toY, { width: toWidth });
      toY += 15;
    }
  } else {
    doc.text('No shipping address provided', toColumnX, toY, { width: toWidth });
    toY += 15;
  }
  
  if (data.customer.email) {
    doc.text(`Email: ${data.customer.email}`, toColumnX, toY, { width: toWidth });
    toY += 15;
  }
  
  if (data.customer.phone) {
    doc.text(`Phone: ${data.customer.phone}`, toColumnX, toY, { width: toWidth });
    toY += 15;
  }
  
  const fromHeight = fromBottomY - startY;
  const orderHeight = Math.max(orderY - startY, 100);
  const toHeight = toY - startY;
  
  const maxHeight = Math.max(fromHeight, orderHeight, toHeight);
  
  doc.y = startY + maxHeight + 30;
};

const addGstDetails = (doc, data) => {
  const gstTop = doc.y + 10;
  
  if (data.gstInfo && (data.gstInfo.gstin || data.gstInfo.totalTax > 0)) {
    doc.font('Helvetica-Bold')
       .fontSize(10)
       .fillColor('#1a237e')
       .text('GST DETAILS', 50, gstTop);
    
    let yPos = gstTop + 15;
    
    doc.font('Helvetica')
       .fontSize(9)
       .fillColor('#000');
    
    if (data.gstInfo.gstin) {
      doc.text(`GSTIN: ${data.gstInfo.gstin}`, 50, yPos);
      yPos += 15;
    }

    doc.y = yPos + 20;
  }
};

// Updated items table to show SIZE with price
const addItemsTable = (doc, data) => {
  const tableTop = doc.y + 10;
  
  doc.font('Helvetica-Bold')
     .fontSize(10)
     .text('PRODUCT', 50, tableTop)
     .text('QTY', 260, tableTop)
     .text('PRICE', 330, tableTop)
     .text('TOTAL', 430, tableTop);
  
  doc.moveTo(50, tableTop + 15)
     .lineTo(550, tableTop + 15)
     .stroke();
  
  let yPosition = tableTop + 25;
  
  data.items.forEach((item) => {
    if (yPosition > 700) {
      doc.addPage();
      yPosition = 50;
    }
    
    let displayName = item.name;
    if (item.variantName) {
      displayName = `${item.name} (${item.variantName})`;
    }
    
    const sizeDisplay = item.sizeDisplay || item.selectedSize || '-';
    
    doc.font('Helvetica')
       .fontSize(9)
       .text(displayName, 50, yPosition, { width: 130 })
       .text(item.quantity.toString(), 260, yPosition, { width: 60 })
       .text(`${item.price}`, 330, yPosition, { width: 90 })
       .text(`${item.total}`, 430, yPosition, { width: 90 });
    
    yPosition += 20;
  });
  
  doc.y = yPosition + 10;
};

const addTotals = (doc, data) => {
  const totalsTop = doc.y;
  
  doc.font('Helvetica')
     .fontSize(10)
     .text(`Subtotal: ${data.pricing.subtotal.toFixed(2)}`, 400, totalsTop)
     .text(`Tax: ${data.pricing.tax.toFixed(2)}`, 400, totalsTop + 15)
     .text(`Shipping: ${data.pricing.shipping.toFixed(2)}`, 400, totalsTop + 30);
  
  doc.moveTo(400, totalsTop + 45)
     .lineTo(500, totalsTop + 45)
     .stroke();
  
  doc.font('Helvetica-Bold')
     .text(`TOTAL: ${data.pricing.total.toFixed(2)}`, 400, totalsTop + 55);
};

const addPaymentInfo = (doc, data) => {
  doc.moveDown(2)
     .font('Helvetica')
     .fontSize(10)
     .text(`Payment Method: ${data.payment.method}`, 50, doc.y)
     .text(`Payment Status: ${data.payment.status}`, 50, doc.y + 15);
  
  if (data.payment.paidAt) {
    doc.text(`Paid On: ${new Date(data.payment.paidAt).toLocaleDateString()}`, 50, doc.y + 30);
  }
};

const addFooter = (doc, data) => {
  doc.y = 700;
  doc.fontSize(8)
     .fillColor('#666666')
     .text('Thank you for your business!', { align: 'center' });
};

// Helper function to generate PDF buffer
const generateReceiptPDFBuffer = (receiptData) => {
  return new Promise(async (resolve, reject) => {
    try {
      const settings = await Setting.findOne().lean();
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      
      doc.on('error', (err) => {
        reject(err);
      });

      addHeader(settings, doc, receiptData);
      addCustomerInfo(settings, doc, receiptData);
      addItemsTable(doc, receiptData);
      addTotals(doc, receiptData);
      addGstDetails(doc, receiptData);
      addPaymentInfo(doc, receiptData);
      addFooter(doc, receiptData);

      doc.end();

    } catch (error) {
      reject(error);
    }
  });
};

// ============================================
// CONTROLLER FUNCTIONS
// ============================================

export const deleteOrder = async (req, reply) => {
  const order = await Order.findById(req.params.id);
  
  if (!order) {
    throw new NotFoundError('Order', { id: req.params.id });
  }

  await order.deleteOne();
  
  reply.send({
    success: true,
    message: 'Order deleted successfully'
  });
};

// @desc    Create new order (for registered users)
// @route   POST /api/orders
// @access  Private
export const createOrder = async (req, reply) => {
  const { shippingAddress, paymentMethod, paymentId, variantSelections, skipCartClear, products: bodyProducts } = req.body;

  console.log('Creating order for user:', req.user.id);
  console.log('Payment method:', paymentMethod);
  console.log('skipCartClear:', skipCartClear);
  console.log('bodyProducts:', bodyProducts);

  let productsToOrder = [];
  let totalAmount = 0;

  // ============================================
  // BUY NOW MODE - Using products from request body
  // ============================================
  if (skipCartClear && bodyProducts && bodyProducts.length > 0) {
    console.log('🛒 Buy Now mode - Using products from request body');
    
    for (const item of bodyProducts) {
      const product = await Product.findById(item.product);
      
      if (!product) {
        throw new NotFoundError('Product', { productId: item.product });
      }

      const variantId = item.variantId;
      const variantName = item.variantName || '';
      let selectedSize = item.selectedSize || '';
      let selectedSizePrice = null;
      
      let variant = null;
      let originalPrice = item.price;
      let finalPrice = item.price;
      let variantSizes = [];
      
      // Check if variant exists
      if (variantId && product.variants && product.variants.length > 0) {
        variant = product.variants.find(v => v._id.toString() === variantId);
        if (variant) {
          originalPrice = variant.originalPrice || variant.price || item.price;
          variantSizes = variant.sizes || [];
          variantName = variant.variantName || variantName;
          
          // Get price for selected size
          if (selectedSize && variantSizes.length > 0) {
            finalPrice = getSizePrice(variantSizes, selectedSize, variant.price);
            selectedSizePrice = finalPrice !== variant.price ? finalPrice : null;
          } else {
            finalPrice = variant.price;
            selectedSizePrice = null;
          }
          
          console.log(`📦 Variant found: ${variant.variantName}, sizes: ${variantSizes.map(s => s.size).join(', ')}, selected: ${selectedSize}, price: ${finalPrice}`);
        }
      } else {
        // Simple product with sizes
        if (selectedSize && product.sizes && product.sizes.length > 0) {
          variantSizes = product.sizes;
          finalPrice = getSizePrice(product.sizes, selectedSize, product.basePrice);
          selectedSizePrice = finalPrice !== product.basePrice ? finalPrice : null;
        } else {
          finalPrice = product.basePrice;
          selectedSizePrice = null;
        }
      }

      // Check stock
      if (variant) {
        if (variant.stock < item.quantity) {
          throw new ValidationError(`Insufficient stock for ${product.name} - ${variantName}`, {
            product: product.name,
            variant: variantName,
            available: variant.stock,
            requested: item.quantity
          });
        }
      } else if (product.stock < item.quantity) {
        throw new ValidationError(`Insufficient stock for ${product.name}`, {
          product: product.name,
          available: product.stock,
          requested: item.quantity
        });
      }

      const itemTotal = item.quantity * finalPrice;
      totalAmount += itemTotal;

      let discountPercentage = 0;
      if (originalPrice > finalPrice) {
        discountPercentage = Math.round(((originalPrice - finalPrice) / originalPrice) * 100);
      }

      const productImage = product.images && product.images.length > 0 
        ? product.images[0].image 
        : null;

      productsToOrder.push({
        product: product._id,
        variantId: variantId,
        variantName: variantName,
        quantity: item.quantity,
        price: finalPrice,
        originalPrice: originalPrice,
        discountPercentage: discountPercentage,
        name: product.name,
        image: productImage,
        sku: null,
        selectedSize: selectedSize,
        variantSizes: variantSizes,
        selectedSizePrice: selectedSizePrice
      });

      console.log('✅ Buy Now product added:', {
        name: product.name,
        variant: variantName || 'None',
        price: finalPrice,
        quantity: item.quantity,
        selectedSize: selectedSize || 'N/A',
        selectedSizePrice: selectedSizePrice,
        itemTotal
      });
    }
  } 
  // ============================================
  // NORMAL CHECKOUT - Use cart from database
  // ============================================
  else {
    console.log('🛒 Normal checkout - Using cart from database');
    
    const cart = await Cart.findOne({ user: req.user.id })
      .populate({
        path: 'items.product',
        model: 'Product',
        select: 'name basePrice stock images variants sizes'
      });

    if (!cart || cart.items.length === 0) {
      throw new ValidationError('Cart is empty', {
        userId: req.user.id
      });
    }

    console.log('Processing cart items:', cart.items.length);

    for (const item of cart.items) {
      if (!item.product || !item.product._id) {
        console.error('Invalid product in cart item:', item);
        throw new ValidationError('Invalid product in cart', {
          item: item
        });
      }

      const product = await Product.findById(item.product._id);
      
      if (!product) {
        throw new NotFoundError('Product', { productId: item.product._id });
      }

      const variantId = item.variantId;
      const variantName = item.variantName || '';
      const selectedSize = item.selectedSize || '';
      const finalPrice = item.price;
      let originalPrice = finalPrice;
      let variantSizes = item.variantSizes || [];
      
      // Get original price from variant or product
      if (variantId && product.variants && product.variants.length > 0) {
        const variant = product.variants.find(v => v._id.toString() === variantId);
        if (variant) {
          originalPrice = variant.originalPrice || variant.price || finalPrice;
          variantSizes = variant.sizes || variantSizes;
        }
      } else {
        originalPrice = product.basePrice;
      }

      if (typeof finalPrice !== 'number' || isNaN(finalPrice) || finalPrice <= 0) {
        console.error('Invalid price from cart:', {
          productId: product._id,
          productName: product.name,
          cartPrice: finalPrice,
          variantName
        });
        throw new ValidationError(`Invalid price for ${product.name}`, {
          product: product.name,
          price: finalPrice
        });
      }

      // Check stock
      if (variantId) {
        const variant = product.variants?.find(v => v._id.toString() === variantId);
        if (variant && variant.stock < item.quantity) {
          throw new ValidationError(`Insufficient stock for ${product.name} - ${variantName}`, {
            product: product.name,
            variant: variantName,
            available: variant.stock,
            requested: item.quantity
          });
        }
      } else if (product.stock < item.quantity) {
        throw new ValidationError(`Insufficient stock for ${product.name}`, {
          product: product.name,
          available: product.stock,
          requested: item.quantity
        });
      }

      const itemTotal = item.quantity * finalPrice;
      totalAmount += itemTotal;

      let discountPercentage = 0;
      if (originalPrice > finalPrice) {
        discountPercentage = Math.round(((originalPrice - finalPrice) / originalPrice) * 100);
      }

      const productImage = product.images && product.images.length > 0 
        ? product.images[0].image 
        : null;

      productsToOrder.push({
        product: product._id,
        variantId: variantId,
        variantName: variantName,
        quantity: item.quantity,
        price: finalPrice,
        originalPrice: originalPrice,
        discountPercentage: discountPercentage,
        name: product.name,
        image: productImage,
        sku: null,
        selectedSize: selectedSize,
        variantSizes: variantSizes,
        selectedSizePrice: item.selectedSizePrice || null
      });

      console.log('✅ Product added to order from cart:', {
        name: product.name,
        variant: variantName || 'None',
        priceFromCart: finalPrice,
        quantity: item.quantity,
        selectedSize: selectedSize || 'N/A',
        selectedSizePrice: item.selectedSizePrice || null,
        itemTotal
      });
    }
  }

  // Validate totalAmount
  if (isNaN(totalAmount) || totalAmount <= 0) {
    console.error('Invalid total amount calculated:', totalAmount);
    throw new ValidationError('Invalid order total calculated', {
      totalAmount: totalAmount
    });
  }

  console.log('Total amount:', totalAmount);

  // Calculate shipping, tax, and final amount
  const shippingFee = 0; 
  const taxAmount = Math.round(totalAmount * 5) / 100;
  const finalAmount = totalAmount + shippingFee + taxAmount;

  console.log('Amount calculations:', {
    totalAmount,
    shippingFee,
    taxAmount,
    finalAmount
  });

  // Create order with the data
  const orderData = {
    user: req.user.id,
    products: productsToOrder,
    shippingAddress,
    paymentMethod,
    paymentId: paymentMethod !== 'cod' ? paymentId : undefined,
    paymentStatus: paymentMethod === 'cod' ? 'pending' : 'pending',
    orderStatus: paymentMethod === 'cod' ? 'pending' : 'pending',
    totalAmount: Number(totalAmount.toFixed(2)),
    shippingFee: Number(shippingFee.toFixed(2)),
    taxAmount: Number(taxAmount.toFixed(2)),
    finalAmount: Number(finalAmount.toFixed(2)),
    subtotal: totalAmount,
    discountAmount: productsToOrder.reduce((sum, item) => {
      if (item.originalPrice > item.price) {
        return sum + ((item.originalPrice - item.price) * item.quantity);
      }
      return sum;
    }, 0)
  };

  console.log('Creating order with data:', {
    productsCount: orderData.products.length,
    totalAmount: orderData.totalAmount,
    finalAmount: orderData.finalAmount,
    taxAmount: orderData.taxAmount,
    products: orderData.products.map(p => ({
      name: p.name,
      variant: p.variantName,
      price: p.price,
      quantity: p.quantity,
      selectedSize: p.selectedSize,
      selectedSizePrice: p.selectedSizePrice
    }))
  });

  const order = await Order.create(orderData);

  console.log('✅ Order created:', {
    orderId: order.orderId,
    sNo: order.sNo,
    finalAmount: order.finalAmount,
    products: order.products.map(p => ({
      name: p.name,
      variant: p.variantName,
      price: p.price,
      quantity: p.quantity,
      selectedSize: p.selectedSize,
      selectedSizePrice: p.selectedSizePrice
    }))
  });

  // For COD payments, update stock immediately
  if (paymentMethod === 'cod') {
    try {
      for (const item of productsToOrder) {
        const product = await Product.findById(item.product);
        
        if (product) {
          if (item.variantId && product.variants && product.variants.length > 0) {
            const variantIndex = product.variants.findIndex(v => v._id.toString() === item.variantId);
            if (variantIndex !== -1) {
              product.variants[variantIndex].stock -= item.quantity;
              const totalStock = product.variants.reduce((sum, variant) => sum + (variant.stock || 0), 0);
              product.stock = totalStock;
              await product.save();
              console.log(`Updated variant stock for ${product.name}: -${item.quantity}`);
            }
          } else {
            product.stock -= item.quantity;
            await product.save();
            console.log(`Updated product stock for ${product.name}: -${item.quantity}`);
          }
        }
      }

      try {
        await sendOrderConfirmation(order._id);
        console.log('Order confirmation email sent for COD order');
      } catch (emailError) {
        console.error('Order confirmation email failed:', emailError);
      }
    } catch (stockError) {
      console.error('Stock update failed for COD order:', stockError);
    }
  }
  
  // Only clear cart if NOT in Buy Now mode
  if (!skipCartClear) {
    await Cart.findOneAndUpdate({ user: req.user.id }, { $set: { items: [] } });
    console.log(`🗑️ Cart cleared for user ${req.user.id} (normal checkout)`);
  } else {
    console.log(`🛒 Buy Now mode - Cart NOT cleared for user ${req.user.id} (cart preserved)`);
  }

  reply.status(201).send({
    success: true,
    message: 'Order created successfully',
    order,
    requiresPayment: paymentMethod !== 'cod'
  });
};

// @desc    Update order payment success (for Razorpay verification)
// @route   PUT /api/orders/payment-success
// @access  Public (called by Razorpay webhook)
export const updateOrderPaymentSuccess = async (req, reply) => {
  const { orderId, paymentId } = req.body;

  if (!orderId || !paymentId) {
    throw new ValidationError('Order ID and Payment ID are required', {
      fields: { orderId: !!orderId, paymentId: !!paymentId }
    });
  }

  const order = await Order.findOne({ orderId })
    .populate('user', 'name email')
    .populate('products.product', 'name price stock');

  if (!order) {
    throw new NotFoundError('Order', { orderId });
  }

  if (order.paymentMethod === 'razorpay' && order.paymentStatus !== 'completed') {
    for (const item of order.products) {
      if (item.product && item.product.stock >= item.quantity) {
        await Product.findByIdAndUpdate(item.product._id, {
          $inc: { stock: -item.quantity }
        });
        console.log(`Updated stock for product: ${item.product.name}`);
      }
    }
  }

  order.paymentStatus = 'completed';
  order.orderStatus = 'confirmed';
  order.paymentId = paymentId;
  order.paidAt = new Date();
  await order.save();

  try {
    await sendOrderConfirmation(order._id);
    console.log('Order confirmation email sent successfully after Razorpay payment');
  } catch (emailError) {
    console.error('Order confirmation email failed:', emailError);
  }

  reply.send({
    success: true,
    message: 'Order payment status updated successfully',
    order
  });
};

// @desc    Update order payment failed
// @route   PUT /api/orders/payment-failed
// @access  Public (called by Razorpay webhook)
export const updateOrderPaymentFailed = async (req, reply) => {
  const { orderId } = req.body;

  if (!orderId) {
    throw new ValidationError('Order ID is required', { field: 'orderId' });
  }

  const order = await Order.findOne({ orderId });

  if (!order) {
    throw new NotFoundError('Order', { orderId });
  }

  order.paymentStatus = 'failed';
  order.orderStatus = 'cancelled';
  await order.save();

  reply.send({
    success: true,
    message: 'Order payment status updated to failed',
    order
  });
};

// @desc    Get order by orderId
// @route   GET /api/orders/order/:orderId
// @access  Public (for payment verification)
export const getOrderByOrderId = async (req, reply) => {
  const { orderId } = req.params;

  const order = await Order.findOne({ orderId })
    .populate('user', 'name email')
    .populate('products.product', 'name image price');

  if (!order) {
    throw new NotFoundError('Order', { orderId });
  }

  reply.send({
    success: true,
    order
  });
};

// @desc    Get all orders (Admin)
// @route   GET /api/orders
// @access  Private/Admin
export const getOrders = async (req, reply) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const orders = await Order.find()
    .populate('user', 'name email')
    .populate('guestUser', 'name email phone')
    .populate('products.product', 'name image')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Order.countDocuments();

  reply.send({
    success: true,
    orders,
    pagination: {
      page,
      pages: Math.ceil(total / limit),
      total,
    },
  });
};

// @desc    Get user's orders
// @route   GET /api/orders/my-orders
// @access  Private
export const getUserOrders = async (req, reply) => {
  const orders = await Order.find({ user: req.user.id })
    .populate({
      path: 'products.product',
      select: 'name images',
      transform: (doc) => {
        if (doc) {
          return {
            _id: doc._id,
            name: doc.name,
            image: doc.images && doc.images.length > 0 ? doc.images[0].image : null
          };
        }
        return doc;
      }
    })
    .sort({ createdAt: -1 });

  reply.send({
    success: true,
    orders,
  });
};

// @desc    Get single order
// @route   GET /api/orders/:id
// @access  Private
export const getOrderById = async (req, reply) => {
  const order = await Order.findById(req.params.id)
    .populate('user', 'name email')
    .populate('guestUser', 'name email phone')
    .populate({
      path: 'products.product',
      select: 'name images',
      transform: (doc) => {
        if (doc) {
          return {
            _id: doc._id,
            name: doc.name,
            image: doc.images && doc.images.length > 0 ? doc.images[0].image : null
          };
        }
        return doc;
      }
    });

  if (!order) {
    throw new NotFoundError('Order', { id: req.params.id });
  }

  reply.send({
    success: true,
    order,
  });
};

// @desc    Update order status (works for both regular and guest users)
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
export const updateOrderStatus = async (req, reply) => {
  const { orderStatus } = req.body;
  const { id } = req.params;

  if (!id) {
    throw new ValidationError('Order ID is required', { field: 'id' });
  }

  if (!orderStatus) {
    throw new ValidationError('Order status is required', { field: 'orderStatus' });
  }

  const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
  if (!validStatuses.includes(orderStatus)) {
    throw new ValidationError(`Invalid order status. Must be one of: ${validStatuses.join(', ')}`, {
      field: 'orderStatus',
      received: orderStatus,
      validOptions: validStatuses
    });
  }

  console.log('Updating order status for ID:', id);

  const order = await Order.findById(id)
    .populate('user', 'name email')
    .populate('guestUser', 'name email phone')
    .populate('products.product', 'name image price');

  if (!order) {
    console.log(`Order not found with ID: ${id}`);
    throw new NotFoundError('Order', { id });
  }

  console.log(`Found order: ${order.orderId}, current status: ${order.orderStatus}, isGuest: ${order.isGuestOrder}`);

  const oldStatus = order.orderStatus;
  
  if (oldStatus === orderStatus) {
    throw new ConflictError(`Order status is already ${orderStatus}`);
  }

  order.orderStatus = orderStatus;

  if (orderStatus === 'delivered') {
    order.deliveredAt = new Date();
    if (order.paymentMethod === 'cod') {
      order.paymentStatus = 'completed';
      console.log('Auto-completed COD payment for delivered order');
    }
  }

  if (orderStatus === 'cancelled' && oldStatus !== 'cancelled') {
    await restoreProductStock(order.products);
    console.log('Restored product stock for cancelled order');
    
    const cancellationResult = await autoCancelShiprocketShipment(
      order, 
      req.user, 
      `Auto-cancelled: Order status changed from ${oldStatus} to ${orderStatus}`
    );
    
    if (!cancellationResult.success) {
      console.warn('⚠️ ShipRocket cancellation had issues:', cancellationResult.message);
    }
    
    try {
      const adminNotification = await sendOrderCancellationNotification(
        order, 
        'admin', 
        `Status changed from ${oldStatus} to cancelled`
      );
      console.log(`📧 Admin cancellation notification sent via status update:`, adminNotification.success ? 'Sent' : 'Failed');
    } catch (emailError) {
      console.error('Admin cancellation notification failed in status update:', emailError);
    }
  }

  if (oldStatus === 'cancelled' && orderStatus !== 'cancelled') {
    await reduceProductStock(order.products);
    console.log('Reduced product stock for reactivated order');
  }

  await order.save();
  console.log(`Order status updated from ${oldStatus} to ${orderStatus}`);

  const updatedOrder = await Order.findById(order._id)
    .populate('user', 'name email')
    .populate('guestUser', 'name email phone')
    .populate('products.product', 'name image price');

  try {
    console.log('Sending order status update email...');
    
    let userEmail;
    let userName;
    
    if (updatedOrder.isGuestOrder) {
      userEmail = updatedOrder.guestUser.email;
      userName = updatedOrder.guestUser.name;
      console.log(`Sending to guest user: ${userEmail}`);
    } else {
      userEmail = updatedOrder.user.email;
      userName = updatedOrder.user.name;
      console.log(`Sending to registered user: ${userEmail}`);
    }

    if (userEmail) {
      const emailTemplate = emailTemplates.orderStatusUpdate(updatedOrder, oldStatus, orderStatus);
      const emailResult = await sendEmail(userEmail, emailTemplate.subject, emailTemplate.html);
      console.log('Order status update email sent successfully:', emailResult);
    } else {
      console.warn('No email address found for order:', updatedOrder._id);
    }

  } catch (emailError) {
    console.error('Order status update email failed:', emailError);
  }

  reply.send({
    success: true,
    order: updatedOrder,
    message: `Order status updated from ${oldStatus} to ${orderStatus}`,
    emailSent: true
  });
};

// @desc    Update order status by orderId
// @route   PUT /api/orders/order-status/:orderId
// @access  Private/Admin
export const updateOrderStatusByOrderId = async (req, reply) => {
  const { orderStatus } = req.body;
  const { orderId } = req.params;

  console.log('Updating order status for orderId:', orderId);

  const order = await Order.findOne({ orderId: orderId })
    .populate('user', 'name email')
    .populate('guestUser', 'name email phone')
    .populate('products.product', 'name image price');

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

  if (orderStatus === 'cancelled' && oldStatus !== 'cancelled') {
    await restoreProductStock(order.products);
    
    const cancellationResult = await autoCancelShiprocketShipment(
      order, 
      req.user, 
      `Auto-cancelled: Order status changed from ${oldStatus} to ${orderStatus}`
    );
    
    if (!cancellationResult.success) {
      console.warn('⚠️ ShipRocket cancellation had issues:', cancellationResult.message);
    }
  }

  await order.save();

  try {
    console.log('Sending order status update email...');
    const emailResult = await sendOrderStatusUpdate(order._id, oldStatus, orderStatus);
    console.log('Order status update email result:', emailResult);
  } catch (emailError) {
    console.error('Order status update email failed:', emailError);
  }

  reply.send({
    success: true,
    order: {
      orderId: order.orderId,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      deliveredAt: order.deliveredAt,
    },
    message: `Order status updated from ${oldStatus} to ${orderStatus} and email sent successfully`,
  });
};

// @desc    Get order summary for user
// @route   GET /api/orders/summary
// @access  Private
export const getOrderSummary = async (req, reply) => {
  const totalOrders = await Order.countDocuments({ user: req.user.id });
  const pendingOrders = await Order.countDocuments({
    user: req.user.id,
    orderStatus: { $in: ['pending', 'confirmed', 'processing'] },
  });
  const deliveredOrders = await Order.countDocuments({
    user: req.user.id,
    orderStatus: 'delivered',
  });

  reply.send({
    success: true,
    summary: {
      totalOrders,
      pendingOrders,
      deliveredOrders,
    },
  });
};

// @desc    Print order receipt (JSON or PDF based on Accept header)
// @route   GET /api/orders/:id/receipt
// @access  Private
export const printOrderReceipt = async (req, reply) => {
  const order = await Order.findById(req.params.id)
    .populate('user', 'name email')
    .populate('guestUser', 'name email phone')
    .populate('products.product', 'name price image');

  if (!order) {
    throw new NotFoundError('Order', { id: req.params.id });
  }

  const isAdmin = req.user.role === 'admin';
  const isOrderOwner = order.user && order.user._id.toString() === req.user.id;
  
  if (!isOrderOwner && !isAdmin) {
    throw new AuthorizationError('Not authorized to view this receipt', {
      userId: req.user.id,
      orderOwner: order.user?._id
    });
  }

  const settings = await Setting.findOne().lean();
  const receiptData = formatReceiptData(order, settings);

  const wantsPDF = req.query.format === 'pdf' || 
                  req.headers.accept?.includes('application/pdf');

  if (wantsPDF) {
    return await generateReceiptPDF(reply, receiptData);
  }

  reply.send({
    success: true,
    message: 'Receipt generated successfully',
    receipt: receiptData
  });
};

// @desc    Print order receipt PDF and save to uploads folder
// @route   GET /api/orders/:id/receipt/pdf
// @access  Private
export const printOrderReceiptPDF = async (req, reply) => {
  const order = await Order.findById(req.params.id)
    .populate('user', 'name email')
    .populate('products.product', 'name price image');

  if (!order) {
    throw new NotFoundError('Order', { id: req.params.id });
  }

  const isAdmin = req.user.role === 'admin';
  const isOrderOwner = order.user && order.user._id.toString() === req.user.id;
  
  if (!isOrderOwner && !isAdmin) {
    throw new AuthorizationError('Not authorized to view this receipt', {
      userId: req.user.id,
      orderOwner: order.user?._id
    });
  }

  const settings = await Setting.findOne().lean();
  const receiptData = formatReceiptData(order, settings);
  
  const pdfBuffer = await generateReceiptPDFBuffer(receiptData);
  
  reply.header('Content-Type', 'application/pdf');
  reply.header('Content-Disposition', `inline; filename="receipt-${order.orderId}.pdf"`);
  reply.header('Content-Length', pdfBuffer.length);
  
  return reply.send(pdfBuffer);
};

// @desc    Create guest order
// @route   POST /api/orders/guest
// @access  Public
export const createGuestOrder = async (req, reply) => {
  const {
    products,
    shippingAddress,
    guestUser,
    paymentMethod = 'razorpay',
    skipCartClear
  } = req.body;

  console.log('📦 Received guest order request:', {
    productCount: products?.length,
    guestEmail: guestUser?.email,
    paymentMethod,
    skipCartClear,
    products: products
  });

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

  console.log('🔄 Processing products from request:', products.length);

  for (const item of products) {
    console.log('📝 Processing product item:', {
      productId: item.product,
      variantId: item.variantId,
      variantName: item.variantName,
      price: item.price,
      quantity: item.quantity,
      selectedSize: item.selectedSize
    });

    const product = await Product.findById(item.product);
    
    if (!product) {
      throw new NotFoundError('Product', { productId: item.product });
    }

    let variantId = item.variantId || null;
    let variantName = item.variantName || '';
    let selectedSize = item.selectedSize || '';
    let finalPrice = item.price;
    let originalPrice = item.price;
    let variantSizes = [];
    let selectedSizePrice = null;
    let variant = null;

    // Check if product has variants
    if (item.variantId && product.variants && product.variants.length > 0) {
      variant = product.variants.find(v => 
        v._id.toString() === item.variantId
      );
      
      if (variant) {
        variantSizes = variant.sizes || [];
        variantName = variant.variantName || variantName;
        originalPrice = variant.originalPrice || variant.price || product.basePrice;
        
        // Get price for selected size
        if (selectedSize && variantSizes.length > 0) {
          finalPrice = getSizePrice(variantSizes, selectedSize, variant.price);
          selectedSizePrice = finalPrice !== variant.price ? finalPrice : null;
        } else {
          finalPrice = variant.price;
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
        finalPrice = getSizePrice(product.sizes, selectedSize, product.basePrice);
        selectedSizePrice = finalPrice !== product.basePrice ? finalPrice : null;
      } else {
        finalPrice = product.basePrice;
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

    // Validate price
    if (typeof finalPrice !== 'number' || isNaN(finalPrice) || finalPrice <= 0) {
      console.error('❌ Invalid price for product:', {
        productId: product._id,
        productName: product.name,
        price: finalPrice,
        basePrice: product.basePrice
      });
      throw new ValidationError(`Invalid price for ${product.name}`, {
        product: product.name,
        price: finalPrice
      });
    }

    const itemTotal = item.quantity * finalPrice;
    totalAmount += itemTotal;

    let discountPercentage = 0;
    if (originalPrice > finalPrice) {
      discountPercentage = Math.round(((originalPrice - finalPrice) / originalPrice) * 100);
    }

    const displayName = variantName 
      ? `${product.name} - ${variantName}`
      : product.name;

    orderProducts.push({
      product: product._id,
      variantId: variantId,
      variantName: variantName,
      selectedSize: selectedSize,
      variantSizes: variantSizes,
      selectedSizePrice: selectedSizePrice,
      quantity: item.quantity,
      price: finalPrice,
      originalPrice: originalPrice,
      discountPercentage: discountPercentage,
      name: displayName,
      image: product.images && product.images.length > 0 ? product.images[0].image : null
    });

    console.log('✅ Product added to guest order:', {
      displayName: displayName,
      variantName: variantName,
      price: finalPrice,
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

  console.log('📄 Guest order before save (SIZE CHECK):', {
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

  console.log('✅ Guest order after save:', {
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
            }
          } else {
            product.stock -= item.quantity;
            await product.save();
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

// @desc    Cancel order
// @route   PUT /api/orders/:id/cancel
// @access  Private
export const cancelOrder = async (req, reply) => {
  const { cancellationReason } = req.body;
  const order = await Order.findById(req.params.id)
    .populate('user', 'name email')
    .populate('guestUser', 'name email phone')
    .populate('products.product', 'name price');

  if (!order) {
    throw new NotFoundError('Order', { id: req.params.id });
  }

  const isAdmin = req.user.role === 'admin';
  const isOrderOwner = order.user && order.user._id.toString() === req.user.id;
  
  if (!isOrderOwner && !isAdmin) {
    throw new AuthorizationError('Not authorized to cancel this order', {
      userId: req.user.id,
      orderOwner: order.user?._id,
      userRole: req.user.role
    });
  }

  if (order.orderStatus === 'cancelled') {
    throw new ConflictError('Order is already cancelled');
  }

  const cancellableStatuses = ['pending', 'confirmed', 'processing'];
  if (!cancellableStatuses.includes(order.orderStatus)) {
    throw new BusinessLogicError(`Cannot cancel order that is already ${order.orderStatus}`, {
      currentStatus: order.orderStatus,
      allowedStatuses: cancellableStatuses
    });
  }

  order.orderStatus = 'cancelled';
  order.cancelledAt = new Date();
  order.cancelledBy = req.user.id;
  
  if (cancellationReason) {
    order.cancellationReason = cancellationReason;
  }

  await restoreProductStock(order.products);

  const cancellationResult = await autoCancelShiprocketShipment(
    order, 
    req.user, 
    cancellationReason || 'Order cancelled by user'
  );
  
  if (!cancellationResult.success) {
    console.warn('⚠️ ShipRocket cancellation had issues:', cancellationResult.message);
  }

  await order.save();

  try {
    const cancelledBy = isAdmin ? 'admin' : 'user';
    const adminNotification = await sendOrderCancellationNotification(
      order, 
      cancelledBy, 
      cancellationReason || 'No reason provided'
    );
    
    console.log(`📧 Admin cancellation notification result:`, adminNotification.success ? 'Sent' : 'Failed');
    
  } catch (emailError) {
    console.error('Cancellation email failed:', emailError);
  }

  reply.send({
    success: true,
    message: 'Order cancelled successfully',
    order: {
      _id: order._id,
      orderId: order.orderId,
      orderStatus: order.orderStatus,
      cancelledAt: order.cancelledAt,
      cancellationReason: order.cancellationReason
    }
  });
};