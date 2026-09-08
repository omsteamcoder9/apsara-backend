// controllers/statsController.js
import Order from '../models/orderModel.js';
import User from '../models/userModel.js';
import Product from '../models/productModel.js';
import Cart from '../models/cartModel.js';
import GuestUser from '../models/guestUserModel.js';
import Shipping from '../models/shippingModel.js';
import { DatabaseError } from '../utils/errors.js';

// 📊 Get comprehensive stats
export const getComprehensiveStats = async (req, reply) => {
  // Execute all queries in parallel for better performance
  const [
    totalOrders,
    totalUsers,
    totalProducts,
    totalCarts,
    totalGuestUsers,
    totalShipping,
    revenueStats,
    orderStatusStats,
    paymentStats,
    shippingStats,
    recentOrders,
    lowStockProducts
  ] = await Promise.all([
    // Basic counts
    Order.countDocuments(),
    User.countDocuments(),
    Product.countDocuments(),
    Cart.countDocuments(),
    GuestUser.countDocuments(),
    Shipping.countDocuments(),

    // Revenue stats
    Order.aggregate([
      {
        $match: {
          paymentStatus: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$finalAmount' },
          avgOrderValue: { $avg: '$finalAmount' },
          maxOrderValue: { $max: '$finalAmount' },
          minOrderValue: { $min: '$finalAmount' }
        }
      }
    ]),

    // Order status breakdown
    Order.aggregate([
      {
        $group: {
          _id: '$orderStatus',
          count: { $sum: 1 }
        }
      }
    ]),

    // Payment method stats
    Order.aggregate([
      {
        $group: {
          _id: '$paymentMethod',
          count: { $sum: 1 },
          totalAmount: { $sum: '$finalAmount' }
        }
      }
    ]),

    // Shipping status stats
    Shipping.aggregate([
      {
        $group: {
          _id: '$shippingStatus',
          count: { $sum: 1 }
        }
      }
    ]),

    // Recent orders (last 7 days)
    Order.find({
      createdAt: {
        $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      }
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('user', 'name email')
      .populate('guestUser', 'name email')
      .select('orderId finalAmount orderStatus createdAt'),

    // Low stock products
    Product.find({ stock: { $lt: 10 } })
      .sort({ stock: 1 })
      .limit(10)
      .select('name stock price sNo')
  ]);

  // Process the results
  const revenueData = revenueStats[0] || {
    totalRevenue: 0,
    avgOrderValue: 0,
    maxOrderValue: 0,
    minOrderValue: 0
  };

  const orderStatusData = {};
  orderStatusStats.forEach(stat => {
    orderStatusData[stat._id] = stat.count;
  });

  const paymentData = {};
  paymentStats.forEach(stat => {
    paymentData[stat._id] = {
      count: stat.count,
      totalAmount: stat.totalAmount
    };
  });

  const shippingData = {};
  shippingStats.forEach(stat => {
    shippingData[stat._id] = stat.count;
  });

  // Calculate today's revenue
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const todayRevenue = await Order.aggregate([
    {
      $match: {
        paymentStatus: 'completed',
        createdAt: {
          $gte: todayStart,
          $lte: todayEnd
        }
      }
    },
    {
      $group: {
        _id: null,
        amount: { $sum: '$finalAmount' }
      }
    }
  ]);

  // Monthly revenue trend (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const monthlyRevenue = await Order.aggregate([
    {
      $match: {
        paymentStatus: 'completed',
        createdAt: { $gte: sixMonthsAgo }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        },
        revenue: { $sum: '$finalAmount' },
        orders: { $sum: 1 }
      }
    },
    {
      $sort: { '_id.year': 1, '_id.month': 1 }
    }
  ]);

  // User registration trend (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const userRegistrations = await User.aggregate([
    {
      $match: {
        createdAt: { $gte: thirtyDaysAgo }
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

  // Prepare final response
  const stats = {
    overview: {
      totalOrders,
      totalUsers,
      totalProducts,
      totalCarts,
      totalGuestUsers,
      totalShippingRecords: totalShipping,
      todayRevenue: todayRevenue[0]?.amount || 0
    },
    financial: {
      totalRevenue: revenueData.totalRevenue,
      averageOrderValue: Math.round(revenueData.avgOrderValue * 100) / 100,
      maxOrderValue: revenueData.maxOrderValue,
      minOrderValue: revenueData.minOrderValue,
      monthlyRevenueTrend: monthlyRevenue
    },
    orders: {
      statusBreakdown: orderStatusData,
      paymentMethods: paymentData,
      recentOrders: recentOrders,
      ordersLast7Days: recentOrders.length
    },
    shipping: {
      statusBreakdown: shippingData
    },
    products: {
      lowStock: lowStockProducts,
      lowStockCount: lowStockProducts.length
    },
    users: {
      registrationTrend: userRegistrations
    },
    timestamp: new Date().toISOString()
  };

  reply.send({
    success: true,
    data: stats,
    message: 'Stats retrieved successfully'
  });
};

// 📈 Get simplified dashboard stats (for widgets)
export const getDashboardStats = async (req, reply) => {
  const [
    totalOrders,
    totalRevenue,
    totalUsers,
    pendingOrders,
    todayOrders,
    lowStockCount
  ] = await Promise.all([
    Order.countDocuments(),
    Order.aggregate([
      { $match: { paymentStatus: 'completed' } },
      { $group: { _id: null, total: { $sum: '$finalAmount' } } }
    ]),
    User.countDocuments(),
    Order.countDocuments({ orderStatus: 'pending' }),
    Order.countDocuments({
      createdAt: { 
        $gte: new Date(new Date().setHours(0, 0, 0, 0)) 
      }
    }),
    Product.countDocuments({ stock: { $lt: 10 } })
  ]);

  reply.send({
    success: true,
    data: {
      totalOrders,
      totalRevenue: totalRevenue[0]?.total || 0,
      totalUsers,
      pendingOrders,
      todayOrders,
      lowStockCount
    }
  });
};

// 📊 Get sales analytics with date range
export const getSalesAnalytics = async (req, reply) => {
  const { startDate, endDate } = req.query;
  
  let dateFilter = {};
  if (startDate && endDate) {
    dateFilter.createdAt = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  } else {
    // Default to last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    dateFilter.createdAt = { $gte: thirtyDaysAgo };
  }

  const salesData = await Order.aggregate([
    {
      $match: {
        ...dateFilter,
        paymentStatus: 'completed'
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
        revenue: { $sum: '$finalAmount' },
        orders: { $sum: 1 },
        averageOrderValue: { $avg: '$finalAmount' }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);

  reply.send({
    success: true,
    data: salesData,
    message: 'Sales analytics retrieved successfully'
  });
};

// 👥 Get user analytics
export const getUserAnalytics = async (req, reply) => {
  const [userStats, guestUserStats, userRegistrations] = await Promise.all([
    // User role breakdown
    User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]),
    
    // Guest user stats
    GuestUser.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          withOrders: {
            $sum: {
              $cond: [{ $ifNull: ['$orders', false] }, 1, 0]
            }
          }
        }
      }
    ]),
    
    // User registration trend (last 90 days)
    User.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
          }
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
    ])
  ]);

  const roleBreakdown = {};
  userStats.forEach(stat => {
    roleBreakdown[stat._id] = stat.count;
  });

  reply.send({
    success: true,
    data: {
      roleBreakdown,
      guestUsers: guestUserStats[0] || { total: 0, withOrders: 0 },
      registrationTrend: userRegistrations
    },
    message: 'User analytics retrieved successfully'
  });
};