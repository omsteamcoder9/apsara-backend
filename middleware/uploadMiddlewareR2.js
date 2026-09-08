// middleware/uploadMiddlewareR2.js
import { uploadImageToR2, deleteFileFromR2 } from '../services/r2Service.js';
import { ValidationError } from '../utils/errors.js';
import fs from 'fs';
import path from 'path';

/**
 * Process and upload files to R2
 */
export const processAndUploadToR2 = async (req, folder = 'products') => {
  const uploadedFiles = [];

  // Check if there are files in the request
  if (!req.files || req.files.length === 0) {
    console.log('📁 No files found in request');
    return uploadedFiles;
  }

  console.log(`📁 Processing ${req.files.length} files to R2...`);

  for (const file of req.files) {
    try {
      let fileBuffer;
      let originalName;
      
      // ✅ Handle different file structures
      if (file.buffer) {
        // File from memory
        fileBuffer = file.buffer;
        originalName = file.originalname || file.filename || 'image.jpg';
        console.log(`📥 Processing file from buffer: ${originalName}`);
      } else if (file.path && fs.existsSync(file.path)) {
        // File from disk (shouldn't happen with R2, but fallback)
        fileBuffer = fs.readFileSync(file.path);
        originalName = file.originalname || file.filename || path.basename(file.path);
        // Clean up temp file
        try {
          fs.unlinkSync(file.path);
        } catch (e) {
          console.log('⚠️ Could not delete temp file:', file.path);
        }
        console.log(`📥 Processing file from disk: ${originalName}`);
      } else {
        // Try to get data from the file object
        console.log('📥 File object:', Object.keys(file));
        console.log('📥 File data:', file);
        
        // If it's a Fastify multipart file
        if (file.file) {
          // Fastify multipart file
          const chunks = [];
          for await (const chunk of file.file) {
            chunks.push(chunk);
          }
          fileBuffer = Buffer.concat(chunks);
          originalName = file.filename || file.originalname || 'image.jpg';
        } else {
          throw new Error('No file data found - unsupported file format');
        }
      }

      // Validate buffer
      if (!fileBuffer || fileBuffer.length === 0) {
        throw new Error('Empty file buffer');
      }

      console.log(`📊 File size: ${(fileBuffer.length / 1024).toFixed(2)} KB`);

      // Upload to R2
      const result = await uploadImageToR2(
        fileBuffer,
        originalName,
        folder,
        { quality: 80, maxWidth: 800, maxHeight: 800 }
      );

      uploadedFiles.push({
        fieldname: file.fieldname || 'images',
        originalname: originalName,
        filename: result.filename,
        url: result.url,
        key: result.key,
        size: result.size,
        mimetype: 'image/webp',
        buffer: fileBuffer, // Keep for backward compatibility
      });

      console.log(`✅ Uploaded to R2: ${result.url}`);
    } catch (error) {
      console.error(`❌ Failed to upload ${file.originalname || file.filename || 'unknown'}:`, error);
      throw new ValidationError(`Failed to upload file: ${error.message}`);
    }
  }

  req.files = uploadedFiles;
  return uploadedFiles;
};

/**
 * Single file upload helper
 */
export const processSingleFileToR2 = (fieldName, folder = 'products') => {
  return async (req) => {
    await processAndUploadToR2(req, folder);
    if (req.files && req.files.length > 0) {
      req.file = req.files.find(f => f.fieldname === fieldName);
    }
    return req.file;
  };
};

/**
 * Array files upload helper
 */
export const processArrayFilesToR2 = (fieldName, folder = 'products', maxCount = 20) => {
  return async (req) => {
    await processAndUploadToR2(req, folder);
    if (req.files && req.files.length > 0) {
      const filtered = req.files.filter(f => f.fieldname === fieldName);
      req.files = filtered.slice(0, maxCount);
    }
    return req.files;
  };
};

export default {
  processAndUploadToR2,
  processSingleFileToR2,
  processArrayFilesToR2,
};