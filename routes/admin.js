// routes/admin.js
import { getAllUsers, editUser, deleteUser, deactivateUser } from '../controller/adminController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

export default async function adminRoutes(fastify, opts) {
  // ✅ Use preHandler array for each route
  fastify.get('/users', { preHandler: [protect, admin] }, getAllUsers);
  fastify.put('/users/:id', { preHandler: [protect, admin] }, editUser);
  fastify.delete('/users/:id', { preHandler: [protect, admin] }, deleteUser);
  fastify.patch('/users/:id/deactivate', { preHandler: [protect, admin] }, deactivateUser);
}