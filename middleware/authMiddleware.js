// middleware/authMiddleware.js
import jwt from 'jsonwebtoken';
import User from '../models/userModel.js';
import { AuthenticationError, AuthorizationError, NotFoundError } from '../utils/errors.js';

// ✅ FIXED: Protect middleware with proper return
export const protect = async (req, reply) => {
  let token;

  // Check for token in Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    throw new AuthenticationError('Not authorized to access this route');
  }

  // Verify token
  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  // Find user
  const user = await User.findById(decoded.id).select('-password');
  
  if (!user) {
    throw new NotFoundError('User', { userId: decoded.id });
  }

  // Attach user to request
  req.user = user;
  return; // ✅ Continue to next handler
};

// ✅ FIXED: Admin middleware
export const admin = async (req, reply) => {
  if (!req.user) {
    throw new AuthenticationError('Not authorized to access this route');
  }

  if (req.user.role !== 'admin') {
    throw new AuthorizationError('Access denied. Admin privileges required.');
  }

  return; // ✅ Continue to next handler
};

// ✅ FIXED: Role-based middleware
export const authorize = (...roles) => {
  return async (req, reply) => {
    if (!req.user) {
      throw new AuthenticationError('Not authorized to access this route');
    }

    if (!roles.includes(req.user.role)) {
      throw new AuthorizationError(
        `User role ${req.user.role} is not authorized to access this route`
      );
    }

    return; // ✅ Continue to next handler
  };
};

// ✅ Combined protect + admin middleware for routes
export const protectAndAdmin = [protect, admin];