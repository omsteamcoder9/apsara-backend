// scripts/autoBackupChecker.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import ChangeDetectionService from '../services/changeDetectionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function autoBackupCheck() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');
        console.log(`🕐 Check Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
        console.log('🚀 Starting auto backup check...');

        const changeService = new ChangeDetectionService();
        const result = await changeService.runBackupIfChanges();

        if (result.backupCreated) {
            console.log('✅ Backup created and sent successfully!');
            console.log(`📊 Total changes: ${result.totalChanges}`);
            console.log(`📁 Collections with changes: ${Object.keys(result.changes).join(', ')}`);
        } else {
            console.log('⏭️ No changes detected. Backup SKIPPED.');
        }

        await mongoose.disconnect();
        console.log('✅ Disconnected from MongoDB');
        process.exit(0);
    } catch (error) {
        console.error('❌ Auto backup check failed:', error.message);
        process.exit(1);
    }
}

autoBackupCheck();