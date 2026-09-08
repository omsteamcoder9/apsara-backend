// routes/statsRoutes.js
import {
  getComprehensiveStats,
  getDashboardStats,
  getSalesAnalytics,
  getUserAnalytics
} from '../controller/statsController.js';

export default async function statsRoutes(fastify, opts) {
  // 📊 Stats routes
  fastify.get('/', getComprehensiveStats);
  fastify.get('/dashboard', getDashboardStats);
  fastify.get('/sales-analytics', getSalesAnalytics);
  fastify.get('/user-analytics', getUserAnalytics);
}