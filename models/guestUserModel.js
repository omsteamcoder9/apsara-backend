import mongoose from 'mongoose';

const guestUserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

const GuestUser = mongoose.model('GuestUser', guestUserSchema);
export default GuestUser;