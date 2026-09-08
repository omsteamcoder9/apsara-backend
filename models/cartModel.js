// models/cartModel.js
import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  
  // ✅ Store the ACTUAL price paid (either basePrice, variant.price, or size-specific price)
  price: {
    type: Number,
    required: true,
    min: 0
  },
  
  // ✅ Store which variant was selected (if any)
  variantId: {
    type: String,
    default: null
  },
  
  // ✅ Also store variant name for display
  variantName: {
    type: String,
    default: ''
  },
  
  // ✅ Store variant images for display in cart
  variantImages: {
    type: [String],
    default: []
  },
  
  // ✅ Store all available sizes for this variant/product with prices
  variantSizes: {
    type: [{
      size: {
        type: String,
        required: true,
        trim: true
        // ✅ No enum - supports both 'M' and '28', '30', etc.
      },
      price: {
        type: Number,
        default: null
      }
    }],
    default: []
  },
  
  // ✅ Store the specific size selected by the user (supports both letter and numeric)
  selectedSize: {
    type: String,
    default: '',
    trim: true
    // ✅ No enum - supports both 'M' and '28', '30', etc.
  },
  
  // ✅ Store the price for the selected size (if different from base)
  selectedSizePrice: {
    type: Number,
    default: null
  },
  
  // ✅ For backward compatibility with colors
  selectedColor: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  items: [cartItemSchema],
  totalItems: {
    type: Number,
    default: 0
  },
  totalPrice: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// ✅ Calculate totals before saving
cartSchema.pre('save', function() {
  this.totalItems = this.items.reduce((total, item) => total + item.quantity, 0);
  this.totalPrice = this.items.reduce((total, item) => total + (item.price * item.quantity), 0);
});

// ✅ Also calculate totals on update (findOneAndUpdate, etc.)
cartSchema.pre('findOneAndUpdate', function() {
  const update = this.getUpdate();
  if (update.$set && update.$set.items) {
    const items = update.$set.items;
    update.$set.totalItems = items.reduce((total, item) => total + item.quantity, 0);
    update.$set.totalPrice = items.reduce((total, item) => total + (item.price * item.quantity), 0);
  }
});

const Cart = mongoose.model('Cart', cartSchema);
export default Cart;