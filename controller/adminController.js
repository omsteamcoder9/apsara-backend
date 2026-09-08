// controllers/adminController.js
import User from '../models/userModel.js';
import { ValidationError, NotFoundError, ConflictError } from '../utils/errors.js';
import mongoose from 'mongoose';

/**
 * Admin: get all users (optionally filter role)
 */
export const getAllUsers = async (req, reply) => {
  // ✅ NO try-catch
  const { role } = req.query;
  const filter = {};
  if (role) filter.role = role;
  
  const users = await User.find(filter).select('-password');
  return reply.send(users);
};

/**
 * Admin: edit a user (name, email, role, active)
 */
export const editUser = async (req, reply) => {
  // ✅ NO try-catch
  const { id } = req.params;
  const { name, email, role, active } = req.body;

  // Validate ID
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError('Invalid user ID', { id });
  }

  const target = await User.findById(id);
  if (!target) {
    throw new NotFoundError('User', { id });
  }

  // Only allow allowed fields
  if (name !== undefined) target.name = name;
  if (email !== undefined) target.email = email;
  if (role !== undefined) target.role = role;
  if (active !== undefined) target.active = active;

  await target.save();
  
  return reply.send({ 
    message: 'User updated', 
    user: { 
      id: target._id, 
      name: target.name, 
      email: target.email, 
      role: target.role, 
      active: target.active 
    } 
  });
};

/**
 * Admin: delete a user (permanent)
 */
export const deleteUser = async (req, reply) => {
  // ✅ NO try-catch
  const { id } = req.params;

  // Validate ID
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError('Invalid user ID', { id });
  }

  const user = await User.findById(id);
  if (!user) {
    throw new NotFoundError('User', { id });
  }

  // Prevent deleting yourself? (optional)
  if (user._id.toString() === req.user.userId) {
    throw new ConflictError('Cannot delete your own account');
  }

  await User.deleteOne({ _id: id });
  
  return reply.send({ message: 'User permanently deleted' });
};

/**
 * Admin: deactivate a user (soft-delete)
 */
export const deactivateUser = async (req, reply) => {
  // ✅ NO try-catch
  const { id } = req.params;

  // Validate ID
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError('Invalid user ID', { id });
  }

  const user = await User.findById(id);
  if (!user) {
    throw new NotFoundError('User', { id });
  }

  // Prevent deactivating yourself? (optional)
  if (user._id.toString() === req.user.userId) {
    throw new ConflictError('Cannot deactivate your own account');
  }

  user.active = false;
  await user.save();
  
  return reply.send({ message: 'User deactivated' });
};