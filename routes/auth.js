// routes/authRoutes.js
import { register, login, getProfile, forgotPassword, resetPassword } from '../controller/authcontroller.js';
import { protect } from '../middleware/authMiddleware.js';

export default async function authRoutes(fastify, opts) {
  fastify.post('/register', register);
  fastify.post('/login', login);
  fastify.get('/profile', { preHandler: [protect] }, getProfile);
  // fastify.post('/set-guest-password', setGuestPassword);
  fastify.post('/forgot-password', forgotPassword);
  fastify.post('/reset-password', resetPassword);
}