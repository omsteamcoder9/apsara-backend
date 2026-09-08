// controllers/shippingController.js
import shippingService from '../services/shippingService.js';
import Order from '../models/orderModel.js';
import Shipping from '../models/shippingModel.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  DatabaseError
} from '../utils/errors.js';

// 🚀 CREATE SHIPMENT ENDPOINT - FIXED
export const createShipment = async (req, reply) => {
  // Get orderId from params
  let orderId = req.params.orderId || req.params.id;
  
  console.log(' DEBUG - Order ID from request:', orderId);
  console.log('👥 DEBUG - User type in request:', req.user ? 'Registered User' : 'Guest');

  const { pickupLocation = {} } = req.body;

  // Validate orderId
  if (!orderId || orderId === 'undefined' || orderId === 'null') {
    throw new ValidationError('Order ID is required in URL parameters', {
      field: 'orderId',
      example: 'POST /api/shipping/orders/U1762582676238K9Y37/shipment'
    });
  }

  // Better order lookup with guest user support
  let order = await Order.findOne({ orderId: orderId })
    .populate('user', 'name email phone')
    .populate('guestUser', 'name email phone')
    .populate('products.product', 'name sku price weight dimensions hsn tax categories stock');

  console.log('🔍 Lookup by orderId result:', order ? 'FOUND' : 'NOT FOUND');
  console.log('🔍 Order type:', order?.isGuestOrder ? 'GUEST ORDER' : 'USER ORDER');

  // If not found by orderId, try by _id
  if (!order) {
    console.log('⚠️ Trying lookup by MongoDB _id...');
    try {
      order = await Order.findById(orderId)
        .populate('user', 'name email phone')
        .populate('guestUser', 'name email phone')
        .populate('products.product', 'name sku price weight dimensions hsn tax categories stock');
      console.log('🔍 Lookup by _id result:', order ? 'FOUND' : 'NOT FOUND');
    } catch (idError) {
      console.log('❌ Invalid MongoDB _id format');
    }
  }

  // If still not found, return error
  if (!order) {
    throw new NotFoundError('Order', { orderId });
  }

  console.log('✅ Order found:', order.orderId);
  console.log('📋 Order details:', {
    isGuestOrder: order.isGuestOrder,
    hasUser: !!order.user,
    hasGuestUser: !!order.guestUser,
    productsCount: order.products?.length || 0,
    hasShippingAddress: !!order.shippingAddress
  });

  // Check if shipment already exists in both order and shipping collection
  const existingShipping = await Shipping.findOne({ orderId: order.orderId });
  if (order.shipmentId || existingShipping) {
    throw new ConflictError('Shipment already created for this order', {
      existingShipmentId: order.shipmentId || existingShipping?.shipmentId,
      orderId: order.orderId
    });
  }

  // Enhanced validation for both user types
  if (!order.shippingAddress) {
    throw new ValidationError('Order missing shipping address', {
      orderId: order.orderId,
      userType: order.isGuestOrder ? 'guest' : 'registered'
    });
  }

  // Get customer details based on user type
  let customerEmail, customerName, customerPhone;

  if (order.isGuestOrder) {
    // GUEST USER: Get from guestUser field
    customerEmail = order.guestUser?.email;
    customerName = order.guestUser?.name;
    customerPhone = order.guestUser?.phone;
    
    console.log('👤 Guest user details:', { customerEmail, customerName, customerPhone });
    
    // Validate guest user data
    if (!customerEmail || !customerName) {
      throw new ValidationError('Guest order missing customer information (email or name)', {
        orderId: order.orderId,
        guestUser: order.guestUser
      });
    }
  } else {
    // REGISTERED USER: Get from user field
    customerEmail = order.user?.email;
    customerName = order.user?.name;
    customerPhone = order.user?.phone;
    
    console.log('👤 Registered user details:', { customerEmail, customerName, customerPhone });
    
    // Validate registered user data
    if (!customerEmail || !customerName) {
      throw new ValidationError('User order missing customer information (email or name)', {
        orderId: order.orderId,
        user: order.user
      });
    }
  }

  // Validate critical address fields for both user types
  const requiredFields = ['address', 'city', 'state', 'country', 'phone'];
  const missingFields = requiredFields.filter(field => !order.shippingAddress[field]);

  // Check for postal code (support both postalCode and pincode)
  if (!order.shippingAddress.postalCode && !order.shippingAddress.pincode) {
    missingFields.push('postalCode/pincode');
  }

  if (missingFields.length > 0) {
    throw new ValidationError(`Shipping address missing required fields: ${missingFields.join(', ')}`, {
      orderId: order.orderId,
      userType: order.isGuestOrder ? 'guest' : 'registered',
      shippingAddress: order.shippingAddress,
      missingFields
    });
  }

  // Validate products data
  if (!order.products || order.products.length === 0) {
    throw new ValidationError('Order has no products', {
      orderId: order.orderId
    });
  }

  // CREATE SHIPMENT IN SHIP ROCKET
  console.log('🚀 Creating shipment in ShipRocket...');
  console.log('👤 User Type:', order.isGuestOrder ? 'GUEST' : 'REGISTERED');
  
  try {
    const shipment = await shippingService.createShipment(order, pickupLocation);

    // Better response validation
    if (!shipment || !shipment.shipment_id) {
      console.error('❌ Invalid ShipRocket response:', shipment);
      throw new DatabaseError('ShipRocket returned invalid response', {
        shipRocketResponse: shipment,
        userType: order.isGuestOrder ? 'guest' : 'registered'
      });
    }

    console.log('📦 ShipRocket shipment created:', shipment.shipment_id);
    console.log('✅ Shipment successful for:', order.isGuestOrder ? 'GUEST USER' : 'REGISTERED USER');

    // Shipping document creation for both user types
    const shippingData = {
      orderId: order.orderId,
      order: order._id,
      shipmentId: shipment.shipment_id.toString(),
      userType: order.isGuestOrder ? 'guest' : 'user',
      userId: order.isGuestOrder ? order.guestUser?._id : order.user?._id,
      pickupLocation: pickupLocation,
      shippingStatus: 'pending',
      awbNumber: shipment.awb_code || null,
      courierName: shipment.courier_name || null,
      courierCompanyId: shipment.courier_company_id || null,
      shippingCharges: order.shippingAmount || 0,
      shipRocketResponse: shipment,
      labelUrl: shipment.label_url || null,
      manifestUrl: shipment.manifest_url || null
    };

    // Only add user field for registered users
    if (!order.isGuestOrder && order.user?._id) {
      shippingData.user = order.user._id;
    }

    const shipping = await Shipping.create(shippingData);

    // Update order with comprehensive shipment details
    order.shipmentId = shipment.shipment_id.toString();
    order.shippingStatus = shipment.status || 'pending';
    order.orderStatus = 'confirmed';
    order.awbNumber = shipment.awb_code || null;
    order.courierName = shipment.courier_name || null;
    
    await order.save();

    reply.send({
      success: true,
      message: `Shipment created successfully for ${order.isGuestOrder ? 'guest' : 'registered'} user`,
      data: {
        userType: order.isGuestOrder ? 'guest' : 'registered',
        shipment: {
          shipmentId: shipment.shipment_id,
          orderId: shipment.order_id,
          status: shipment.status,
          awbNumber: shipment.awb_code,
          courierName: shipment.courier_name,
          labelUrl: shipment.label_url,
          manifestUrl: shipment.manifest_url
        },
        shipping: {
          id: shipping._id,
          orderId: shipping.orderId,
          shipmentId: shipping.shipmentId,
          shippingStatus: shipping.shippingStatus,
          awbNumber: shipping.awbNumber,
          userType: shipping.userType
        },
        order: {
          orderId: order.orderId,
          orderStatus: order.orderStatus,
          shippingStatus: order.shippingStatus,
          shipmentId: order.shipmentId,
          isGuestOrder: order.isGuestOrder
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (shipmentError) {
    console.error('❌ ShipRocket API Error:', shipmentError);
    throw new DatabaseError(`ShipRocket API Error: ${shipmentError.message}`, {
      orderId: order.orderId,
      userType: order.isGuestOrder ? 'guest' : 'registered',
      stack: process.env.NODE_ENV === 'development' ? shipmentError.stack : undefined
    });
  }
};

// 🔐 SHIP ROCKET LOGIN ENDPOINT
export const shipRocketLogin = async (req, reply) => {
  const token = await shippingService.authenticate();
  
  reply.send({
    success: true,
    message: 'Ship Rocket login successful',
    token: token.substring(0, 50) + '...'
  });
};

// 🏪 GET PICKUP LOCATIONS ENDPOINT
export const getPickupLocations = async (req, reply) => {
  const locations = await shippingService.getPickupLocations();
  
  reply.send({
    success: true,
    message: 'Pickup locations fetched successfully',
    locations: locations,
    count: locations.length
  });
};

// 🚚 GET COURIER SERVICEABILITY ENDPOINT
export const getCourierServiceability = async (req, reply) => {
  const {
    pickup_postcode,
    delivery_postcode,
    weight,
    length,
    breadth,
    height,
    cod,
    order_id
  } = req.query;

  if (!pickup_postcode || !delivery_postcode || !weight || !length || !breadth || !height) {
    throw new ValidationError('Missing required parameters', {
      required: ['pickup_postcode', 'delivery_postcode', 'weight', 'length', 'breadth', 'height'],
      received: { pickup_postcode, delivery_postcode, weight, length, breadth, height }
    });
  }

  const serviceabilityData = {
    pickup_postcode,
    delivery_postcode,
    weight: parseFloat(weight),
    length: parseFloat(length),
    breadth: parseFloat(breadth),
    height: parseFloat(height),
    cod: cod ? parseFloat(cod) : 0,
    order_id: order_id || ''
  };

  console.log('📦 Checking serviceability for:', serviceabilityData);

  const result = await shippingService.getCourierServiceability(serviceabilityData);

  reply.send({
    success: true,
    message: 'Courier serviceability checked successfully',
    data: result,
    timestamp: new Date().toISOString()
  });
};

// 🚚 GET SERVICEABILITY BY ORDER ID
export const getServiceabilityByOrder = async (req, reply) => {
  const { orderId } = req.params;
  const { pickup_postcode } = req.query;

  const order = await Order.findOne({ orderId })
    .populate('products.product', 'name weight dimensions');

  if (!order) {
    throw new NotFoundError('Order', { orderId });
  }

  let totalWeight = 0;
  let totalValue = 0;

  order.products.forEach(item => {
    const productWeight = item.product?.weight || 0.5;
    totalWeight += productWeight * item.quantity;
    totalValue += item.price * item.quantity;
  });

  const dimensions = {
    length: 10,
    breadth: 15,
    height: 20
  };

  const pickupPostcode = pickup_postcode || '400001';
  const deliveryPostcode = order.shippingAddress.postalCode || order.shippingAddress.pincode;

  if (!deliveryPostcode) {
    throw new ValidationError('Order shipping address missing postal code', {
      orderId: order.orderId,
      shippingAddress: order.shippingAddress
    });
  }

  const serviceabilityData = {
    pickup_postcode: pickupPostcode,
    delivery_postcode: deliveryPostcode,
    weight: totalWeight || 0.5,
    length: dimensions.length,
    breadth: dimensions.breadth,
    height: dimensions.height,
    cod: order.paymentMethod === 'cod' ? order.finalAmount : 0,
    order_id: orderId
  };

  console.log('📦 Auto serviceability check for order:', orderId, serviceabilityData);

  const result = await shippingService.getCourierServiceability(serviceabilityData);

  reply.send({
    success: true,
    message: 'Serviceability checked successfully',
    order: {
      orderId: order.orderId,
      totalWeight,
      totalValue,
      deliveryPostcode
    },
    serviceability: result,
    timestamp: new Date().toISOString()
  });
};

// 📦 GET ORDER SHIPMENT DETAILS FOR ADMIN
export const getOrderShipment = async (req, reply) => {
  const { orderId } = req.params;

  console.log('🔍 Admin fetching shipment for order:', orderId);

  if (!orderId || orderId === 'undefined' || orderId === 'null') {
    throw new ValidationError('Order ID is required', {
      field: 'orderId'
    });
  }

  const order = await Order.findOne({ orderId })
    .populate('user', 'name email phone')
    .populate('guestUser', 'name email phone')
    .populate('products.product', 'name sku price weight dimensions');

  if (!order) {
    throw new NotFoundError('Order', { orderId });
  }

  const shipping = await Shipping.findOne({ orderId: order.orderId });

  if (!shipping) {
    throw new NotFoundError('Shipment', { 
      orderId: order.orderId,
      message: 'No shipment found for this order',
      order: {
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        hasShipment: !!order.shipmentId
      }
    });
  }

  const response = {
    success: true,
    message: 'Shipment details retrieved successfully',
    data: {
      order: {
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        orderDate: order.createdAt,
        isGuestOrder: order.isGuestOrder,
        customer: order.isGuestOrder ? order.guestUser : order.user,
        totalAmount: order.totalAmount,
        paymentMethod: order.paymentMethod,
        shippingAddress: order.shippingAddress
      },
      shipment: {
        id: shipping._id,
        shipmentId: shipping.shipmentId,
        orderId: shipping.orderId,
        userType: shipping.userType,
        shippingStatus: shipping.shippingStatus,
        awbNumber: shipping.awbNumber,
        courierName: shipping.courierName,
        courierCompanyId: shipping.courierCompanyId,
        shippingCharges: shipping.shippingCharges,
        labelUrl: shipping.labelUrl,
        manifestUrl: shipping.manifestUrl,
        pickupLocation: shipping.pickupLocation,
        createdAt: shipping.createdAt,
        updatedAt: shipping.updatedAt
      },
      products: order.products.map(item => ({
        name: item.product?.name || item.name,
        sku: item.product?.sku || 'N/A',
        quantity: item.quantity,
        price: item.price,
        total: item.price * item.quantity
      }))
    },
    timestamp: new Date().toISOString()
  };

  if (shipping.awbNumber) {
    try {
      const trackingDetails = await shippingService.getTrackingDetails(shipping.awbNumber);
      response.data.tracking = trackingDetails;
    } catch (trackingError) {
      console.log('⚠️ Could not fetch tracking details:', trackingError.message);
      response.data.tracking = {
        available: false,
        message: 'Tracking details not available'
      };
    }
  }

  reply.send(response);
};

// 📋 GET ALL SHIPMENTS (ADMIN) - FIXED PAGINATION
export const getAllShipments = async (req, reply) => {
  const {
    page = 1,
    limit = 100,
    status,
    userType,
    startDate,
    endDate,
    search
  } = req.query;

  console.log('📋 Admin fetching all shipments with filters:', {
    page, limit, status, userType, startDate, endDate, search
  });

  // ADD DEBUG: Check total shipments in database
  const totalAllShipments = await Shipping.countDocuments({});
  console.log('🔍 DEBUG - Total shipments in database:', totalAllShipments);

  // ADD DEBUG: Check sample shipment
  const sampleShipment = await Shipping.findOne({});
  console.log('🔍 DEBUG - Sample shipment:', sampleShipment);

  // Build filter object
  const filter = {};

  if (status && status !== 'all') {
    filter.shippingStatus = status;
  }

  if (userType && userType !== 'all') {
    filter.userType = userType;
  }

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) {
      filter.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      filter.createdAt.$lte = new Date(endDate);
    }
  }

  if (search) {
    filter.$or = [
      { orderId: { $regex: search, $options: 'i' } },
      { shipmentId: { $regex: search, $options: 'i' } },
      { awbNumber: { $regex: search, $options: 'i' } }
    ];
  }

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const shipments = await Shipping.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum)
    .populate('user', 'name email')
    .populate('order', 'orderId totalAmount paymentMethod');

  const total = await Shipping.countDocuments(filter);
  const totalPages = Math.ceil(total / limitNum);

  console.log('🔍 DEBUG - Found shipments:', shipments.length);
  console.log('🔍 DEBUG - Total shipments matching filter:', total);

  const transformedShipments = shipments.map(shipment => ({
    id: shipment._id,
    orderId: shipment.orderId,
    shipmentId: shipment.shipmentId,
    userType: shipment.userType,
    shippingStatus: shipment.shippingStatus,
    awbNumber: shipment.awbNumber,
    courierName: shipment.courierName,
    courierCompanyId: shipment.courierCompanyId,
    shippingCharges: shipment.shippingCharges,
    createdAt: shipment.createdAt,
    customer: shipment.user ? {
      name: shipment.user.name,
      email: shipment.user.email
    } : { name: 'Guest Customer', email: 'guest@example.com' },
    order: shipment.order ? {
      orderId: shipment.order.orderId,
      totalAmount: shipment.order.totalAmount,
      paymentMethod: shipment.order.paymentMethod
    } : null
  }));

  reply.send({
    success: true,
    message: 'Shipments retrieved successfully',
    data: {
      shipments: transformedShipments,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalShipments: total,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      },
      filters: {
        status,
        userType,
        startDate,
        endDate,
        search
      }
    },
    timestamp: new Date().toISOString()
  });
};

// 📊 GET SHIPMENT STATISTICS (ADMIN DASHBOARD)
export const getShipmentStatistics = async (req, reply) => {
  const { period = '30d' } = req.query;

  console.log('📊 Fetching shipment statistics for period:', period);

  const now = new Date();
  let startDate = new Date();

  switch (period) {
    case '7d':
      startDate.setDate(now.getDate() - 7);
      break;
    case '90d':
      startDate.setDate(now.getDate() - 90);
      break;
    case '1y':
      startDate.setFullYear(now.getFullYear() - 1);
      break;
    default:
      startDate.setDate(now.getDate() - 30);
  }

  const totalShipments = await Shipping.countDocuments();
  const periodShipments = await Shipping.countDocuments({
    createdAt: { $gte: startDate }
  });

  const statusStats = await Shipping.aggregate([
    {
      $group: {
        _id: '$shippingStatus',
        count: { $sum: 1 }
      }
    }
  ]);

  const userTypeStats = await Shipping.aggregate([
    {
      $group: {
        _id: '$userType',
        count: { $sum: 1 }
      }
    }
  ]);

  const dailyStats = await Shipping.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$createdAt'
          }
        },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);

  const revenueStats = await Shipping.aggregate([
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$shippingCharges' }
      }
    }
  ]);

  const statistics = {
    overview: {
      totalShipments,
      periodShipments,
      totalRevenue: revenueStats[0]?.totalRevenue || 0
    },
    byStatus: statusStats.reduce((acc, stat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {}),
    byUserType: userTypeStats.reduce((acc, stat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {}),
    daily: dailyStats,
    period: {
      start: startDate,
      end: now,
      label: period
    }
  };

  reply.send({
    success: true,
    message: 'Shipment statistics retrieved successfully',
    data: statistics,
    timestamp: new Date().toISOString()
  });
};

// 📍 TRACK SHIPMENT BY SHIPMENT ID
export const trackShipmentById = async (req, reply) => {
  const { shipmentId } = req.params;

  console.log('📍 Tracking shipment by ID:', shipmentId);

  if (!shipmentId || shipmentId === 'undefined' || shipmentId === 'null') {
    throw new ValidationError('Shipment ID is required', {
      field: 'shipmentId'
    });
  }

  const trackingDetails = await shippingService.trackShipmentById(shipmentId);

  reply.send({
    success: true,
    message: 'Shipment tracking details retrieved successfully',
    data: {
      shipmentId: shipmentId,
      tracking: trackingDetails
    },
    timestamp: new Date().toISOString()
  });
};

// 🚫 CANCEL SHIPMENT ENDPOINT - FIXED
export const cancelShipment = async (req, reply) => {
  const { orderId } = req.params;
  const { cancellationReason = 'Order cancelled by admin' } = req.body;

  console.log('🚫 Cancelling shipment for order:', orderId);

  // Find order and shipping details
  const order = await Order.findOne({ orderId });
  if (!order) {
    throw new NotFoundError('Order', { orderId });
  }

  // Check if shipment exists
  const shipping = await Shipping.findOne({ orderId: order.orderId });
  if (!shipping) {
    throw new NotFoundError('Shipment', { 
      orderId: order.orderId,
      message: 'No shipment found for this order'
    });
  }

  console.log('🔍 Shipment found:', {
    shipmentId: shipping.shipmentId,
    shiprocketOrderId: shipping.shipRocketResponse?.order_id,
    shippingStatus: shipping.shippingStatus
  });

  // Pass the complete shipping document to access shipRocketResponse
  const shiprocketResult = await shippingService.cancelShipment(shipping);

  // Update local database
  shipping.shippingStatus = 'cancelled';
  shipping.cancellationReason = cancellationReason;
  shipping.cancelledAt = new Date();
  shipping.cancelledBy = req.user?._id;
  await shipping.save();

  // Update order status
  order.shippingStatus = 'cancelled';
  order.orderStatus = 'cancelled';
  await order.save();

  reply.send({
    success: true,
    message: 'Shipment cancelled successfully',
    data: {
      order: {
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        shippingStatus: order.shippingStatus
      },
      shipment: {
        shipmentId: shipping.shipmentId,
        shiprocketOrderId: shipping.shipRocketResponse?.order_id,
        shippingStatus: shipping.shippingStatus,
        cancellationReason: shipping.cancellationReason,
        cancelledAt: shipping.cancelledAt
      },
      shiprocket: shiprocketResult
    },
    timestamp: new Date().toISOString()
  });
};