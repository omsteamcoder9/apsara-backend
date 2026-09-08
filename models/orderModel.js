// models/Order.js
import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema(
  {
    // ✅ S.No Field
    sNo: {
      type: Number,
      unique: true,
      index: true
    },

    // 🧑 Registered User (optional)
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },

    // 👤 Guest user reference (optional)
    guestUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GuestUser',
      required: false,
    },

    // 🚀 Unique order identifier (AUTO-GENERATED - not required)
    orderId: {
      type: String,
      unique: true,
      required: false,
    },

    // 💳 Payment fields
    razorpayOrderId: { type: String },
    paymentId: { type: String },
    paymentSignature: { type: String },

    // 🛒 Ordered products - WITH SIZE-SPECIFIC PRICING
    products: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
          required: true,
        },
        variantId: {
          type: String,
          default: null
        },
        variantName: {
          type: String,
          default: ''
        },
        // ✅ Sizes with prices - SUPPORTS BOTH LETTER AND NUMERIC SIZES
        variantSizes: {
          type: [{
            size: {
              type: String,
              required: true,
              trim: true
              // ✅ No enum - supports 'M' and '28', '30', etc.
            },
            price: {
              type: Number,
              default: null
            }
          }],
          default: []
        },
        // ✅ Selected size - SUPPORTS BOTH LETTER AND NUMERIC SIZES
        selectedSize: {
          type: String,
          default: '',
          trim: true
          // ✅ No enum - supports 'M' and '28', '30', etc.
        },
        selectedSizePrice: {
          type: Number,
          default: null
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        price: {
          type: Number,
          required: true,
        },
        originalPrice: {
          type: Number
        },
        discountPercentage: {
          type: Number,
          default: 0
        },
        name: { 
          type: String,
          required: true 
        },
        image: {
          type: String,
          default: ''
        },
        sku: {
          type: String,
          default: ''
        }
      },
    ],

    // 📦 Shipping details
    shippingAddress: {
      firstName: { type: String },
      lastName: { type: String },
      fullName: { type: String },
      address: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String },
      postalCode: { type: String, required: true },
      country: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String }
    },

    // 💰 Payment info
    paymentMethod: {
      type: String,
      enum: ['razorpay', 'stripe', 'cod', 'paypal'],
      required: true,
      default: 'cod',
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded', 'partially_refunded'],
      default: 'pending',
    },

    // 📊 Amount breakdown
    subtotal: {
      type: Number, 
      required: true,
      default: 0
    },
    discountAmount: {
      type: Number,
      default: 0
    },
    shippingFee: { 
      type: Number, 
      default: 0 
    },
    taxAmount: { 
      type: Number, 
      default: 0 
    },
    finalAmount: {
      type: Number, 
      required: true 
    },

    // 🧾 Order status
    orderStatus: {
      type: String,
      enum: [
        'pending',
        'confirmed',
        'processing',
        'shipped',
        'delivered',
        'cancelled',
        'refunded',
        'partially_refunded'
      ],
      default: 'pending',
    },

    // 🚫 Cancellation fields
    cancelledAt: { type: Date },
    cancelledBy: { 
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    cancellationReason: { type: String },

    // 💰 Refund history
    refunds: [{
      refundId: { type: String, required: true },
      amount: { type: Number, required: true },
      razorpayPaymentId: { type: String, required: true },
      type: { 
        type: String, 
        enum: ['full', 'partial'],
        required: true 
      },
      createdAt: { type: Date, default: Date.now },
      notes: { type: Object }
    }],

    // ⏰ Timestamps
    paidAt: { type: Date },
    deliveredAt: { type: Date },

    // 👥 Guest order flag
    isGuestOrder: {
      type: Boolean,
      default: false,
    },

    // 📝 Order notes
    notes: {
      type: String,
      default: ''
    }
  },
  { timestamps: true }
);

// ✅ SINGLE PRE-SAVE MIDDLEWARE
orderSchema.pre('save', async function() {
  console.log('🔵 Running order pre-save middleware...');
  
  // 🆔 Auto-generate clean unique orderId
  if (this.isNew && !this.orderId) {
    try {
      let unique = false;
      let attempts = 0;
      const maxAttempts = 10;
      
      while (!unique && attempts < maxAttempts) {
        const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
        const id = `ORD-${datePart}-${randomPart}`;
        
        const exists = await mongoose.model('Order').findOne({ orderId: id });
        if (!exists) {
          this.orderId = id;
          unique = true;
          console.log(`✅ Order ID generated: ${id}`);
        }
        attempts++;
      }
      
      if (!unique) {
        this.orderId = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        console.log(`⚠️ Fallback Order ID: ${this.orderId}`);
      }
    } catch (err) {
      console.error('❌ Order ID generation failed:', err);
      this.orderId = `ORD-${Date.now()}`;
    }
  }

  // 🔢 Auto-increment S.No
  if (this.isNew) {
    try {
      const lastOrder = await this.constructor.findOne({}, {}, { sort: { 'sNo': -1 } });
      this.sNo = lastOrder ? lastOrder.sNo + 1 : 1;
      console.log(`✅ S.No assigned: ${this.sNo}`);
    } catch (error) {
      console.error('❌ S.No generation failed:', error);
      this.sNo = Date.now();
    }
  }

  // ✅ Calculate amounts
  if (this.products && this.products.length > 0) {
    this.subtotal = this.products.reduce((total, item) => {
      return total + (item.price * item.quantity);
    }, 0);
    
    this.discountAmount = this.products.reduce((total, item) => {
      if (item.originalPrice && item.originalPrice > item.price) {
        return total + ((item.originalPrice - item.price) * item.quantity);
      }
      return total;
    }, 0);
    
    this.finalAmount = this.subtotal + this.shippingFee + this.taxAmount;
    
    if (!this.totalAmount) {
      this.totalAmount = this.subtotal;
    }
    
    console.log(`💰 Amounts calculated: subtotal=${this.subtotal}, discount=${this.discountAmount}, final=${this.finalAmount}`);
  }

  console.log('✅ Order pre-save middleware completed');
});

// ✅ Indexes - Updated for numeric sizes
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ orderStatus: 1 });
orderSchema.index({ isGuestOrder: 1 });
orderSchema.index({ 'shippingAddress.email': 1 });
orderSchema.index({ 'products.selectedSize': 1 });
orderSchema.index({ 'products.selectedSizePrice': 1 });
// ✅ Add index for variant sizes to support faster queries
orderSchema.index({ 'products.variantSizes.size': 1 });

const Order = mongoose.model('Order', orderSchema);
export default Order;