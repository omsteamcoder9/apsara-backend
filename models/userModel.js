// models/userModel.js
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: function() {
      return !this.isGuest; // Password required only for non-guest users
    }
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'guest'],
    default: 'user'
  },
  isGuest: {
    type: Boolean,
    default: false
  },
  phone: {
    type: String,
    trim: true
  },
  // ADDED: Password reset fields
  resetPasswordToken: {
    type: String,
    default: null
  },
  resetPasswordExpires: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Virtual for displaying user type
userSchema.virtual('userType').get(function() {
  return this.isGuest ? 'guest' : 'registered';
});

// Method to check if user is guest
userSchema.methods.isGuestUser = function() {
  return this.isGuest || this.role === 'guest';
};

// Method to set reset token
userSchema.methods.setResetToken = function(token) {
  this.resetPasswordToken = token;
  this.resetPasswordExpires = Date.now() + 3600000; // 1 hour from now
  return this.save();
};

// Method to clear reset token
userSchema.methods.clearResetToken = function() {
  this.resetPasswordToken = undefined;
  this.resetPasswordExpires = undefined;
  return this.save();
};

// Method to check if reset token is valid
userSchema.methods.isResetTokenValid = function() {
  return this.resetPasswordToken && this.resetPasswordExpires > Date.now();
};

// Transform output to include user type information
userSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    ret.userType = doc.isGuest ? 'guest' : 'registered';
    // Remove sensitive fields from JSON output for security
    delete ret.password;
    delete ret.resetPasswordToken;
    delete ret.resetPasswordExpires;
    return ret;
  }
});

export default mongoose.model('User', userSchema);