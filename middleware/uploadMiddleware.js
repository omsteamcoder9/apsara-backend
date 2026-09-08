// middleware/uploadMiddleware.js - FASTIFY MULTIPART VERSION
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { ValidationError, DatabaseError } from '../utils/errors.js';

// ✅ Ensure uploads folder exists
const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ✅ Generate unique filename (same logic as before)
const generateUniqueFilename = (originalname, fieldname) => {
  const ext = path.extname(originalname);
  
  // Generate a random 8-character string
  const randomString = crypto.randomBytes(4).toString('hex'); // 8 characters
  
  const safeFieldname = fieldname
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  
  // ✅ Add timestamp + random string
  const filename = `${Date.now()}-${randomString}-${safeFieldname}${ext}`;
  
  console.log(`📝 Generated unique filename: ${filename}`);
  return filename;
};

// ✅ Safe delete helper (UNCHANGED)
const safeDelete = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`✅ Deleted original: ${path.basename(filePath)}`);
    }
  } catch (error) {
    console.warn(`⚠️ Could not delete ${filePath}: ${error.message}`);
  }
};

// ✅ Process uploaded files from Fastify multipart
export const processFiles = async (req) => {
  const files = [];
  
  if (!req.files) {
    console.log('📁 No files found in request');
    return files;
  }
  
  console.log('📁 Processing files from Fastify multipart...');
  
  try {
    const parts = req.files();
    
    for await (const part of parts) {
      // Check if it's a file (not a field)
      if (part.file) {
        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/gif', 'image/avif'];
        
        if (!allowedTypes.includes(part.mimetype)) {
          console.warn(`⚠️ Skipping unsupported file type: ${part.mimetype}`);
          continue;
        }
        
        const filename = generateUniqueFilename(part.filename, part.fieldname);
        const filePath = path.join(uploadDir, filename);
        
        console.log(`📥 Saving file: ${part.filename} as ${filename}`);
        
        // Save file using stream pipeline
        await pipeline(part.file, createWriteStream(filePath));
        
        // Get file stats
        const stats = fs.statSync(filePath);
        
        // Store file info (same structure as multer)
        files.push({
          fieldname: part.fieldname,
          originalname: part.filename,
          filename: filename,
          path: filePath,
          mimetype: part.mimetype,
          size: stats.size,
          encoding: part.encoding || '7bit',
          destination: uploadDir,
          stream: part.file
        });
        
        console.log(`✅ File saved: ${filename} (${(stats.size / 1024).toFixed(2)}KB)`);
      }
    }
  } catch (error) {
    console.error('❌ Error processing files:', error);
    throw new DatabaseError(`Failed to process uploaded files: ${error.message}`, {
      error: error.message
    });
  }
  
  req.files = files;
  return files;
};

// ✅ Helper for single file upload (like multer.single)
export const processSingleFile = (fieldName) => {
  return async (req) => {
    await processFiles(req);
    
    if (req.files && req.files.length > 0) {
      // Find the file with matching fieldname
      const file = req.files.find(f => f.fieldname === fieldName);
      if (file) {
        req.file = file;
        console.log(`✅ Single file found: ${file.originalname}`);
        return file;
      }
    }
    
    console.log(`⚠️ No file found with fieldname: ${fieldName}`);
    return null;
  };
};

// ✅ Helper for array of files (like multer.array)
export const processArrayFiles = (fieldName, maxCount = 20) => {
  return async (req) => {
    await processFiles(req);
    
    if (req.files && req.files.length > 0) {
      const filteredFiles = req.files.filter(f => f.fieldname === fieldName);
      
      // Limit to maxCount
      if (filteredFiles.length > maxCount) {
        console.warn(`⚠️ Too many files (${filteredFiles.length}), limiting to ${maxCount}`);
        req.files = filteredFiles.slice(0, maxCount);
      } else {
        req.files = filteredFiles;
      }
      
      console.log(`✅ Array files found: ${req.files.length} files`);
      return req.files;
    }
    
    console.log(`⚠️ No files found with fieldname: ${fieldName}`);
    return [];
  };
};

