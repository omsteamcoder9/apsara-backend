// appfolder/routes/user.js
import { getProfile } from '../controller/userController.js';
import { protect } from '../middleware/auth.js';

export default async function userRoutes(fastify, opts) {
  fastify.get('/me', { preHandler: [protect] }, getProfile);
}