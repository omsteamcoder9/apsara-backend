// scripts/checkChanges.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import ChangeDetectionService from '../services/changeDetectionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function checkChanges() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        const changeService = new ChangeDetectionService();
        
        const stats = await changeService.getChangeStats();
        console.log('\n📊 Change Statistics (Last 24 Hours):');
        console.log('======================================');
        console.log(`📅 From: ${new Date(stats.startTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
        console.log(`📅 To: ${new Date(stats.endTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
        console.log(`📁 Total Collections: ${stats.totalCollections}`);
        console.log(`📊 Total Changes: ${stats.totalChanges}`);
        console.log('\n📁 Changes by Collection:');
        
        let hasChanges = false;
        for (const [collection, data] of Object.entries(stats.collections)) {
            if (data.total > 0) {
                console.log(`  ✅ ${collection}: ${data.total} changes (${data.new} new, ${data.updated} updated)`);
                hasChanges = true;
            } else {
                console.log(`  ℹ️ ${collection}: No changes`);
            }
        }
        
        if (!hasChanges) {
            console.log('\n  ℹ️ No changes detected in any collection');
            console.log('\n⏭️ Backup will be SKIPPED (no changes)');
        } else {
            console.log('\n✅ Backup will be CREATED (changes detected)');
        }

        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

checkChanges();