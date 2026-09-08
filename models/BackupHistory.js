// models/BackupHistory.js
import mongoose from 'mongoose';

const backupHistorySchema = new mongoose.Schema({
    fileName: {
        type: String,
        required: true
    },
    sizeInMB: {
        type: Number,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    displayTime: {
        type: String,
        default: ''
    },
    emailSent: {
        type: Boolean,
        default: false  // ✅ Changed to false (email sent from Backup Website)
    },
    emailRecipient: {
        type: String,
        required: false,  // ✅ NOT required anymore
        default: null     // ✅ Allow null
    },
    databaseName: {
        type: String,
        required: true
    },
    siteName: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['success', 'failed'],
        default: 'success'
    },
    isLatest: {
        type: Boolean,
        default: false
    },
    format: {
        type: String,
        default: 'BSON'
    },
    websiteSent: {
        type: Boolean,
        default: false
    },
    changes: {
        type: Object,
        default: null
    },
    notes: {
        type: String
    }
}, {
    timestamps: true
});

backupHistorySchema.index({ timestamp: -1 });
backupHistorySchema.index({ isLatest: -1 });

export default mongoose.model('BackupHistory', backupHistorySchema);