// ✅ EXTREME OPTIMIZATION: For 8-10KB file sizes
export const extremeOptimization = async (req, reply) => {
  try {
    if (!req.files || req.files.length === 0) return;

    const processedFiles = [];

    for (const file of req.files) {
      const originalPath = file.path;
      
      // Keep the random string in the new filename
      const baseFilename = path.basename(file.filename, path.extname(file.filename));
      const newFilename = baseFilename + '.webp';
      const outputPath = path.join(uploadDir, newFilename);

      try {
        // Get original image metadata
        const metadata = await sharp(originalPath).metadata();
        const { width: originalWidth, height: originalHeight, size: originalSize } = metadata;
        
        console.log(`📏 Original: ${file.filename}`);
        console.log(`   Size: ${(originalSize / 1024).toFixed(2)}KB`);
        console.log(`   Dimensions: ${originalWidth}x${originalHeight}`);

        // EXTREME RESIZING for tiny file sizes
        let targetWidth, targetHeight;
        
        // Calculate target dimensions based on original
        if (originalWidth > originalHeight) {
          // Landscape image - max width 400px
          targetWidth = Math.min(400, originalWidth);
          targetHeight = Math.round((targetWidth / originalWidth) * originalHeight);
        } else {
          // Portrait or square - max height 400px
          targetHeight = Math.min(400, originalHeight);
          targetWidth = Math.round((targetHeight / originalHeight) * originalWidth);
        }
        
        // Ensure minimum dimensions aren't too small
        if (targetWidth < 100) targetWidth = 100;
        if (targetHeight < 100) targetHeight = 100;
        
        console.log(`   ↘️ Resizing to: ${targetWidth}x${targetHeight}`);

        // Convert to WebP with EXTREME compression
        await sharp(originalPath)
          .resize(targetWidth, targetHeight, {
            fit: 'inside',
            withoutEnlargement: true,
            kernel: sharp.kernel.nearest // Fastest, less quality
          })
          .webp({ 
            quality: 40, // VERY LOW QUALITY
            effort: 6, // Maximum compression
            nearLossless: false, // Disable for smaller size
            smartSubsample: false, // Disable for smaller size
            alphaQuality: 50, // Lower alpha quality
            lossless: false // Disable lossless mode
          })
          .toFile(outputPath);

        // Get optimized file stats
        const optimizedStats = fs.statSync(outputPath);
        const savings = ((originalSize - optimizedStats.size) / originalSize * 100).toFixed(2);
        
        console.log(`✅ EXTREMELY Optimized: ${newFilename}`);
        console.log(`   New Size: ${(optimizedStats.size / 1024).toFixed(2)}KB`);
        console.log(`   Savings: ${savings}% reduction`);
        
        // If still too big, try even more aggressive settings
        if (optimizedStats.size > 15 * 1024) { // > 15KB
          console.log(`   ⚡ File still >15KB, applying ultra-compression...`);
          
          // Delete the first optimization
          safeDelete(outputPath);
          
          // Even smaller dimensions
          const ultraWidth = Math.max(150, Math.round(targetWidth * 0.7));
          const ultraHeight = Math.max(150, Math.round(targetHeight * 0.7));
          
          await sharp(originalPath)
            .resize(ultraWidth, ultraHeight, {
              fit: 'inside',
              withoutEnlargement: true
            })
            .webp({ 
              quality: 25, // Extremely low quality
              effort: 6,
              nearLossless: false,
              smartSubsample: false
            })
            .toFile(outputPath);
          
          const ultraStats = fs.statSync(outputPath);
          console.log(`   ⚡ Ultra-compressed: ${(ultraStats.size / 1024).toFixed(2)}KB`);
        }

        // Delete original file
        safeDelete(originalPath);

        // Update file object
        processedFiles.push({
          ...file,
          filename: newFilename,
          path: outputPath,
          mimetype: 'image/webp',
          size: fs.statSync(outputPath).size,
          width: targetWidth,
          height: targetHeight
        });

      } catch (error) {
        console.error(`❌ Failed to optimize ${file.filename}:`, error);
        // Fallback with even simpler optimization
        try {
          await sharp(originalPath)
            .resize(200, 200, { fit: 'inside' })
            .webp({ quality: 30 })
            .toFile(outputPath);
          
          safeDelete(originalPath);
          
          processedFiles.push({
            ...file,
            filename: newFilename,
            path: outputPath,
            mimetype: 'image/webp',
            size: fs.statSync(outputPath).size
          });
          
          console.log(`⚠️ Used fallback extreme optimization for: ${file.filename}`);
        } catch (fallbackError) {
          console.error(`❌ Fallback also failed for ${file.filename}`);
          processedFiles.push(file); // Keep original
        }
      }
    }

    req.files = processedFiles;
    return; // Continue to next handler
  } catch (err) {
    console.error('❌ Extreme optimization failed:', err);
    throw new DatabaseError(`Extreme optimization failed: ${err.message}`, {
      error: err.message
    });
  }
};

