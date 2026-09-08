// routes/productRoutes.js
import {
    getAllProducts,
    getProductById,
    getProductBySlug,
    createProduct,
    updateProduct,
    deleteProduct,
    getFeaturedProducts,
    getFeaturedPriceRanges,
    getFilteredFeaturedProducts,
    searchProducts,
    quickSearchProducts,
    uploadVariantImages,
    getOfferProducts,
    generateProductContentWithGemini,
    generateImageWithPollinations
} from '../controller/productController.js';

import { processAndUploadToR2, processSingleFileToR2, processArrayFilesToR2 } from '../middleware/uploadMiddlewareR2.js';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import crypto from 'crypto';
import { DatabaseError } from '../utils/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Ensure uploads folder exists (for backward compatibility)
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// ✅ Generate unique filename
const generateUniqueFilename = (originalname, fieldname) => {
    const ext = path.extname(originalname);
    const randomString = crypto.randomBytes(4).toString('hex');
    const safeFieldname = fieldname.replace(/[^a-zA-Z0-9]/g, '_');
    return `${Date.now()}-${randomString}-${safeFieldname}${ext}`;
};

// ✅ Extract value from field object
const extractValue = (field) => {
    if (field === undefined || field === null) return undefined;
    if (typeof field === 'object' && field.value !== undefined) {
        return field.value;
    }
    if (typeof field === 'object' && field.type === 'field') {
        return field.value;
    }
    return field;
};

// ✅ Check if field is a file
const isFile = (field) => {
    return field && typeof field === 'object' && (field.type === 'file' || field.file);
};

// ✅ Process a single file (legacy - for backward compatibility)
const processFile = async (file, fieldname) => {
    try {
        console.log(`   📥 Processing file: ${file.filename}`);
        
        const buffer = await file.toBuffer();
        const filename = generateUniqueFilename(file.filename, fieldname);
        const filePath = path.join(uploadDir, filename);
        
        fs.writeFileSync(filePath, buffer);
        
        try {
            const webpPath = filePath.replace(/\.[^.]+$/, '.webp');
            await sharp(buffer)
                .webp({ quality: 80 })
                .toFile(webpPath);
            fs.unlinkSync(filePath);
            
            const fileObj = {
                fieldname: fieldname,
                originalname: file.filename,
                filename: path.basename(webpPath),
                path: webpPath,
                mimetype: 'image/webp',
                size: fs.statSync(webpPath).size
            };
            console.log(`   ✅ File saved: ${path.basename(webpPath)}`);
            return fileObj;
        } catch (error) {
            const fileObj = {
                fieldname: fieldname,
                originalname: file.filename,
                filename: filename,
                path: filePath,
                mimetype: file.mimetype,
                size: fs.statSync(filePath).size
            };
            console.log(`   ✅ File saved (fallback): ${filename}`);
            return fileObj;
        }
    } catch (error) {
        console.error(`   ❌ Error processing file:`, error);
        return null;
    }
};

// ✅ Process uploaded files from Fastify multipart (legacy)
const processUploadedFiles = async (req) => {
    const files = [];
    const fields = {};

    if (!req.body) return { files, fields };

    for (const [key, value] of Object.entries(req.body)) {
        if (Array.isArray(value) && value.length > 0 && isFile(value[0])) {
            console.log(`📥 Processing ${value.length} files for field: ${key}`);
            for (const file of value) {
                const processed = await processFile(file, key);
                if (processed) files.push(processed);
            }
        }
        else if (isFile(value)) {
            console.log(`📥 Processing single file for field: ${key}`);
            const processed = await processFile(value, key);
            if (processed) files.push(processed);
        }
        else {
            fields[key] = extractValue(value);
        }
    }

    console.log(`📋 Extracted fields:`, Object.keys(fields));
    console.log(`📁 Processed files: ${files.length}`);
    
    return { files, fields };
};

