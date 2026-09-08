// routes/backupRoutes.js
import BackupService from '../services/backupService.js';
import ChangeDetectionService from '../services/changeDetectionService.js';
import path from 'path';
import fs from 'fs/promises';
import jwt from 'jsonwebtoken';

const backupService = new BackupService();
const changeService = new ChangeDetectionService();

const verifyToken = (token) => {
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'yourSuperSecretKey123');
        return decoded;
    } catch (error) {
        throw error;
    }
};

export default async function backupRoutes(fastify, options) {
    // Authentication middleware
    fastify.addHook('preHandler', async (request, reply) => {
        try {
            const authHeader = request.headers.authorization;
            if (!authHeader) {
                return reply.status(401).send({
                    success: false,
                    message: 'Authentication required.'
                });
            }

            const token = authHeader.replace('Bearer ', '');
            const decoded = verifyToken(token);
            request.user = decoded;
            console.log(`✅ User authenticated: ${decoded.id}`);
            
        } catch (error) {
            console.error('❌ Authentication error:', error.message);
            return reply.status(401).send({
                success: false,
                message: 'Authentication failed: ' + error.message
            });
        }
    });

    // 🤖 AUTO BACKUP - ONLY IF CHANGES EXIST
    fastify.post('/backup/auto', async (request, reply) => {
        try {
            console.log('🤖 Running auto backup check...');
            const result = await changeService.runBackupIfChanges();
            
            return reply.status(200).send({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('❌ Auto backup failed:', error);
            return reply.status(500).send({
                success: false,
                message: 'Auto backup failed: ' + error.message
            });
        }
    });

    // 🔍 Check for changes (no backup)
    fastify.get('/backup/check-changes', async (request, reply) => {
        try {
            const result = await changeService.checkChangesInLast24Hours();
            return reply.status(200).send({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('❌ Change check failed:', error);
            return reply.status(500).send({
                success: false,
                message: 'Failed to check changes: ' + error.message
            });
        }
    });

    // 📊 Get change statistics for ALL collections
    fastify.get('/backup/stats/changes', async (request, reply) => {
        try {
            const stats = await changeService.getChangeStats();
            return reply.status(200).send({
                success: true,
                data: stats
            });
        } catch (error) {
            console.error('❌ Failed to get change stats:', error);
            return reply.status(500).send({
                success: false,
                message: 'Failed to get change stats: ' + error.message
            });
        }
    });

    // 📤 FORCE BACKUP (Manual - even without changes)
    fastify.post('/backup/create', async (request, reply) => {
        try {
            console.log('📝 Creating forced backup...');
            const result = await backupService.createAndSendBackup();
            return reply.status(200).send({
                success: true,
                message: 'Forced backup created and sent successfully!',
                data: result
            });
        } catch (error) {
            console.error('❌ Backup creation failed:', error);
            return reply.status(500).send({
                success: false,
                message: 'Backup failed: ' + error.message
            });
        }
    });

    // 📋 List all backups
    fastify.get('/backup/list', async (request, reply) => {
        try {
            const backups = await backupService.listBackups();
            return reply.status(200).send({
                success: true,
                count: backups.length,
                backups: backups
            });
        } catch (error) {
            console.error('❌ Failed to list backups:', error);
            return reply.status(500).send({
                success: false,
                message: 'Failed to list backups: ' + error.message
            });
        }
    });

    // 🗑️ Delete backup
    fastify.delete('/backup/:fileName', async (request, reply) => {
        try {
            const { fileName } = request.params;
            
            if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
                return reply.status(400).send({
                    success: false,
                    message: 'Invalid file name'
                });
            }
            
            await backupService.deleteBackup(fileName);
            
            return reply.status(200).send({
                success: true,
                message: `Backup "${fileName}" deleted successfully`
            });
        } catch (error) {
            console.error('❌ Delete backup failed:', error);
            return reply.status(500).send({
                success: false,
                message: 'Failed to delete backup: ' + error.message
            });
        }
    });

    // 📊 Get backup statistics
    fastify.get('/backup/stats', async (request, reply) => {
        try {
            const stats = await backupService.getBackupStats();
            return reply.status(200).send({
                success: true,
                stats: {
                    ...stats,
                    storageType: 'Email (Permanent)',
                    expiry: 'Never - stored forever in email',
                    maxFileSize: `${backupService.maxSizeMB} MB`
                }
            });
        } catch (error) {
            console.error('❌ Failed to get stats:', error);
            return reply.status(500).send({
                success: false,
                message: 'Failed to get stats: ' + error.message
            });
        }
    });
}