// ✅ ULTRA TINY OPTIMIZATION: Guaranteed < 10KB (for thumbnails)
export const ultraTinyOptimization = async (req, reply) => {
  try {
    if (!req.files || req.files.length === 0) return;

    const processedFiles = [];

    for (const file of req.files) {
      const originalPath = file.path;
      const baseFilename = path.basename(file.filename, path.extname(file.filename));
      const newFilename = baseFilename + '.webp';
      const outputPath = path.join(uploadDir, newFilename);

      try {
        const metadata = await sharp(originalPath).metadata();
        
        console.log(`🔄 Processing: ${file.filename} (${(metadata.size / 1024).toFixed(2)}KB)`);

        // ULTRA TINY settings
        const MAX_DIMENSION = 200; // Max width or height
        
        let attempts = 0;
        let currentQuality = 40;
        let finalSize = 0;
        
        do {
          attempts++;
          console.log(`   Attempt ${attempts}: Quality ${currentQuality}%`);
          
          await sharp(originalPath)
            .resize(MAX_DIMENSION, MAX_DIMENSION, {
              fit: 'inside',
              withoutEnlargement: true
            })
            .webp({
              quality: currentQuality,
              effort: 6,
              nearLossless: false,
              smartSubsample: false
            })
            .toFile(outputPath);
          
          const stats = fs.statSync(outputPath);
          finalSize = stats.size;
          
          console.log(`   → Size: ${(finalSize / 1024).toFixed(2)}KB`);
          
          // Reduce quality for next attempt if still too large
          if (finalSize > 10 * 1024 && currentQuality > 20) {
            currentQuality -= 5;
          }
          
          // If still too large after quality reduction, reduce dimensions
          if (finalSize > 10 * 1024 && currentQuality <= 20) {
            await sharp(originalPath)
              .resize(150, 150, { fit: 'inside' })
              .webp({ quality: 20, effort: 6 })
              .toFile(outputPath);
            finalSize = fs.statSync(outputPath).size;
            console.log(`   → Reduced to 150x150: ${(finalSize / 1024).toFixed(2)}KB`);
          }
          
        } while (finalSize > 10 * 1024 && attempts < 3); // Max 3 attempts
        
        safeDelete(originalPath);
        
        processedFiles.push({
          ...file,
          filename: newFilename,
          path: outputPath,
          mimetype: 'image/webp',
          size: finalSize
        });
        
        console.log(`✅ ULTRA TINY: ${newFilename} - ${(finalSize / 1024).toFixed(2)}KB`);
        
      } catch (error) {
        console.error(`❌ Ultra tiny optimization failed: ${error.message}`);
        processedFiles.push(file);
      }
    }

    req.files = processedFiles;
    return; // Continue to next handler
  } catch (err) {
    console.error('❌ Ultra tiny optimization failed:', err);
    throw new DatabaseError(`Ultra tiny optimization failed: ${err.message}`, {
      error: err.message
    });
  }
};

