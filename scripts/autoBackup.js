// scripts/autoBackup.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import BackupService from '../services/backupService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const backupService = new BackupService();

async function forceBackup() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');
        console.log('🔄 Creating forced backup (even without changes)...');

        const result = await backupService.createAndSendBackup();
        console.log('✅ Forced backup completed successfully!');
        console.log(`📁 File: ${result.backupInfo.fileName}`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Forced backup failed:', error.message);
        process.exit(1);
    }
}

forceBackup();