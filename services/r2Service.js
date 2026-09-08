// services/r2Service.js
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// Initialize R2 Client
const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME;
const PUBLIC_URL = process.env.R2_PUBLIC_URL;

/**
 * Upload any file to R2 - OPTIMIZED TO ~100KB
 */
export const uploadFileToR2 = async (fileBuffer, filename, folder = 'general', contentType = 'application/octet-stream') => {
  try {
    let finalBuffer = fileBuffer;
    let finalFilename = filename;
    let finalContentType = contentType;

    // ✅ Check if it's an image
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp'];
    const ext = path.extname(filename).toLowerCase();
    
    if (imageExtensions.includes(ext) || contentType.startsWith('image/')) {
      try {
        const metadata = await sharp(fileBuffer).metadata();
        const originalSizeKB = fileBuffer.length / 1024;
        console.log(`📊 Original: ${originalSizeKB.toFixed(2)} KB, ${metadata.width}x${metadata.height}`);

        // ✅ Target ~100KB - Determine optimal size
        let targetWidth = 600;
        let targetHeight = 600;
        let quality = 75;

        // Adjust based on original dimensions
        if (metadata.width > 2000 || metadata.height > 2000) {
          targetWidth = 500;
          targetHeight = 500;
          quality = 70;
        } else if (metadata.width > 1200 || metadata.height > 1200) {
          targetWidth = 550;
          targetHeight = 550;
          quality = 72;
        }

        // First pass optimization
        let webpBuffer = await sharp(fileBuffer)
          .resize(targetWidth, targetHeight, { 
            fit: 'inside',
            withoutEnlargement: true 
          })
          .webp({ 
            quality: quality,
            effort: 6,
            nearLossless: false,
            smartSubsample: true,
            alphaQuality: 70
          })
          .toBuffer();

        let webpSizeKB = webpBuffer.length / 1024;
        console.log(`   Pass 1: ${webpSizeKB.toFixed(2)} KB (${targetWidth}x${targetHeight}, Q:${quality})`);

        // ✅ Adjust to reach ~100KB
        let attempts = 1;
        while (webpSizeKB > 110 && quality > 40 && attempts < 5) {
          quality = Math.max(40, quality - 8);
          const scaleFactor = Math.max(0.7, 1 - (attempts * 0.05));
          const newWidth = Math.round(targetWidth * scaleFactor);
          const newHeight = Math.round(targetHeight * scaleFactor);
          
          webpBuffer = await sharp(fileBuffer)
            .resize(newWidth, newHeight, { 
              fit: 'inside',
              withoutEnlargement: true 
            })
            .webp({ 
              quality: quality,
              effort: 6,
              nearLossless: false,
              smartSubsample: true,
              alphaQuality: 60
            })
            .toBuffer();
          
          webpSizeKB = webpBuffer.length / 1024;
          attempts++;
          console.log(`   Pass ${attempts}: ${webpSizeKB.toFixed(2)} KB (${newWidth}x${newHeight}, Q:${quality})`);
        }

        // ✅ If still > 150KB, reduce more
        if (webpSizeKB > 150) {
          webpBuffer = await sharp(fileBuffer)
            .resize(350, 350, { fit: 'inside' })
            .webp({ 
              quality: 50,
              effort: 6,
              nearLossless: false,
              smartSubsample: true,
              alphaQuality: 50
            })
            .toBuffer();
          webpSizeKB = webpBuffer.length / 1024;
          console.log(`   Final: ${webpSizeKB.toFixed(2)} KB (350x350, Q:50)`);
        }

        // ✅ If still > 200KB, force reduce
        if (webpSizeKB > 200) {
          webpBuffer = await sharp(fileBuffer)
            .resize(250, 250, { fit: 'inside' })
            .webp({ 
              quality: 40,
              effort: 6,
              nearLossless: false,
              smartSubsample: true,
              alphaQuality: 40
            })
            .toBuffer();
          webpSizeKB = webpBuffer.length / 1024;
          console.log(`   Extreme: ${webpSizeKB.toFixed(2)} KB (250x250, Q:40)`);
        }

        const baseName = path.basename(filename, ext);
        finalFilename = `${baseName}.webp`;
        finalBuffer = webpBuffer;
        finalContentType = 'image/webp';
        
        const reduction = ((1 - webpSizeKB / originalSizeKB) * 100);
        console.log(`✅ OPTIMIZED: ${originalSizeKB.toFixed(2)} KB → ${webpSizeKB.toFixed(2)} KB (${reduction.toFixed(1)}% reduction)`);
        
      } catch (sharpError) {
        console.warn(`⚠️ WebP conversion failed for ${filename}:`, sharpError.message);
        finalBuffer = fileBuffer;
        finalFilename = filename;
        finalContentType = contentType;
      }
    }

    const key = `${folder}/${finalFilename}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: finalBuffer,
      ContentType: finalContentType,
      CacheControl: 'public, max-age=31536000, immutable',
    });

    await r2Client.send(command);

    const url = `${PUBLIC_URL}/${key}`;
    console.log(`✅ Uploaded: ${url} (${(finalBuffer.length / 1024).toFixed(2)} KB)`);

    return {
      success: true,
      url,
      key,
      filename: finalFilename,
      size: finalBuffer.length,
    };
  } catch (error) {
    console.error('❌ R2 upload error:', error);
    throw new Error(`Failed to upload file to R2: ${error.message}`);
  }
};

/**
 * Upload image to R2 with WebP conversion and resize options
 */
export const uploadImageToR2 = async (fileBuffer, originalFilename, folder = 'products', options = {}) => {
  try {
    const {
      quality = 75,
      maxWidth = 600,
      maxHeight = 600,
      fit = 'inside',
    } = options;

    const timestamp = Date.now();
    const randomString = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(originalFilename);
    const baseName = path.basename(originalFilename, ext)
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 50);
    const filename = `${timestamp}-${randomString}-${baseName}.webp`;

    let sharpInstance = sharp(fileBuffer).webp({ 
      quality: quality,
      effort: 6,
      nearLossless: false,
      smartSubsample: true
    });
    
    if (maxWidth || maxHeight) {
      sharpInstance = sharpInstance.resize(maxWidth || null, maxHeight || null, { fit });
    }
    
    const webpBuffer = await sharpInstance.toBuffer();

    const key = `${folder}/${filename}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: webpBuffer,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
    });

    await r2Client.send(command);

    const url = `${PUBLIC_URL}/${key}`;
    console.log(`✅ Image uploaded: ${url} (${(webpBuffer.length / 1024).toFixed(2)} KB)`);

    return {
      success: true,
      url,
      key,
      filename,
      size: webpBuffer.length,
    };
  } catch (error) {
    console.error('❌ R2 upload error:', error);
    throw new Error(`Failed to upload image to R2: ${error.message}`);
  }
};