export default async function productRoutes(fastify, opts) {
    // ✅ Routes - Specific first, parameter routes last
    fastify.get('/', getAllProducts);
    fastify.get('/featured', getFeaturedProducts);
    fastify.get('/featured/price-ranges', getFeaturedPriceRanges);
    fastify.get('/featured/filter', getFilteredFeaturedProducts);
    fastify.get('/search', searchProducts);
    fastify.get('/quick-search', quickSearchProducts);
    fastify.get('/offers', getOfferProducts);
    fastify.get('/:id', getProductById);
    fastify.get('/slug/:slug', getProductBySlug);

    // ✅ Generate product preview content (no database save)
    fastify.post('/generate-preview', {
        handler: async (req, reply) => {
            try {
                const { name } = req.body;
                
                if (!name || !name.trim()) {
                    return reply.status(400).send({
                        success: false,
                        message: 'Product name is required'
                    });
                }
                
                console.log(`🔄 Generating product preview for: ${name.trim()}`);
                
                const generated = await generateProductContentWithGemini(name.trim());
                
                return reply.status(200).send({
                    success: true,
                    data: generated
                });
            } catch (error) {
                console.error('❌ Product preview generation error:', error);
                return reply.status(500).send({
                    success: false,
                    message: error.message || 'Failed to generate preview'
                });
            }
        }
    });

    // ✅ Generate product image using Pollinations.ai (no database save)
    fastify.post('/generate-image-preview', {
        handler: async (req, reply) => {
            try {
                const { name } = req.body;
                
                if (!name || !name.trim()) {
                    return reply.status(400).send({
                        success: false,
                        message: 'Product name is required'
                    });
                }
                
                console.log(`🖼️ Generating product image for: ${name.trim()}`);
                
                const imagePath = await generateImageWithPollinations(name.trim());
                
                if (!imagePath) {
                    return reply.status(500).send({
                        success: false,
                        message: 'Failed to generate image'
                    });
                }
                
                return reply.status(200).send({
                    success: true,
                    data: {
                        imagePath: imagePath,
                        imageUrl: imagePath
                    }
                });
            } catch (error) {
                console.error('❌ Product image generation error:', error);
                return reply.status(500).send({
                    success: false,
                    message: error.message || 'Failed to generate image'
                });
            }
        }
    });

    // ✅ CREATE PRODUCT - with R2 upload (CORRECTED)
    fastify.post('/', {
        preHandler: async (req, reply) => {
            console.log('\n🔵 ========== CREATE PRODUCT ==========');
            
            // ✅ FIRST: Process regular form fields
            const fields = {};
            const fileFields = [];
            
            for (const [key, value] of Object.entries(req.body)) {
                // Check if it's a file
                if (value && typeof value === 'object' && (value.type === 'file' || value.file)) {
                    fileFields.push({ key, value });
                } 
                // Check if it's an array of files
                else if (Array.isArray(value) && value.length > 0 && value[0] && typeof value[0] === 'object' && (value[0].type === 'file' || value[0].file)) {
                    for (const file of value) {
                        fileFields.push({ key, value: file });
                    }
                }
                // Regular field
                else {
                    fields[key] = extractValue(value);
                }
            }
            
            // ✅ SECOND: Convert file fields to the format processAndUploadToR2 expects
            const fileObjects = [];
            for (const { key, value } of fileFields) {
                try {
                    const buffer = await value.toBuffer();
                    const fileObj = {
                        fieldname: key,
                        originalname: value.filename || 'image.jpg',
                        filename: value.filename || 'image.jpg',
                        buffer: buffer,
                        mimetype: value.mimetype || 'image/jpeg',
                        size: buffer.length
                    };
                    fileObjects.push(fileObj);
                    console.log(`📥 Extracted file: ${fileObj.originalname} (${(buffer.length / 1024).toFixed(2)} KB)`);
                } catch (error) {
                    console.error(`❌ Failed to extract file ${key}:`, error);
                }
            }
            
            // ✅ THIRD: Set req.files for the R2 upload function
            req.files = fileObjects;
            
            // ✅ FOURTH: Process files to R2
            if (req.files && req.files.length > 0) {
                console.log(`📁 Processing ${req.files.length} files to R2...`);
                // ✅ UPDATED: Upload to backend-images/products
                await processAndUploadToR2(req, 'backend-images/products');
            } else {
                console.log('📁 No files to upload to R2');
            }
            
            // ✅ FIFTH: Set req.body with extracted fields
            req.body = { ...fields };
            
            console.log('📋 After extraction - req.body keys:', Object.keys(req.body));
            console.log(`📁 Total files processed: ${req.files?.length || 0}`);
            req.files?.forEach((f, i) => {
                console.log(`   File ${i + 1}: ${f.fieldname} -> ${f.filename} (R2: ${f.url})`);
            });
            
            // ✅ Convert string values to proper types
            if (req.body.basePrice) {
                req.body.basePrice = parseFloat(req.body.basePrice);
            }
            if (req.body.originalPrice) {
                req.body.originalPrice = parseFloat(req.body.originalPrice);
            }
            if (req.body.discountPercentage) {
                req.body.discountPercentage = parseFloat(req.body.discountPercentage);
            }
            if (req.body.stock) {
                req.body.stock = parseInt(req.body.stock);
            } else if (req.body.stock === undefined || req.body.stock === null) {
                req.body.stock = 0;
            }
            if (req.body.rating) {
                req.body.rating = parseFloat(req.body.rating);
            }
            if (req.body.numberOfReviews) {
                req.body.numberOfReviews = parseInt(req.body.numberOfReviews);
            }
            if (req.body.displayOrder) {
                req.body.displayOrder = parseInt(req.body.displayOrder);
            }
            
            // ✅ Convert boolean strings
            ['hasOffer', 'featured', 'autoGenerateContent'].forEach(key => {
                if (req.body[key] === 'true') req.body[key] = true;
                if (req.body[key] === 'false') req.body[key] = false;
            });
            
            // ✅ Parse JSON fields
            ['specifications', 'keyFeatures', 'metaKeywords', 'variants', 'sizes'].forEach(key => {
                if (req.body[key] && typeof req.body[key] === 'string') {
                    try {
                        req.body[key] = JSON.parse(req.body[key]);
                    } catch (e) {
                        console.log(`⚠️ Failed to parse ${key}:`, e.message);
                    }
                }
            });
            
            console.log('✅ FINAL req.body:', JSON.stringify(req.body, null, 2));
            console.log(`📁 Files: ${req.files?.length || 0}`);
            console.log('=====================================\n');
        }
    }, createProduct);

    // ✅ UPDATE PRODUCT - with R2 upload (CORRECTED)
    fastify.put('/:id', {
        preHandler: async (req, reply) => {
            console.log('\n🔵 ========== UPDATE PRODUCT ==========');
            
            // ✅ FIRST: Process regular form fields
            const fields = {};
            const fileFields = [];
            
            for (const [key, value] of Object.entries(req.body)) {
                if (value && typeof value === 'object' && (value.type === 'file' || value.file)) {
                    fileFields.push({ key, value });
                } 
                else if (Array.isArray(value) && value.length > 0 && value[0] && typeof value[0] === 'object' && (value[0].type === 'file' || value[0].file)) {
                    for (const file of value) {
                        fileFields.push({ key, value: file });
                    }
                }
                else {
                    fields[key] = extractValue(value);
                }
            }
            
            // ✅ SECOND: Convert file fields
            const fileObjects = [];
            for (const { key, value } of fileFields) {
                try {
                    const buffer = await value.toBuffer();
                    const fileObj = {
                        fieldname: key,
                        originalname: value.filename || 'image.jpg',
                        filename: value.filename || 'image.jpg',
                        buffer: buffer,
                        mimetype: value.mimetype || 'image/jpeg',
                        size: buffer.length
                    };
                    fileObjects.push(fileObj);
                    console.log(`📥 Extracted file: ${fileObj.originalname} (${(buffer.length / 1024).toFixed(2)} KB)`);
                } catch (error) {
                    console.error(`❌ Failed to extract file ${key}:`, error);
                }
            }
            
            req.files = fileObjects;
            
            // ✅ Process files to R2
            if (req.files && req.files.length > 0) {
                console.log(`📁 Processing ${req.files.length} files to R2...`);
                // ✅ UPDATED: Upload to backend-images/products
                await processAndUploadToR2(req, 'backend-images/products');
            } else {
                console.log('📁 No files to upload to R2');
            }
            
            req.body = { ...fields };
            
            console.log(`📁 Total files: ${req.files?.length || 0}`);
            
            if (req.body.basePrice) req.body.basePrice = parseFloat(req.body.basePrice);
            if (req.body.originalPrice) req.body.originalPrice = parseFloat(req.body.originalPrice);
            if (req.body.discountPercentage) req.body.discountPercentage = parseFloat(req.body.discountPercentage);
            if (req.body.stock) req.body.stock = parseInt(req.body.stock);
            
            ['hasOffer', 'featured', 'autoGenerateContent'].forEach(key => {
                if (req.body[key] === 'true') req.body[key] = true;
                if (req.body[key] === 'false') req.body[key] = false;
            });
            
            ['specifications', 'keyFeatures', 'metaKeywords', 'variants', 'sizes', 'deletedMainImages', 'deletedVariantImages'].forEach(key => {
                if (req.body[key] && typeof req.body[key] === 'string') {
                    try {
                        req.body[key] = JSON.parse(req.body[key]);
                    } catch (e) {}
                }
            });
            
            console.log('✅ FINAL req.body ready');
            console.log('=====================================\n');
        }
    }, updateProduct);

    // ✅ UPLOAD VARIANT IMAGES - with R2 upload (CORRECTED)
    fastify.post('/:productId/variants/:variantIndex/images', {
        preHandler: async (req, reply) => {
            console.log('\n🔵 ========== UPLOAD VARIANT IMAGES ==========');
            
            const fields = {};
            const fileFields = [];
            
            for (const [key, value] of Object.entries(req.body)) {
                if (value && typeof value === 'object' && (value.type === 'file' || value.file)) {
                    fileFields.push({ key, value });
                } 
                else if (Array.isArray(value) && value.length > 0 && value[0] && typeof value[0] === 'object' && (value[0].type === 'file' || value[0].file)) {
                    for (const file of value) {
                        fileFields.push({ key, value: file });
                    }
                }
                else {
                    fields[key] = extractValue(value);
                }
            }
            
            const fileObjects = [];
            for (const { key, value } of fileFields) {
                try {
                    const buffer = await value.toBuffer();
                    fileObjects.push({
                        fieldname: key,
                        originalname: value.filename || 'image.jpg',
                        filename: value.filename || 'image.jpg',
                        buffer: buffer,
                        mimetype: value.mimetype || 'image/jpeg',
                        size: buffer.length
                    });
                } catch (error) {
                    console.error(`❌ Failed to extract file ${key}:`, error);
                }
            }
            
            req.files = fileObjects;
            
            if (req.files && req.files.length > 0) {
                // ✅ UPDATED: Upload to backend-images/products
                await processAndUploadToR2(req, 'backend-images/products');
            }
            
            req.body = { ...fields };
        }
    }, uploadVariantImages);

    // ✅ DELETE PRODUCT
    fastify.delete('/:id', deleteProduct);
}