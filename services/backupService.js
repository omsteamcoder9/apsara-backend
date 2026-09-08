// services/backupService.js
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import BackupHistory from '../models/BackupHistory.js';
import Setting from '../models/Setting.js';
import AdmZip from 'adm-zip';

const execPromise = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

class BackupService {
    constructor() {
        this.dbName = process.env.DB_NAME || 'ebay';
        this.backupDir = path.join(__dirname, '../backups');
        this.maxSizeMB = parseInt(process.env.MAX_BACKUP_SIZE_MB) || 25;
        this.backupApiUrl = process.env.BACKUP_API_URL;
        this.backupApiKey = process.env.BACKUP_API_KEY;
        this.siteName = null;
        this.ensureBackupDir();
        this.loadSiteName();
    }

    async loadSiteName() {
        try {
            const settings = await Setting.findOne();
            if (settings && settings.siteName) {
                this.siteName = settings.siteName;
                console.log(`✅ Site name loaded: ${this.siteName}`);
            } else {
                this.siteName = this.dbName;
                console.log(`⚠️ Site name not found, using database name: ${this.dbName}`);
            }
        } catch (error) {
            console.error('❌ Failed to load site name:', error);
            this.siteName = this.dbName;
        }
    }

    async ensureBackupDir() {
        try {
            await fs.mkdir(this.backupDir, { recursive: true });
            console.log('✅ Backup directory created/verified:', this.backupDir);
        } catch (error) {
            console.error('❌ Error creating backup directory:', error);
        }
    }

    getISTTime() {
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000;
        return new Date(now.getTime() + istOffset);
    }