/**
 * Delete file from R2
 */
export const deleteFileFromR2 = async (fileUrl) => {
  try {
    let key = fileUrl;
    
    if (fileUrl.startsWith('http')) {
      const urlObj = new URL(fileUrl);
      let pathname = urlObj.pathname;
      if (pathname.startsWith('/')) {
        pathname = pathname.slice(1);
      }
      const parts = pathname.split('/');
      if (parts.length > 0 && parts[0] === process.env.R2_BUCKET_NAME) {
        parts.shift();
      }
      key = parts.join('/');
    }
    
    key = key.replace(/^\/|\/$/g, '');

    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await r2Client.send(command);
    console.log(`✅ File deleted from R2: ${fileUrl}`);
    return { success: true };
  } catch (error) {
    console.error('❌ R2 delete error:', error);
    throw new Error(`Failed to delete file from R2: ${error.message}`);
  }
};

/**
 * Delete multiple files from R2
 */
export const deleteFilesFromR2 = async (fileUrls) => {
  const results = [];
  for (const url of fileUrls) {
    try {
      const result = await deleteFileFromR2(url);
      results.push({ ...result, url });
    } catch (error) {
      results.push({ url, error: error.message });
    }
  }
  return results;
};

/**
 * List files in a folder
 */
export const listFilesInFolder = async (folder, maxKeys = 100) => {
  try {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: folder,
      MaxKeys: maxKeys,
    });

    const response = await r2Client.send(command);
    return response.Contents || [];
  } catch (error) {
    console.error('❌ R2 list error:', error);
    throw new Error(`Failed to list files: ${error.message}`);
  }
};

/**
 * Get presigned URL for temporary access
 */
export const getPresignedUrl = async (key, expiresIn = 3600) => {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    return await getSignedUrl(r2Client, command, { expiresIn });
  } catch (error) {
    console.error('❌ Presigned URL error:', error);
    throw new Error(`Failed to generate presigned URL: ${error.message}`);
  }
};

export default {
  uploadFileToR2,
  uploadImageToR2,
  deleteFileFromR2,
  deleteFilesFromR2,
  listFilesInFolder,
  getPresignedUrl,
};