// controllers/authController.js
import User from '../models/userModel.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { sendRegistrationEmail, sendPasswordResetEmail, sendPasswordResetConfirmation } from '../controller/emailController.js';
import { 
  ValidationError, 
  AuthenticationError, 
  NotFoundError, 
  ConflictError,
  DatabaseError 
} from '../utils/errors.js';

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '365d',
  });
};

// Register User
export const register = async (req, reply) => {
  const { name, email, password } = req.body;

  // Validate required fields
  if (!name || !email || !password) {
    throw new ValidationError('Please provide name, email and password', {
      fields: { name: !!name, email: !!email, password: !!password }
    });
  }

  // Check if user exists
  const userExists = await User.findOne({ email });
  if (userExists) {
    throw new ConflictError('User already exists', { email });
  }

  // Create user
  const user = await User.create({
    name,
    email,
    password: await bcrypt.hash(password, 10)
  });

  if (user) {
    const token = generateToken(user._id);
    
    // Send registration email (non-critical - don't fail if email fails)
    try {
      await sendRegistrationEmail(user);
      console.log('✅ Registration email sent to:', user.email);
    } catch (emailError) {
      console.error('❌ Registration email failed:', emailError);
      // Don't throw error, just log it since registration was successful
    }

    reply.status(201).send({
      success: true,
      message: 'User registered successfully',
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token
      }
    });
  }
};

// Login User
export const login = async (req, reply) => {
  const { email, password } = req.body;

  // Validate required fields
  if (!email || !password) {
    throw new ValidationError('Please provide email and password', {
      fields: { email: !!email, password: !!password }
    });
  }

  // Check if user exists and password is correct
  const user = await User.findOne({ email });
  
  if (user && (await bcrypt.compare(password, user.password))) {
    const token = generateToken(user._id);
    
    reply.send({
      success: true,
      message: 'Login successful',
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token
      }
    });
  } else {
    throw new AuthenticationError('Invalid email or password');
  }
};

// Get User Profile
export const getProfile = async (req, reply) => {
  const user = await User.findById(req.user._id).select('-password');
  
  if (!user) {
    throw new NotFoundError('User', { userId: req.user._id });
  }
  
  reply.send({
    success: true,
    data: user
  });
};

// ============================================
// COMMENTED OUT - Guest Password Function
// ============================================
// export const setGuestPassword = async (req, reply) => {
//   const { email, password } = req.body;

//   // Validate input
//   if (!email || !password) {
//     throw new ValidationError('Please provide email and password', {
//       fields: { email: !!email, password: !!password }
//     });
//   }

//   if (password.length < 6) {
//     throw new ValidationError('Password must be at least 6 characters long', {
//       field: 'password',
//       minLength: 6
//     });
//   }

//   // Find the guest user by email
//   const user = await User.findOne({ email });
  
//   if (!user) {
//     throw new NotFoundError('User', { email });
//   }

//   // Check if user is a guest (based on role or isGuest field)
//   if (user.role !== 'guest') {
//     throw new ConflictError('This user is already a registered user', {
//       email,
//       currentRole: user.role
//     });
//   }

//   // Check if password already set (optional security check)
//   if (user.password && user.password !== '') {
//     throw new ConflictError('Password already set for this user', { email });
//   }

//   // Hash the password using bcrypt
//   const hashedPassword = await bcrypt.hash(password, 10);

//   // Update the user with the new hashed password and change role
//   user.password = hashedPassword;
//   user.role = 'user'; // Convert guest to regular user
//   user.updatedAt = new Date();
  
//   await user.save();

//   // Generate token for immediate login (optional)
//   const token = generateToken(user._id);

//   reply.status(200).send({
//     success: true,
//     message: 'Password set successfully! You are now a registered user.',
//     data: {
//       _id: user._id,
//       name: user.name,
//       email: user.email,
//       role: user.role,
//       token
//     }
//   });
// };

// Forgot Password - Send Reset Email
export const forgotPassword = async (req, reply) => {
  const { email } = req.body;

  // Validate email
  if (!email) {
    throw new ValidationError('Please provide an email address', { field: 'email' });
  }

  // Check if user exists
  const user = await User.findOne({ email });
  
  // Always return success even if user doesn't exist (for security)
  if (!user) {
    return reply.send({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent'
    });
  }

  // Generate reset token (valid for 1 hour)
  const resetToken = jwt.sign(
    { id: user._id, type: 'password_reset' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Create reset URL - get first origin from allowed origins
  const baseUrl = process.env.ALLOWED_ORIGINS?.split(',')[0];
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
  console.log('✅ Reset URL:', resetUrl);
  
  // Send reset email (critical - fail if email fails)
  try {
    await sendPasswordResetEmail(user, resetUrl);
    console.log('✅ Password reset email sent to:', user.email);
  } catch (emailError) {
    console.error('❌ Password reset email failed:', emailError);
    throw new DatabaseError('Failed to send reset email. Please try again.');
  }

  reply.send({
    success: true,
    message: 'If an account with that email exists, a password reset link has been sent'
  });
};

// Reset Password - Validate token and set new password
export const resetPassword = async (req, reply) => {
  const { token, newPassword } = req.body;

  // Validate input
  if (!token || !newPassword) {
    throw new ValidationError('Reset token and new password are required', {
      fields: { token: !!token, newPassword: !!newPassword }
    });
  }

  if (newPassword.length < 6) {
    throw new ValidationError('Password must be at least 6 characters long', {
      field: 'newPassword',
      minLength: 6
    });
  }

  // Verify reset token
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if token is a password reset token
    if (decoded.type !== 'password_reset') {
      throw new ValidationError('Invalid token type');
    }
  } catch (tokenError) {
    throw new ValidationError('Invalid or expired reset token. Please request a new password reset.');
  }

  // Find user
  const user = await User.findById(decoded.id);
  if (!user) {
    throw new NotFoundError('User', { userId: decoded.id });
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  // Update user password
  user.password = hashedPassword;
  user.updatedAt = new Date();
  
  await user.save();

  // Send confirmation email (non-critical - don't fail if email fails)
  try {
    await sendPasswordResetConfirmation(user);
    console.log('✅ Password reset confirmation sent to:', user.email);
  } catch (emailError) {
    console.error('❌ Password reset confirmation email failed:', emailError);
    // Don't fail the request if confirmation email fails
  }

  reply.send({
    success: true,
    message: 'Password has been reset successfully. You can now login with your new password.'
  });
};