    formatISTDisplay(date) {
        const year = date.getUTCFullYear();
        const month = date.getUTCMonth() + 1;
        const day = date.getUTCDate();
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        const seconds = String(date.getUTCSeconds()).padStart(2, '0');
        return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds} IST`;
    }

    generateISTTimestamp() {
        const istTime = this.getISTTime();
        const year = istTime.getUTCFullYear();
        const month = istTime.getUTCMonth() + 1;
        const day = istTime.getUTCDate();
        const hours = String(istTime.getUTCHours()).padStart(2, '0');
        const minutes = String(istTime.getUTCMinutes()).padStart(2, '0');
        const seconds = String(istTime.getUTCSeconds()).padStart(2, '0');
        return `${day}-${month}-${year}T${hours}-${minutes}-${seconds}`;
    }

    getSiteNameForFilename() {
        if (!this.siteName) {
            return this.dbName;
        }
        return this.siteName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
    }

    async createBackup() {
        try {
            await this.loadSiteName();
            
            const timestamp = this.generateISTTimestamp();
            const siteSlug = this.getSiteNameForFilename();
            
            const backupFolderName = `${siteSlug}_${this.dbName}_${timestamp}`;
            const backupFolderPath = path.join(this.backupDir, backupFolderName);
            
            await fs.mkdir(backupFolderPath, { recursive: true });

            const istTime = this.getISTTime();
            console.log(`🔄 Starting BSON backup for database: ${this.dbName}`);
            console.log(`🏷️ Site name: ${this.siteName}`);
            console.log(`📁 Backup folder: ${backupFolderName}`);
            console.log(`🕐 IST Time: ${this.formatISTDisplay(istTime)}`);

            try {
                await execPromise('mongodump --version');
            } catch (err) {
                throw new Error('mongodump is not installed. Please install MongoDB Database Tools.');
            }

            const command = `mongodump --db ${this.dbName} --out="${backupFolderPath}"`;
            console.log(`📝 Executing: ${command}`);
            
            const { stdout, stderr } = await execPromise(command);

            if (stderr && !stderr.includes('done')) {
                console.warn('⚠️ mongodump stderr:', stderr);
            }

            try {
                const collections = await fs.readdir(path.join(backupFolderPath, this.dbName));
                
                if (!collections || collections.length === 0) {
                    throw new Error('No collections found in backup. Backup may have failed.');
                }

                console.log(`✅ BSON backup created: ${backupFolderName}`);
                console.log(`📁 Collections: ${collections.join(', ')}`);
            } catch (err) {
                throw new Error(`Backup failed: ${err.message}`);
            }

            let totalSize = 0;
            const collections = await fs.readdir(path.join(backupFolderPath, this.dbName));
            for (const collection of collections) {
                const stats = await fs.stat(path.join(backupFolderPath, this.dbName, collection));
                totalSize += stats.size;
            }
            const sizeInMB = totalSize / (1024 * 1024);

            return {
                success: true,
                folderPath: backupFolderPath,
                folderName: backupFolderName,
                fileName: backupFolderName,
                size: totalSize,
                sizeInMB: sizeInMB,
                timestamp: timestamp,
                siteName: this.siteName,
                displayTime: this.formatISTDisplay(istTime),
                collections: collections,
                isBSON: true
            };

        } catch (error) {
            console.error('❌ Backup creation failed:', error);
            throw error;
        }
    }

    async createZipForEmail(backupInfo) {
        try {
            const { folderPath, folderName } = backupInfo;
            const zipFileName = `${folderName}.zip`;
            const zipFilePath = path.join(this.backupDir, zipFileName);
            
            console.log(`📦 Creating ZIP: ${zipFileName}`);
            
            const zip = new AdmZip();
            zip.addLocalFolder(folderPath, folderName);
            zip.writeZip(zipFilePath);
            
            const stats = await fs.stat(zipFilePath);
            const sizeInMB = stats.size / (1024 * 1024);
            console.log(`✅ ZIP created: ${zipFileName} (${sizeInMB.toFixed(2)} MB)`);
            
            return zipFilePath;
            
        } catch (error) {
            console.error('❌ ZIP creation failed:', error);
            throw error;
        }
    }

async sendToBackupWebsite(zipFilePath, backupInfo) {
    try {
        if (!this.backupApiUrl) {
            console.log('⚠️ BACKUP_API_URL not configured. Skipping website upload.');
            return { success: false, message: 'BACKUP_API_URL not configured' };
        }

        console.log(`📤 Sending backup to website: ${this.backupApiUrl}`);

        const formData = new FormData();
        const fileBuffer = await fs.readFile(zipFilePath);
        const fileBlob = new Blob([fileBuffer]);
        
        formData.append('backup', fileBlob, path.basename(zipFilePath));
        formData.append('siteName', backupInfo.siteName || this.siteName || this.dbName);
        formData.append('database', this.dbName);
        formData.append('timestamp', backupInfo.timestamp);
        formData.append('displayTime', backupInfo.displayTime);
        formData.append('sizeInMB', String(backupInfo.sizeInMB));
        formData.append('collections', JSON.stringify(backupInfo.collections || []));

        const headers = {
            'Authorization': `Bearer ${this.backupApiKey || ''}`
        };

        // ✅ ADD TIMEOUT AND RETRY
        const MAX_RETRIES = 3;
        let lastError = null;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                console.log(`🔄 Attempt ${attempt}/${MAX_RETRIES}...`);

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 seconds

                const response = await fetch(this.backupApiUrl, {
                    method: 'POST',
                    headers: headers,
                    body: formData,
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                // ✅ Try to get response text first
                let result;
                try {
                    result = await response.json();
                } catch (jsonError) {
                    // If response is not JSON, get text
                    const text = await response.text();
                    console.log(`📄 Response text: ${text}`);
                    result = { success: false, message: text };
                }

                if (response.ok) {
                    console.log('✅ Backup sent to website successfully!');
                    return { success: true, data: result };
                } else {
                    console.error(`❌ Attempt ${attempt} failed:`, result);
                    lastError = result;
                    // Don't retry if it's a client error (4xx) except 429
                    if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                        return { success: false, error: result };
                    }
                }

            } catch (fetchError) {
                console.error(`❌ Attempt ${attempt} fetch error:`, fetchError.message);
                lastError = fetchError;
                // Wait before retry
                if (attempt < MAX_RETRIES) {
                    console.log(`⏳ Waiting 2 seconds before retry...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }

        console.error(`❌ All ${MAX_RETRIES} attempts failed.`);
        return { success: false, error: lastError };

    } catch (error) {
        console.error('❌ Failed to send backup to website:', error);
        return { success: false, error: error.message };
    }
}
    async cleanupBackup(backupInfo) {
        try {
            const { folderPath } = backupInfo;
            await fs.rm(folderPath, { recursive: true, force: true });
            console.log(`🧹 Cleaned up backup folder: ${path.basename(folderPath)}`);
        } catch (error) {
            console.error('❌ Cleanup failed:', error);
        }
    }

    async createAndSendBackup(changes = null) {
        try {
            await this.loadSiteName();
            
            const backupInfo = await this.createBackup();
            
            const zipFilePath = await this.createZipForEmail(backupInfo);
            
            // ✅ ONLY send to Backup Website - NO EMAIL
            const websiteResult = await this.sendToBackupWebsite(zipFilePath, backupInfo);
            
            try {
                await BackupHistory.updateMany(
                    { isLatest: true },
                    { $set: { isLatest: false } }
                );
                
                const istDate = this.getISTTime();
                const displayTime = this.formatISTDisplay(istDate);
                
                const history = await BackupHistory.create({
                    fileName: backupInfo.fileName,
                    sizeInMB: backupInfo.sizeInMB,
                    timestamp: istDate,
                    displayTime: displayTime,
                    emailSent: false, // ✅ No email sent from backend
                    emailRecipient: null, // ✅ No recipient from backend
                    databaseName: this.dbName,
                    siteName: this.siteName || this.dbName,
                    status: 'success',
                    isLatest: true,
                    format: 'BSON',
                    websiteSent: websiteResult.success,
                    changes: changes,
                    notes: `BSON backup created and sent to Backup Website at ${displayTime}`
                });
                console.log('✅ Backup history saved to database:', history._id);
            } catch (dbError) {
                console.error('❌ Failed to save backup history:', dbError);
            }
            
            // ✅ Cleanup ZIP file
            await fs.unlink(zipFilePath);
            console.log(`🧹 Cleaned up ZIP file: ${path.basename(zipFilePath)}`);
            
            await this.cleanupBackup(backupInfo);
            
            return {
                success: true,
                message: 'BSON backup created and sent to Backup Website successfully',
                backupInfo,
                websiteResult
            };
        } catch (error) {
            console.error('❌ Backup process failed:', error);
            throw error;
        }
    }

    async listBackups() {
        try {
            const history = await BackupHistory.find()
                .sort({ timestamp: -1 })
                .limit(50);
            
            return history.map(item => ({
                fileName: item.fileName,
                sizeInMB: item.sizeInMB,
                createdAt: item.displayTime || item.timestamp,
                emailSent: item.emailSent,
                emailRecipient: item.emailRecipient,
                status: item.status,
                isLatest: item.isLatest || false,
                siteName: item.siteName || this.dbName,
                format: item.format || 'BSON',
                websiteSent: item.websiteSent || false,
                changes: item.changes || null,
                notes: item.notes
            }));
        } catch (error) {
            console.error('❌ Failed to list backups from history:', error);
            return [];
        }
    }

    async getBackupStats() {
        try {
            const backups = await this.listBackups();
            const totalSizeMB = backups.reduce((sum, b) => sum + b.sizeInMB, 0);
            const latest = backups.length > 0 ? backups[0] : null;
            
            return {
                totalBackups: backups.length,
                totalSizeMB: totalSizeMB,
                latestBackup: latest,
                averageSizeMB: backups.length > 0 ? totalSizeMB / backups.length : 0
            };
        } catch (error) {
            console.error('❌ Failed to get stats:', error);
            throw error;
        }
    }

    async deleteBackup(fileName) {
        try {
            await BackupHistory.findOneAndDelete({ fileName });
            console.log(`✅ Deleted backup from history: ${fileName}`);
            
            const folderPath = path.join(this.backupDir, fileName);
            try {
                await fs.rm(folderPath, { recursive: true, force: true });
                console.log(`✅ Deleted backup folder: ${fileName}`);
            } catch (err) {
                console.log(`ℹ️ Backup folder not found on server: ${fileName}`);
            }
            
            return { success: true, message: `Deleted ${fileName}` };
        } catch (error) {
            console.error('❌ Failed to delete backup:', error);
            throw error;
        }
    }
}

export default BackupService;