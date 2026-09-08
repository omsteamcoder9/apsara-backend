import mongoose from 'mongoose';

const shippingSchema = new mongoose.Schema({
    orderId: {
        type: String,
        required: true,
        unique: true
    },
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true
    },
    shipmentId: {
        type: String,
        required: true,
        unique: true
    },
    userType: {
        type: String,
        enum: ['user', 'guest'],
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: false,
        refPath: 'userType'
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false
    },
    pickupLocation: {
        type: Object,
        default: {}
    },
    shippingStatus: {
        type: String,
        enum: ['pending', 'confirmed', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'cancelled', 'returned'],
        default: 'pending'
    },
    awbNumber: {
        type: String,
        default: null
    },
    courierName: {
        type: String,
        default: null
    },
    courierCompanyId: {
        type: String,
        default: null
    },
    shippingCharges: {
        type: Number,
        default: 0
    },
    shipRocketResponse: {
        type: Object,
        default: {}
    },
    labelUrl: {
        type: String,
        default: null
    },
    manifestUrl: {
        type: String,
        default: null
    },
    // ✅ ADD CANCELLATION FIELDS
    cancellationReason: {
        type: String,
        default: ''
    },
    cancelledAt: {
        type: Date,
        default: null
    },
    cancelledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, {
    timestamps: true
});

// Add index for better performance (REMOVED duplicate orderId and shipmentId indexes)
shippingSchema.index({ userId: 1 });
shippingSchema.index({ shippingStatus: 1 }); // ✅ ADD INDEX FOR STATUS FILTERING
shippingSchema.index({ createdAt: 1 }); // ✅ ADD INDEX FOR DATE FILTERING

const Shipping = mongoose.model('Shipping', shippingSchema);

export default Shipping;