// middleware/authMiddleware.js
import jwt from 'jsonwebtoken';
import User from '../models/userModel.js';
import { AuthenticationError, AuthorizationError, NotFoundError } from '../utils/errors.js';

export const protect = async (req, reply) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    throw new AuthenticationError('Not authorized to access this route');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    
    if (!req.user) {
      throw new NotFoundError('User', { userId: decoded.id });
    }
    
    return; // Continue to next handler
  } catch (error) {
    // If it's already our custom error, re-throw it
    if (error instanceof AuthenticationError || error instanceof NotFoundError) {
      throw error;
    }
    // Otherwise, it's a JWT error
    throw new AuthenticationError('Not authorized to access this route');
  }
};

// ✅ Admin middleware
export const admin = (req, reply) => {
  if (req.user && req.user.role === 'admin') {
    return; // Continue to next handler
  } else {
    throw new AuthorizationError('Access denied. Admin privileges required.');
  }
};

// ✅ Role-based middleware generator
export const authorize = (...roles) => {
  return (req, reply) => {
    if (!req.user) {
      throw new AuthenticationError('Not authorized to access this route');
    }

    if (!roles.includes(req.user.role)) {
      throw new AuthorizationError(
        `User role ${req.user.role} is not authorized to access this route`
      );
    }

    return; // Continue to next handler
  };
};

// ✅ Combined protect + admin middleware
export const protectAndAdmin = [protect, admin];