// ✅ SMART OPTIMIZATION: Balances size and quality, targets specific size ranges
export const smartSizeOptimization = (targetMaxKB = 10) => {
  return async (req, reply) => {
    try {
      if (!req.files || req.files.length === 0) return;

      const processedFiles = [];

      for (const file of req.files) {
        const originalPath = file.path;
        const baseFilename = path.basename(file.filename, path.extname(file.filename));
        const newFilename = baseFilename + '.webp';
        const outputPath = path.join(uploadDir, newFilename);

        try {
          const metadata = await sharp(originalPath).metadata();
          const originalSizeKB = metadata.size / 1024;
          
          console.log(`🎯 Targeting ${targetMaxKB}KB for: ${file.filename} (${originalSizeKB.toFixed(2)}KB)`);

          let quality = 70;
          let width = Math.min(400, metadata.width);
          let height = Math.min(400, metadata.height);
          
          // Adjust based on original size
          if (originalSizeKB > 1000) { // > 1MB
            quality = 40;
            width = Math.min(300, metadata.width);
            height = Math.min(300, metadata.height);
          } else if (originalSizeKB > 500) { // > 500KB
            quality = 50;
            width = Math.min(350, metadata.width);
            height = Math.min(350, metadata.height);
          }

          // Initial optimization
          await sharp(originalPath)
            .resize(width, height, { fit: 'inside' })
            .webp({ quality, effort: 6 })
            .toFile(outputPath);

          let finalSize = fs.statSync(outputPath).size;
          let finalSizeKB = finalSize / 1024;
          
          // Reduce until target is met
          while (finalSizeKB > targetMaxKB && quality > 20) {
            quality -= 5;
            await sharp(originalPath)
              .resize(Math.max(100, width - 50), Math.max(100, height - 50), { fit: 'inside' })
              .webp({ quality, effort: 6 })
              .toFile(outputPath);
            finalSize = fs.statSync(outputPath).size;
            finalSizeKB = finalSize / 1024;
          }

          safeDelete(originalPath);
          
          processedFiles.push({
            ...file,
            filename: newFilename,
            path: outputPath,
            mimetype: 'image/webp',
            size: finalSize
          });
          
          console.log(`✅ Optimized to: ${finalSizeKB.toFixed(2)}KB (target: ${targetMaxKB}KB)`);
          
        } catch (error) {
          console.error(`❌ Smart optimization failed: ${error.message}`);
          processedFiles.push(file);
        }
      }

      req.files = processedFiles;
      return; // Continue to next handler
    } catch (err) {
      console.error('❌ Smart optimization failed:', err);
      throw new DatabaseError(`Smart optimization failed: ${err.message}`, {
        error: err.message
      });
    }
  };
};

// ✅ Test function to check if optimization works
export const testOptimization = async (req, reply) => {
  // Create a test image if none exists
  const testPath = 'test-image.jpg';
  
  if (!fs.existsSync(testPath)) {
    // Create a simple test image
    const { createCanvas } = await import('canvas');
    const canvas = createCanvas(800, 600);
    const ctx = canvas.getContext('2d');
    
    // Draw something
    ctx.fillStyle = '#3498db';
    ctx.fillRect(0, 0, 800, 600);
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.arc(400, 300, 100, 0, Math.PI * 2);
    ctx.fill();
    
    const buffer = canvas.toBuffer('image/jpeg');
    fs.writeFileSync(testPath, buffer);
    console.log(`Created test image: ${testPath}`);
  }

  // Test optimization
  const outputPath = path.join(uploadDir, `test-${Date.now()}.webp`);
  
  try {
    await sharp(testPath)
      .resize(300, 200, { fit: 'inside' })
      .webp({ 
        quality: 40,
        effort: 6
      })
      .toFile(outputPath);
    
    const originalStats = fs.statSync(testPath);
    const optimizedStats = fs.statSync(outputPath);
    
    reply.send({
      success: true,
      message: 'Optimization Test',
      original: {
        path: testPath,
        size: `${(originalStats.size / 1024).toFixed(2)}KB`
      },
      optimized: {
        path: outputPath,
        size: `${(optimizedStats.size / 1024).toFixed(2)}KB`,
        reduction: `${((originalStats.size - optimizedStats.size) / originalStats.size * 100).toFixed(1)}%`
      }
    });
    
  } catch (error) {
    throw new DatabaseError(`Test optimization failed: ${error.message}`, {
      error: error.message
    });
  }
};

// Export all functions
export default {
  processFiles,
  processSingleFile,
  processArrayFiles,
  extremeOptimization,
  ultraTinyOptimization,
  smartSizeOptimization,
  testOptimization
};