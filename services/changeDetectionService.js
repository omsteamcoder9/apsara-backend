// services/changeDetectionService.js
import mongoose from 'mongoose';
import BackupService from './backupService.js';

const backupService = new BackupService();

class ChangeDetectionService {
    constructor() {
        this.collections = [];
    }

    async getAllCollectionNames() {
        try {
            const db = mongoose.connection.db;
            const collections = await db.listCollections().toArray();
            const collectionNames = collections
                .map(col => col.name)
                .filter(name => !name.startsWith('system.'));
            
            console.log(`📁 Found ${collectionNames.length} collections`);
            return collectionNames;
        } catch (error) {
            console.error('❌ Error getting collection names:', error);
            return [];
        }
    }

    getModelForCollection(collectionName) {
        try {
            return mongoose.model(collectionName);
        } catch (err) {
            const schema = new mongoose.Schema({}, { 
                strict: false,
                collection: collectionName,
                timestamps: true
            });
            return mongoose.model(collectionName, schema);
        }
    }

    async checkChangesInLast24Hours() {
        try {
            const twentyFourHoursAgo = new Date();
            twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

            console.log(`🔍 Checking for changes since: ${twentyFourHoursAgo.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);

            const collectionNames = await this.getAllCollectionNames();
            
            if (collectionNames.length === 0) {
                return {
                    hasChanges: false,
                    totalChanges: 0,
                    changes: {},
                    twentyFourHoursAgo: twentyFourHoursAgo
                };
            }

            let totalChanges = 0;
            const changes = {};

            for (const collectionName of collectionNames) {
                try {
                    const model = this.getModelForCollection(collectionName);
                    
                    const count = await model.countDocuments({
                        $or: [
                            { createdAt: { $gte: twentyFourHoursAgo } },
                            { updatedAt: { $gte: twentyFourHoursAgo } }
                        ]
                    });

                    if (count > 0) {
                        changes[collectionName] = count;
                        totalChanges += count;
                    }
                } catch (err) {
                    console.warn(`⚠️ Could not check collection "${collectionName}":`, err.message);
                }
            }

            console.log(`📊 Total changes found: ${totalChanges}`);
            if (totalChanges > 0) {
                console.log('📁 Changes by collection:', changes);
            } else {
                console.log('✅ No changes detected in the last 24 hours');
            }

            return {
                hasChanges: totalChanges > 0,
                totalChanges: totalChanges,
                changes: changes,
                twentyFourHoursAgo: twentyFourHoursAgo,
                collectionsChecked: collectionNames.length
            };

        } catch (error) {
            console.error('❌ Error checking changes:', error);
            throw error;
        }
    }

    async runBackupIfChanges() {
        try {
            console.log('🔄 Checking for changes before backup...');
            
            const result = await this.checkChangesInLast24Hours();

            if (!result.hasChanges) {
                console.log('⏭️ No changes detected in the last 24 hours. Backup SKIPPED.');
                return {
                    success: true,
                    message: 'No changes detected. Backup skipped.',
                    hasChanges: false,
                    totalChanges: 0,
                    backupCreated: false,
                    collectionsChecked: result.collectionsChecked
                };
            }

            console.log(`✅ Changes detected! (${result.totalChanges} changes in ${Object.keys(result.changes).length} collections). Creating backup...`);
            
            const backupResult = await backupService.createAndSendBackup(result.changes);
            
            return {
                success: true,
                message: 'Changes detected. Backup created and sent successfully!',
                hasChanges: true,
                totalChanges: result.totalChanges,
                changes: result.changes,
                collectionsChecked: result.collectionsChecked,
                backupCreated: true,
                backupResult: backupResult
            };

        } catch (error) {
            console.error('❌ Backup check failed:', error);
            throw error;
        }
    }

    async getChangeStats() {
        try {
            const twentyFourHoursAgo = new Date();
            twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

            const collectionNames = await this.getAllCollectionNames();

            const stats = {
                period: 'Last 24 Hours',
                startTime: twentyFourHoursAgo.toISOString(),
                endTime: new Date().toISOString(),
                totalCollections: collectionNames.length,
                collections: {}
            };

            let totalChanges = 0;

            for (const collectionName of collectionNames) {
                try {
                    const model = this.getModelForCollection(collectionName);
                    
                    const newCount = await model.countDocuments({
                        createdAt: { $gte: twentyFourHoursAgo }
                    });

                    const updatedCount = await model.countDocuments({
                        updatedAt: { $gte: twentyFourHoursAgo }
                    });

                    const total = newCount + updatedCount;
                    totalChanges += total;

                    stats.collections[collectionName] = {
                        new: newCount,
                        updated: updatedCount,
                        total: total
                    };
                } catch (err) {
                    stats.collections[collectionName] = {
                        new: 0,
                        updated: 0,
                        total: 0
                    };
                }
            }

            stats.totalChanges = totalChanges;

            return stats;
        } catch (error) {
            console.error('❌ Error getting change stats:', error);
            throw error;
        }
    }
}

export default ChangeDetectionService;