// controllers/userController.js
import User from '../models/userModel.js';
import { NotFoundError } from '../utils/errors.js';

/**
 * Get profile for current logged-in user
 */
export const getProfile = async (req, reply) => {
  const userId = req.user.id;
  const user = await User.findById(userId).select('-password');
  
  if (!user) {
    throw new NotFoundError('User', { userId });
  }
  
  return reply.send(user);
};