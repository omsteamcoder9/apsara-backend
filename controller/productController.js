// controllers/productController.js
import Product from '../models/productModel.js';
import Category from '../models/Category.js';
import slugify from 'slugify';
import path from 'path';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import axios from 'axios';
import sharp from 'sharp';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  DatabaseError
} from '../utils/errors.js';
import { uploadFileToR2, deleteFileFromR2 } from '../services/r2Service.js';

// ===== DEBUG: PRODUCT CONTROLLER =====
console.log('🟢 ===== PRODUCT CONTROLLER DEBUG =====');
console.log('🟢 GEMINI_API_KEY exists:', !!process.env.GEMINI_API_KEY);
console.log('🟢 GEMINI_API_KEY length:', process.env.GEMINI_API_KEY?.length);
console.log('🟢 R2 Configuration:', {
  accountId: process.env.R2_ACCOUNT_ID ? '✅ Set' : '❌ Missing',
  bucket: process.env.R2_BUCKET_NAME || '❌ Missing',
  endpoint: process.env.R2_ENDPOINT ? '✅ Set' : '❌ Missing',
});
console.log('🟢 ========================================');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Generate product content using Gemini API
export const generateProductContentWithGemini = async (productName) => {
  const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});
  try {
    console.log('🤖 Generating product content with Gemini...');
    console.log(`📦 Product: ${productName}`);

    console.log('🟢 INSIDE FUNCTION - API Key exists:', !!process.env.GEMINI_API_KEY);
    console.log('🟢 INSIDE FUNCTION - API Key length:', process.env.GEMINI_API_KEY?.length);

    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is missing');
    }

    const prompt = `Generate comprehensive content for an e-commerce product named "${productName}".

Include:

1. A compelling product description (300-500 words).
2. Product specifications as an array of objects with "key" and "value" (at least 5-8 useful specifications such as Material, Color, Size, Weight, etc.).
3. Key features as an array of strings (5-7 features highlighting useful product benefits).
4. SEO meta title (50-60 characters).
5. SEO meta description (150-160 characters).
6. Meta keywords as an array of 8-10 relevant keywords.
7. Canonical URL using the structure /products/product-slug.
8. OG title for social media (50-60 characters).
9. OG description for social media (150-160 characters).

Return ONLY valid JSON using exactly these keys:

{
  "description": "string",
  "specifications": [
    {
      "key": "string",
      "value": "string"
    }
  ],
  "keyFeatures": [
    "string"
  ],
  "metaTitle": "string",
  "metaDescription": "string",
  "metaKeywords": [
    "string"
  ],
  "canonicalUrl": "string",
  "ogTitle": "string",
  "ogDescription": "string"
}

Description writing requirements:

- Write natural, human-sounding e-commerce content.
- Make the description informative, useful, and persuasive without sounding artificial.
- Do NOT start the description with "Discover".
- Do NOT start with "Explore".
- Do NOT start with "Experience".
- Do NOT start with "Introducing".
- Do NOT start with "Upgrade".
- Do NOT start with "Unlock".
- Do NOT start with "Transform".
- Do NOT start with "Elevate".
- Do NOT start with "Shop our".
- Do NOT use generic AI marketing openings.
- Start directly with the product name, product type, main feature, or a specific customer benefit.
- The first sentence must immediately explain what the product is or its primary benefit.
- Avoid repetitive openings between different products.
- Use varied sentence structures.
- Avoid excessive promotional language.
- Do not make unsupported claims.
- Do not invent highly specific technical specifications that are not known from the product name.
- Naturally include relevant keywords.
- Do not keyword-stuff.
- Do not mention AI or content generation.

SEO requirements:

- Meta title should be concise and SEO-friendly.
- Meta description should clearly explain the product and encourage clicks.
- Meta keywords must be relevant to the product.
- Canonical URL must be lowercase and SEO-friendly.
- OG title should be suitable for social sharing.
- OG description should be natural and informative.

Return valid JSON only.`;

    console.log('📤 Sending request to Gemini API...');

    const response = await genAI.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = response.text;

    console.log('✅ Gemini product response received');
    console.log('📝 Gemini response:', text);

    if (!text) {
      throw new Error('Gemini returned an empty response');
    }

    let cleanText = text
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const startIndex = cleanText.indexOf('{');
    const endIndex = cleanText.lastIndexOf('}');

    if (startIndex === -1 || endIndex === -1) {
      throw new Error('Gemini response does not contain valid JSON');
    }

    cleanText = cleanText.substring(startIndex, endIndex + 1);

    const parsed = JSON.parse(cleanText);

    console.log('✅ Gemini product JSON parsed successfully');

    return {
      description:
        parsed.description ||
        `${productName} is designed to provide reliable quality, practical performance, and comfortable everyday use.`,

      specifications:
        Array.isArray(parsed.specifications)
          ? parsed.specifications
          : [],

      keyFeatures:
        Array.isArray(parsed.keyFeatures)
          ? parsed.keyFeatures
          : [],

      metaTitle: (
        parsed.metaTitle ||
        `${productName} - Premium Quality`
      ).substring(0, 100),

      metaDescription: (
        parsed.metaDescription ||
        `${productName} offers quality, practical features, and reliable value for everyday use.`
      ).substring(0, 160),

      metaKeywords:
        Array.isArray(parsed.metaKeywords)
          ? parsed.metaKeywords
          : [
              productName,
              'buy',
              'shop',
              'online',
              'quality'
            ],

      canonicalUrl:
        parsed.canonicalUrl ||
        `/products/${slugify(productName, {
          lower: true,
          strict: true
        })}`,

      ogTitle: (
        parsed.ogTitle ||
        `${productName} - Premium Quality`
      ).substring(0, 100),

      ogDescription: (
        parsed.ogDescription ||
        `${productName} combines quality, practical design, and dependable performance for everyday use.`
      ).substring(0, 160)
    };

  } catch (error) {
    console.error('❌ Gemini API error:', error);
    console.error('❌ Error message:', error?.message);
    console.error('❌ Error status:', error?.status);

    throw new Error(
      error?.message || 'Gemini API failed'
    );
  }
};

// controllers/productController.js

// ✅ Generate image using Pollinations.ai - UPDATED folder path
export const generateImageWithPollinations = async (productName) => {
    try {
        const imagePrompt = `High quality professional product photography for ${productName} product, e-commerce style, clean white background, studio lighting, 4K, detailed, commercial photography`;
        const encodedPrompt = encodeURIComponent(imagePrompt);
        const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}`;
        
        console.log(`🖼️ Generating product image for: ${productName}`);
        
        const response = await axios({
            method: 'get',
            url: imageUrl,
            responseType: 'arraybuffer',
            timeout: 30000
        });

        const timestamp = Date.now();
        const random = Math.round(Math.random() * 1E9);
        const filename = `${timestamp}-${random}.webp`;
        
        // ✅ UPDATED: Upload to backend-images/products
        const result = await uploadFileToR2(
            response.data, 
            filename, 
            'backend-images/products',  // ← Changed from 'products'
            'image/webp'
        );

        console.log(`✅ Product image uploaded to R2: ${result.url}`);
        return result.url;
        
    } catch (error) {
        console.error('❌ Error generating product image with Pollinations:', error);
        return null;
    }
};

// Helper function to delete image files (UPDATED for R2)
const deleteImageFile = async (imagePath) => {
  if (!imagePath) return false;

  try {
    // Check if it's an R2 URL
    if (imagePath.includes('r2.cloudflarestorage.com') || 
        imagePath.includes(process.env.R2_PUBLIC_URL)) {
      console.log(`🗑️ Deleting from R2: ${imagePath}`);
      const result = await deleteFileFromR2(imagePath);
      return result.success;
    }
    
    // For backward compatibility - local file deletion
    console.log('🔍 Attempting to delete local file:', imagePath);

    const uploadsFolder = path.join(process.cwd(), 'uploads');
    let filename = '';

    if (imagePath.includes('/uploads/')) {
      const parts = imagePath.split('/uploads/');
      filename = parts[parts.length - 1];
    } else if (imagePath.includes('uploads/')) {
      const parts = imagePath.split('uploads/');
      filename = parts[parts.length - 1];
    } else if (imagePath.includes('\\')) {
      const parts = imagePath.split('\\');
      filename = parts[parts.length - 1];
    } else {
      filename = imagePath;
    }

    filename = filename.split('?')[0].split('#')[0];
    filename = filename.replace(/^[/\\]+|[/\\]+$/g, '');
    
    const filePath = path.join(uploadsFolder, filename);

    console.log(`📁 Looking for: ${filename} in ${uploadsFolder}`);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`✅ DELETED: ${filename}`);
      return true;
    } else {
      console.log(`❌ File not found: ${filename}`);
      
      if (fs.existsSync(uploadsFolder)) {
        const files = fs.readdirSync(uploadsFolder);
        const matchedFile = files.find(f => 
          f.toLowerCase() === filename.toLowerCase()
        );
        
        if (matchedFile) {
          const matchedPath = path.join(uploadsFolder, matchedFile);
          fs.unlinkSync(matchedPath);
          console.log(`✅ DELETED (case-insensitive): ${matchedFile}`);
          return true;
        }
      }
      
      return false;
    }
  } catch (error) {
    console.error('❌ Error deleting file:', error);
    return false;
  }
};

// ============================================
// CREATE PRODUCT
// ============================================
export const createProduct = async (req, reply) => {
  const {
    name,
    basePrice,
    description,
    category,
    rating,
    seller,
    stock,
    numberOfReviews,
    specifications,
    keyFeatures,
    variants,
    sizes,
    metaTitle,
    metaDescription,
    metaKeywords,
    canonicalUrl,
    ogTitle,
    ogDescription,
    autoGenerateContent,
    existingImagePath
  } = req.body;

  console.log('📥 Received product data:', req.body);
  console.log('📁 Uploaded files:', req.files?.map(f => ({
    fieldname: f.fieldname,
    filename: f.filename,
    originalname: f.originalname,
    url: f.url || 'R2 URL'
  })));

  let finalDescription = description || '';
  let finalSpecifications = specifications || [];
  let finalKeyFeatures = keyFeatures || [];
  let finalMetaTitle = metaTitle || '';
  let finalMetaDescription = metaDescription || '';
  let finalMetaKeywords = metaKeywords || [];
  let finalCanonicalUrl = canonicalUrl || '';
  let finalOgTitle = ogTitle || '';
  let finalOgDescription = ogDescription || '';

  if (autoGenerateContent === true || autoGenerateContent === 'true') {
    if (!description && !specifications && !keyFeatures && !metaTitle && !metaDescription) {
      console.log(`🔄 Generating content for product: ${name.trim()}`);
      const generated = await generateProductContentWithGemini(name.trim());
      
      finalDescription = generated.description;
      finalSpecifications = generated.specifications;
      finalKeyFeatures = generated.keyFeatures;
      finalMetaTitle = generated.metaTitle;
      finalMetaDescription = generated.metaDescription;
      finalMetaKeywords = generated.metaKeywords;
      finalCanonicalUrl = generated.canonicalUrl;
      finalOgTitle = generated.ogTitle;
      finalOgDescription = generated.ogDescription;
    }
  }

  let finalBasePrice = parseFloat(basePrice);
  let finalOriginalPrice = parseFloat(basePrice);
  let finalDiscountPercentage = 0;
  let finalHasOffer = false;

  if (req.body.hasOffer === true || req.body.hasOffer === 'true') {
    if (req.body.originalPrice && req.body.basePrice) {
      const original = parseFloat(req.body.originalPrice);
      const base = parseFloat(req.body.basePrice);
      const discountAmount = original - base;
      const discountPercentage = (discountAmount / original) * 100;

      finalHasOffer = true;
      finalOriginalPrice = original;
      finalBasePrice = base;
      finalDiscountPercentage = Math.round(discountPercentage * 100) / 100;

      console.log('🎯 Offer calculated from both prices:', {
        originalPrice: finalOriginalPrice,
        basePrice: finalBasePrice,
        discountPercentage: finalDiscountPercentage + '%',
        discountAmount
      });
    }
    else if (req.body.originalPrice && req.body.discountPercentage) {
      finalHasOffer = true;
      finalOriginalPrice = parseFloat(req.body.originalPrice);
      finalDiscountPercentage = parseFloat(req.body.discountPercentage);
      const discountAmount = (finalOriginalPrice * finalDiscountPercentage) / 100;
      finalBasePrice = finalOriginalPrice - discountAmount;

      console.log('🎯 Offer Applied:', {
        originalPrice: finalOriginalPrice,
        discountPercentage: finalDiscountPercentage + '%',
        discountAmount,
        finalPrice: finalBasePrice
      });
    }
    else if (req.body.basePrice && !req.body.originalPrice && !req.body.discountPercentage) {
      const assumedMarkup = 1.25;
      finalBasePrice = parseFloat(req.body.basePrice);
      finalOriginalPrice = finalBasePrice * assumedMarkup;
      finalDiscountPercentage = ((assumedMarkup - 1) / assumedMarkup) * 100;
      finalHasOffer = true;

      console.log('🎯 Offer auto-calculated with assumed markup:', {
        basePrice: finalBasePrice,
        assumedOriginalPrice: finalOriginalPrice,
        discountPercentage: finalDiscountPercentage + '%'
      });
    }
    else {
      finalHasOffer = false;
      finalBasePrice = parseFloat(basePrice);
      finalOriginalPrice = finalBasePrice;
      finalDiscountPercentage = 0;
      console.log('⚠️ hasOffer is true but no pricing data provided. Setting hasOffer to false.');
    }
  }

  const missingFields = [];
  if (!name) missingFields.push('name');
  if (!basePrice) missingFields.push('basePrice');
  if (!description) missingFields.push('description');
  if (!seller) missingFields.push('seller');
  if (!category) missingFields.push('category');

  if (missingFields.length > 0) {
    throw new ValidationError(`Missing required fields: ${missingFields.join(', ')}`, {
      missingFields
    });
  }

  let parsedSpecifications = [];
  if (finalSpecifications) {
    parsedSpecifications = typeof finalSpecifications === 'string'
      ? JSON.parse(finalSpecifications)
      : finalSpecifications;
  }

  let parsedKeyFeatures = [];
  if (finalKeyFeatures) {
    if (typeof finalKeyFeatures === 'string') {
      try {
        parsedKeyFeatures = JSON.parse(finalKeyFeatures);
      } catch (error) {
        parsedKeyFeatures = finalKeyFeatures
          .split(',')
          .map(feature => feature.trim())
          .filter(feature => feature !== '');
      }
    } else if (Array.isArray(finalKeyFeatures)) {
      parsedKeyFeatures = finalKeyFeatures
        .map(feature => typeof feature === 'string' ? feature.trim() : feature)
        .filter(feature => feature && feature !== '');
    }
  }

  let parsedSizes = [];
  if (sizes) {
    try {
      parsedSizes = typeof sizes === 'string'
        ? JSON.parse(sizes)
        : sizes;
      
      parsedSizes = parsedSizes.map(item => ({
        size: item.size,
        price: item.price !== undefined && item.price !== '' ? parseFloat(item.price) : null
      }));
      console.log('✅ Parsed sizes with prices:', parsedSizes);
    } catch (error) {
      console.error('❌ Error parsing sizes:', error);
      parsedSizes = [];
    }
  }

  let parsedMetaKeywords = [];
  if (finalMetaKeywords) {
    if (typeof finalMetaKeywords === 'string') {
      try {
        parsedMetaKeywords = JSON.parse(finalMetaKeywords);
      } catch (error) {
        parsedMetaKeywords = finalMetaKeywords
          .split(',')
          .map(keyword => keyword.trim())
          .filter(keyword => keyword !== '');
      }
    } else if (Array.isArray(finalMetaKeywords)) {
      parsedMetaKeywords = finalMetaKeywords.filter(keyword => keyword && keyword.trim() !== '');
    }
  }

  let parsedVariants = [];
  if (variants) {
    try {
      parsedVariants = typeof variants === 'string'
        ? JSON.parse(variants)
        : variants;

      parsedVariants = parsedVariants.map((variant, index) => {
        let variantSizes = [];
        if (variant.sizes && Array.isArray(variant.sizes)) {
          variantSizes = variant.sizes.map(item => ({
            size: item.size,
            price: item.price !== undefined && item.price !== '' ? parseFloat(item.price) : null
          }));
        }

        return {
          variantName: variant.variantName || `Pack ${index + 1}`,
          price: parseFloat(variant.price) || parseFloat(basePrice),
          originalPrice: variant.originalPrice ? parseFloat(variant.originalPrice) : undefined,
          description: variant.description || '',
          sizes: variantSizes,
          stock: parseInt(variant.stock) || 0,
          images: variant.images || [],
          sku: variant.sku || '',
          isDefault: variant.isDefault || (index === 0),
          status: variant.status || 'active',
          discountPercentage: variant.discountPercentage || 0,
          features: variant.features || []
        };
      });
    } catch (error) {
      console.error('❌ Error parsing variants:', error);
      parsedVariants = [];
    }
  }

  // ✅ Handle image - priority: uploaded file > existingImagePath > null
  let mainImages = [];
  
  if (req.files) {
    const uploadedImages = req.files
      .filter(file => file.fieldname === 'images')
      .map(file => ({
        image: file.url  // Use R2 URL
      }));
    mainImages = [...uploadedImages];
    console.log('📷 Using uploaded images from R2:', mainImages.length);
  }
  
  if (mainImages.length === 0 && existingImagePath) {
    mainImages = [{ image: existingImagePath }];
    console.log('📷 Using existing AI-generated image:', existingImagePath);
  }

  let ogImagePath = null;
  if (req.files) {
    const ogImageFile = req.files.find(file => file.fieldname === 'ogImage');
    if (ogImageFile) {
      ogImagePath = ogImageFile.url;  // Use R2 URL
      console.log('✅ OG Image found and saved:', ogImagePath);
    } else if (req.body.ogImage && typeof req.body.ogImage === 'string' && req.body.ogImage.trim() !== '') {
      ogImagePath = req.body.ogImage;
      console.log('✅ OG Image provided as URL:', ogImagePath);
    } else if (mainImages.length > 0) {
      ogImagePath = mainImages[0].image;
      console.log('ℹ️ OG Image not provided, using first main image as fallback:', ogImagePath);
    } else {
      console.log('ℹ️ OG Image not provided and no main images available');
    }
  } else if (req.body.ogImage && typeof req.body.ogImage === 'string' && req.body.ogImage.trim() !== '') {
    ogImagePath = req.body.ogImage;
    console.log('✅ OG Image provided as URL (no files uploaded):', ogImagePath);
  }

  const variantImagesMap = {};
  if (req.files && parsedVariants.length > 0) {
    req.files.forEach(file => {
      const variantMatch = file.fieldname.match(/variants\[(\d+)\]\.images/);
      if (variantMatch) {
        const variantIndex = parseInt(variantMatch[1]);
        if (!variantImagesMap[variantIndex]) {
          variantImagesMap[variantIndex] = [];
        }
        variantImagesMap[variantIndex].push({
          image: file.url  // Use R2 URL
        });
      }
    });

    parsedVariants = parsedVariants.map((variant, index) => ({
      ...variant,
      images: variantImagesMap[index] || variant.images || []
    }));
  }

  const totalStock = parsedVariants.length > 0
    ? parsedVariants.reduce((sum, variant) => sum + (variant.stock || 0), 0)
    : parseInt(stock) || 0;

  if (totalStock <= 0) {
    throw new ValidationError('Total stock must be greater than 0', {
      totalStock
    });
  }

  console.log('📊 Final product data:', {
    name,
    variantsCount: parsedVariants.length,
    variantImages: parsedVariants.map(v => v.images.length),
    mainImagesCount: mainImages.length,
    hasOffer: finalHasOffer,
    originalPrice: finalOriginalPrice,
    discountPercentage: finalDiscountPercentage,
    finalPrice: finalBasePrice,
    sizes: parsedSizes,
    metaTitle: finalMetaTitle || '(not set)',
    metaDescriptionLength: finalMetaDescription ? finalMetaDescription.length : 0,
    metaKeywordsCount: parsedMetaKeywords.length,
    ogImagePath: ogImagePath || '(none)',
    autoGenerated: autoGenerateContent === true || autoGenerateContent === 'true',
    imageSource: existingImagePath ? 'AI-generated' : (mainImages.length > 0 ? 'uploaded' : 'none')
  });

  const product = new Product({
    name,
    basePrice: finalBasePrice,
    originalPrice: finalOriginalPrice,
    discountPercentage: finalDiscountPercentage,
    hasOffer: finalHasOffer,
    description: finalDescription,
    category: category || null,
    rating: rating || 0,
    seller,
    stock: totalStock,
    numberOfReviews: numberOfReviews || 0,
    specifications: parsedSpecifications,
    keyFeatures: parsedKeyFeatures,
    sizes: parsedSizes,
    variants: parsedVariants,
    images: mainImages,
    metaTitle: finalMetaTitle || '',
    metaDescription: finalMetaDescription || '',
    metaKeywords: parsedMetaKeywords,
    canonicalUrl: finalCanonicalUrl || '',
    ogTitle: finalOgTitle || '',
    ogDescription: finalOgDescription || '',
    ogImage: ogImagePath,
    status: 'active',
    featured: false
  });

  const savedProduct = await product.save();

  console.log('✅ Product created with sizes:', {
    id: savedProduct._id,
    sizes: savedProduct.sizes,
    variantSizes: savedProduct.variants.map(v => v.sizes),
    variantImages: savedProduct.variants.map(v => v.images.length),
    hasOffer: savedProduct.hasOffer,
    priceDetails: {
      original: savedProduct.originalPrice,
      discount: savedProduct.discountPercentage + '%',
      final: savedProduct.basePrice
    },
    seoSaved: {
      metaTitle: savedProduct.metaTitle ? 'Yes' : 'No',
      metaDescription: savedProduct.metaDescription ? 'Yes' : 'No',
      metaKeywords: savedProduct.metaKeywords?.length || 0,
      ogImage: savedProduct.ogImage ? 'Yes' : 'No'
    },
    imagesCount: savedProduct.images.length,
    imageUrls: savedProduct.images.map(img => img.image)
  });

  reply.status(201).send({
    success: true,
    message: 'Product created successfully',
    data: savedProduct
  });
};

// ============================================
// UPDATE PRODUCT
// ============================================
export const updateProduct = async (req, reply) => {
  const id = req.params.id?.trim();
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError('Invalid or missing product ID.', {
      field: 'id',
      received: id
    });
  }

  const existingProduct = await Product.findById(id);
  if (!existingProduct) {
    throw new NotFoundError('Product', { id });
  }

  console.log('📝 Updating product:', existingProduct.name);
  console.log('📥 Request body:', req.body);
  console.log('📁 Files:', req.files?.length || 0);

  const { name, autoGenerateContent, existingImagePath } = req.body;
  
  if (name && name.trim() && name.trim() !== existingProduct.name) {
    const shouldGenerate = autoGenerateContent === true || autoGenerateContent === 'true';
    if (shouldGenerate) {
      const hasEmptyFields = !req.body.description && !req.body.specifications && !req.body.keyFeatures;
      if (hasEmptyFields) {
        console.log(`🔄 Regenerating content for product: ${name.trim()}`);
        const generated = await generateProductContentWithGemini(name.trim());
        
        if (!req.body.description) req.body.description = generated.description;
        if (!req.body.specifications) req.body.specifications = generated.specifications;
        if (!req.body.keyFeatures) req.body.keyFeatures = generated.keyFeatures;
        if (!req.body.metaTitle) req.body.metaTitle = generated.metaTitle;
        if (!req.body.metaDescription) req.body.metaDescription = generated.metaDescription;
        if (!req.body.metaKeywords) req.body.metaKeywords = generated.metaKeywords;
        if (!req.body.canonicalUrl) req.body.canonicalUrl = generated.canonicalUrl;
        if (!req.body.ogTitle) req.body.ogTitle = generated.ogTitle;
        if (!req.body.ogDescription) req.body.ogDescription = generated.ogDescription;
      }
    }
  }

  if (req.body.stock !== undefined && req.body.stock !== null && req.body.stock !== '') {
    let stockValue;
    
    if (Array.isArray(req.body.stock)) {
      stockValue = parseInt(req.body.stock[0]);
    } else {
      stockValue = parseInt(req.body.stock);
    }
    
    if (!isNaN(stockValue) && stockValue >= 0) {
      req.body.stock = stockValue;
      console.log('✅ Stock set to:', req.body.stock);
    } else {
      console.log('⚠️ Invalid stock value, keeping existing:', existingProduct.stock);
      delete req.body.stock;
    }
  } else {
    delete req.body.stock;
  }

  if (isNaN(existingProduct.stock) || existingProduct.stock === undefined) {
    existingProduct.stock = 0;
  }

  let imagesChanged = false;

  // Handle deleted main images
  if (req.body.deletedMainImages) {
    try {
      let deletedImages = req.body.deletedMainImages;
      
      console.log('📥 Processing deletedMainImages:', deletedImages);
      console.log('📥 Type:', typeof deletedImages);

      if (typeof deletedImages === 'string') {
        try {
          deletedImages = JSON.parse(deletedImages);
          console.log('✅ Parsed as JSON:', deletedImages);
        } catch (e) {
          console.log('⚠️ JSON parse failed, splitting by comma');
          deletedImages = deletedImages.split(',').map(img => img.trim().replace(/^["']|["']$/g, ''));
        }
      }

      if (!Array.isArray(deletedImages)) {
        deletedImages = [deletedImages];
      }

      deletedImages = deletedImages.filter(img => img && img.trim() !== '');
      
      console.log('📦 Final deleted images list:', deletedImages);

      if (deletedImages.length > 0) {
        let fileDeletedCount = 0;
        for (const imagePath of deletedImages) {
          console.log(`🗑️ Deleting: ${imagePath}`);
          const result = await deleteImageFile(imagePath);
          if (result) {
            fileDeletedCount++;
            console.log(`   ✅ Deleted successfully`);
          } else {
            console.log(`   ❌ Failed to delete`);
          }
        }
        console.log(`📊 Files deleted: ${fileDeletedCount}/${deletedImages.length}`);

        const originalCount = existingProduct.images.length;
        console.log(`📸 Original images (${originalCount}):`, existingProduct.images.map(img => img.image));
        
        const deletedFilenames = deletedImages.map(img => {
          if (img.includes('/uploads/')) {
            return img.split('/uploads/')[1].replace(/^[/\\]+|[/\\]+$/g, '');
          }
          if (img.includes('r2.cloudflarestorage.com')) {
            const parts = img.split('/');
            return parts[parts.length - 1];
          }
          return img.replace(/^[/\\]+|[/\\]+$/g, '');
        });
        
        console.log('🔍 Looking for these filenames:', deletedFilenames);

        existingProduct.images = existingProduct.images.filter(img => {
          let imageFilename = img.image;
          if (imageFilename.includes('/uploads/')) {
            imageFilename = imageFilename.split('/uploads/')[1];
          }
          if (imageFilename.includes('r2.cloudflarestorage.com')) {
            const parts = imageFilename.split('/');
            imageFilename = parts[parts.length - 1];
          }
          imageFilename = imageFilename.replace(/^[/\\]+|[/\\]+$/g, '');
          
          const shouldKeep = !deletedFilenames.includes(imageFilename);
          console.log(`   "${img.image}" → ${shouldKeep ? 'KEEP' : 'REMOVE'}`);
          return shouldKeep;
        });

        console.log(`📊 Main images: ${originalCount} → ${existingProduct.images.length}`);
        imagesChanged = true;
      }
    } catch (error) {
      console.error('❌ Error processing deletedMainImages:', error);
    }
  }

  // Handle deleted variant images
  if (req.body.deletedVariantImages) {
    try {
      let deletedVariantImages = req.body.deletedVariantImages;
      
      console.log('📥 Processing deletedVariantImages:', deletedVariantImages);
      console.log('📥 Type:', typeof deletedVariantImages);

      if (typeof deletedVariantImages === 'string') {
        try {
          deletedVariantImages = JSON.parse(deletedVariantImages);
          console.log('✅ Parsed as JSON object:', deletedVariantImages);
        } catch (e) {
          console.log('⚠️ JSON parse failed, using empty object');
          deletedVariantImages = {};
        }
      }

      if (deletedVariantImages && typeof deletedVariantImages === 'object') {
        for (const [variantIndex, images] of Object.entries(deletedVariantImages)) {
          const idx = parseInt(variantIndex);
          
          if (!Array.isArray(images)) {
            images = [images];
          }
          
          images = images.filter(img => img && img.trim() !== '');
          
          if (images.length === 0) continue;
          
          const cleanedImages = images.map(img => {
            img = img.replace(/^["']|["']$/g, '');
            if (img.includes('/uploads/')) {
              const parts = img.split('/uploads/');
              img = parts[parts.length - 1];
            }
            if (img.includes('r2.cloudflarestorage.com')) {
              const parts = img.split('/');
              img = parts[parts.length - 1];
            }
            return img.replace(/^[/\\]+|[/\\]+$/g, '').trim();
          });
          
          console.log(`🧹 Cleaned filenames for variant ${idx}:`, cleanedImages);
          
          for (const filename of cleanedImages) {
            console.log(`🗑️ Deleting variant ${idx} image: ${filename}`);
            const deleted = await deleteImageFile(filename);
            console.log(`   Result: ${deleted ? '✅ SUCCESS' : '❌ FAILED'}`);
          }

          if (existingProduct.variants && existingProduct.variants[idx]) {
            const originalCount = existingProduct.variants[idx].images?.length || 0;
            
            existingProduct.variants[idx].images = existingProduct.variants[idx].images.filter(img => {
              let imageFilename = img.image;
              if (imageFilename.includes('/uploads/')) {
                const parts = imageFilename.split('/uploads/');
                imageFilename = parts[parts.length - 1];
              }
              if (imageFilename.includes('r2.cloudflarestorage.com')) {
                const parts = imageFilename.split('/');
                imageFilename = parts[parts.length - 1];
              }
              imageFilename = imageFilename.replace(/^[/\\]+|[/\\]+$/g, '').trim();
              
              return !cleanedImages.includes(imageFilename);
            });
            
            console.log(`📊 Variant ${idx} images: ${originalCount} → ${existingProduct.variants[idx].images.length}`);
            imagesChanged = true;
          }
        }
      }
    } catch (error) {
      console.error('❌ Error processing deletedVariantImages:', error);
    }
  }

  // Handle deleted OG image
  if (req.body.deletedOgImage) {
    try {
      let deletedOgImage = req.body.deletedOgImage;
      console.log('🗑️ Processing deleted OG image:', deletedOgImage);

      if (typeof deletedOgImage === 'string') {
        deletedOgImage = deletedOgImage.replace(/^["']|["']$/g, '');
        
        if (!deletedOgImage.startsWith('/uploads/') && !deletedOgImage.startsWith('http')) {
          deletedOgImage = `/uploads/${deletedOgImage}`;
        }

        if (deletedOgImage.startsWith('/uploads/') || deletedOgImage.includes('r2.cloudflarestorage.com')) {
          console.log(`🗑️ Deleting OG image: ${deletedOgImage}`);
          await deleteImageFile(deletedOgImage);
          existingProduct.ogImage = null;
          imagesChanged = true;
        }
      }
    } catch (error) {
      console.error('❌ Error processing deletedOgImage:', error);
    }
  }

  // Handle new image uploads
  if (req.files && req.files.length > 0) {
    console.log(`📁 Processing ${req.files.length} new files...`);
    
    const newMainImages = req.files
      .filter(file => file.fieldname === 'images')
      .map(file => ({
        image: file.url  // Use R2 URL
      }));

    if (newMainImages.length > 0) {
      existingProduct.images = [...existingProduct.images, ...newMainImages];
      imagesChanged = true;
      console.log(`✅ Added ${newMainImages.length} new main images to R2`);
    }

    const ogImageFile = req.files.find(file => file.fieldname === 'ogImage');
    if (ogImageFile) {
      if (existingProduct.ogImage) {
        console.log(`🗑️ Deleting old OG image: ${existingProduct.ogImage}`);
        await deleteImageFile(existingProduct.ogImage);
      }
      existingProduct.ogImage = ogImageFile.url;  // Use R2 URL
      console.log('✅ Updated OG Image from file:', existingProduct.ogImage);
      imagesChanged = true;
    }

    const variantImagesMap = {};
    req.files.forEach(file => {
      const variantMatch = file.fieldname.match(/variants\[(\d+)\]\.images/);
      if (variantMatch) {
        const variantIndex = parseInt(variantMatch[1]);
        if (!variantImagesMap[variantIndex]) {
          variantImagesMap[variantIndex] = [];
        }
        variantImagesMap[variantIndex].push({
          image: file.url  // Use R2 URL
        });
      }
    });

    if (Object.keys(variantImagesMap).length > 0) {
      Object.entries(variantImagesMap).forEach(([index, images]) => {
        const variantIdx = parseInt(index);
        if (existingProduct.variants && existingProduct.variants[variantIdx]) {
          if (!existingProduct.variants[variantIdx].images) {
            existingProduct.variants[variantIdx].images = [];
          }
          existingProduct.variants[variantIdx].images = [
            ...existingProduct.variants[variantIdx].images,
            ...images
          ];
          imagesChanged = true;
          console.log(`✅ Added ${images.length} images to variant ${variantIdx}`);
        }
      });
    }
  }

  // Handle existing image path (from AI generation)
  if (existingImagePath && !req.files) {
    const imageExists = existingProduct.images.some(img => img.image === existingImagePath);
    if (!imageExists) {
      existingProduct.images.push({ image: existingImagePath });
      imagesChanged = true;
      console.log('📷 Added AI-generated image:', existingImagePath);
    }
  }

  // Handle OG image update from URL
  if (req.body.ogImage !== undefined) {
    if (!req.body.ogImage || req.body.ogImage.trim() === '') {
      if (existingProduct.ogImage) {
        console.log('🗑️ Deleting OG image (removed by user):', existingProduct.ogImage);
        await deleteImageFile(existingProduct.ogImage);
      }
      existingProduct.ogImage = null;
      console.log('✅ OG Image removed');
      imagesChanged = true;
    } else if (existingProduct.ogImage !== req.body.ogImage) {
      if (existingProduct.ogImage) {
        console.log('🗑️ Deleting old OG image:', existingProduct.ogImage);
        await deleteImageFile(existingProduct.ogImage);
      }
      existingProduct.ogImage = req.body.ogImage;
      console.log('✅ Updated OG Image to:', req.body.ogImage);
      imagesChanged = true;
    }
  }

  // Handle offer update
  if (req.body.hasOffer !== undefined) {
    if (req.body.hasOffer === 'true' || req.body.hasOffer === true) {
      if (req.body.originalPrice && req.body.basePrice) {
        const original = parseFloat(req.body.originalPrice);
        const base = parseFloat(req.body.basePrice);
        const discountPercentage = ((original - base) / original) * 100;

        existingProduct.basePrice = base;
        existingProduct.originalPrice = original;
        existingProduct.discountPercentage = Math.round(discountPercentage * 100) / 100;
        existingProduct.hasOffer = true;

        console.log('🎯 Update: Offer calculated from both prices');
      }
      else if (req.body.originalPrice && req.body.discountPercentage) {
        const originalPrice = parseFloat(req.body.originalPrice);
        const discountPercentage = parseFloat(req.body.discountPercentage);
        const discountAmount = (originalPrice * discountPercentage) / 100;

        existingProduct.basePrice = originalPrice - discountAmount;
        existingProduct.originalPrice = originalPrice;
        existingProduct.discountPercentage = discountPercentage;
        existingProduct.hasOffer = true;

        console.log('🎯 Update: Offer applied with discount');
      }
      else if (req.body.basePrice) {
        if (existingProduct.originalPrice && existingProduct.originalPrice !== existingProduct.basePrice) {
          const newBasePrice = parseFloat(req.body.basePrice);
          const discountPercentage = ((existingProduct.originalPrice - newBasePrice) / existingProduct.originalPrice) * 100;

          existingProduct.basePrice = newBasePrice;
          existingProduct.discountPercentage = Math.round(discountPercentage * 100) / 100;
          existingProduct.hasOffer = true;

          console.log('🎯 Update: Offer calculated from existing originalPrice');
        } else {
          const assumedMarkup = 1.25;
          const newBasePrice = parseFloat(req.body.basePrice);
          const assumedOriginalPrice = newBasePrice * assumedMarkup;
          const discountPercentage = ((assumedMarkup - 1) / assumedMarkup) * 100;

          existingProduct.basePrice = newBasePrice;
          existingProduct.originalPrice = assumedOriginalPrice;
          existingProduct.discountPercentage = discountPercentage;
          existingProduct.hasOffer = true;

          console.log('🎯 Update: Offer auto-calculated with assumed markup');
        }
      }
      else if (req.body.discountPercentage) {
        const discountPercentage = parseFloat(req.body.discountPercentage);
        const referencePrice = existingProduct.originalPrice || existingProduct.basePrice;
        const discountAmount = (referencePrice * discountPercentage) / 100;

        existingProduct.basePrice = referencePrice - discountAmount;
        existingProduct.originalPrice = referencePrice;
        existingProduct.discountPercentage = discountPercentage;
        existingProduct.hasOffer = true;

        console.log('🎯 Update: Offer applied with discount only');
      }
    } else {
      if (req.body.basePrice !== undefined) {
        const newBasePrice = parseFloat(req.body.basePrice);
        existingProduct.basePrice = newBasePrice;
        existingProduct.originalPrice = newBasePrice;
        existingProduct.discountPercentage = 0;
        existingProduct.hasOffer = false;
        console.log('🔚 Update: Offer turned off, basePrice set to:', newBasePrice);
      }
    }
  }

  if (req.body.basePrice !== undefined && req.body.hasOffer === undefined) {
    const newBasePrice = parseFloat(req.body.basePrice);
    if (!isNaN(newBasePrice) && newBasePrice > 0) {
      existingProduct.basePrice = newBasePrice;
      if (!existingProduct.hasOffer) {
        existingProduct.originalPrice = newBasePrice;
        existingProduct.discountPercentage = 0;
      }
      console.log('💰 Updated basePrice to:', newBasePrice);
    }
  }

  const seoTextFields = ['metaTitle', 'metaDescription', 'canonicalUrl', 'ogTitle', 'ogDescription'];
  seoTextFields.forEach(field => {
    if (req.body[field] !== undefined && req.body[field] !== null && req.body[field] !== '') {
      existingProduct[field] = req.body[field];
      console.log(`✅ Updated ${field}:`, req.body[field]);
    }
  });

  if (req.body.metaKeywords !== undefined) {
    let parsedKeywords = [];
    if (typeof req.body.metaKeywords === 'string') {
      try {
        parsedKeywords = JSON.parse(req.body.metaKeywords);
        console.log('✅ Parsed metaKeywords from JSON');
      } catch (error) {
        parsedKeywords = req.body.metaKeywords
          .split(',')
          .map(keyword => keyword.trim())
          .filter(keyword => keyword !== '');
        console.log('✅ Parsed metaKeywords from comma-separated string');
      }
    } else if (Array.isArray(req.body.metaKeywords)) {
      parsedKeywords = req.body.metaKeywords.filter(keyword => keyword && keyword.trim() !== '');
      console.log('✅ Using metaKeywords array');
    }
    existingProduct.metaKeywords = parsedKeywords;
  }

  if (req.body.sizes !== undefined) {
    let parsedSizes = [];
    try {
      parsedSizes = typeof req.body.sizes === 'string'
        ? JSON.parse(req.body.sizes)
        : req.body.sizes;
      
      parsedSizes = parsedSizes.map(item => ({
        size: item.size,
        price: item.price !== undefined && item.price !== '' ? parseFloat(item.price) : null
      }));
      existingProduct.sizes = parsedSizes;
      console.log('✅ Updated sizes with prices:', parsedSizes);
    } catch (error) {
      console.error('❌ Error parsing sizes:', error);
    }
  }

  if (req.body.variants !== undefined) {
    let parsedVariants = req.body.variants;
    if (typeof parsedVariants === 'string') {
      try {
        parsedVariants = JSON.parse(parsedVariants);
        console.log('✅ Parsed variants from JSON');
      } catch (error) {
        console.error('❌ Error parsing variants:', error);
      }
    }
    if (Array.isArray(parsedVariants)) {
      existingProduct.variants = parsedVariants.map((variant, index) => {
        const existingVariant = existingProduct.variants[index] || {};
        
        let variantSizes = [];
        if (variant.sizes && Array.isArray(variant.sizes)) {
          variantSizes = variant.sizes.map(item => ({
            size: item.size,
            price: item.price !== undefined && item.price !== '' ? parseFloat(item.price) : null
          }));
        }
        
        return {
          ...variant,
          sizes: variantSizes,
          images: existingVariant.images || [],
          variantSlug: variant.variantSlug || 
            slugify(`${existingProduct.name} ${variant.variantName || `Pack ${index + 1}`}`, {
              lower: true,
              strict: true
            }) + `-${index + 1}`
        };
      });
      imagesChanged = true;
      console.log(`✅ Updated ${existingProduct.variants.length} variants with size-specific pricing`);
    }
  }

  for (const [key, value] of Object.entries(req.body)) {
    if (value !== undefined && value !== null && value !== '' &&
      key !== 'variants' && !seoTextFields.includes(key) &&
      key !== 'metaKeywords' && key !== 'ogImage' &&
      key !== 'deletedMainImages' && key !== 'deletedVariantImages' &&
      key !== 'deletedOgImage' && key !== 'hasOffer' &&
      key !== 'originalPrice' && key !== 'discountPercentage' &&
      key !== 'basePrice' && key !== 'stock' && key !== 'sizes' &&
      key !== 'autoGenerateContent' && key !== 'existingImagePath') {

      if (key === 'specifications') {
        let parsedSpecifications = typeof value === 'string' ? JSON.parse(value) : value;
        existingProduct[key] = parsedSpecifications;
        console.log(`✅ Updated ${key}:`, parsedSpecifications);
      } else if (key === 'keyFeatures') {
        let parsedKeyFeatures = [];
        if (typeof value === 'string') {
          try {
            parsedKeyFeatures = JSON.parse(value);
          } catch (error) {
            parsedKeyFeatures = value
              .split(',')
              .map(feature => feature.trim())
              .filter(feature => feature !== '');
          }
        } else if (Array.isArray(value)) {
          parsedKeyFeatures = value
            .map(feature => typeof feature === 'string' ? feature.trim() : feature)
            .filter(feature => feature && feature !== '');
        }
        existingProduct[key] = parsedKeyFeatures;
        console.log(`✅ Updated ${key}:`, parsedKeyFeatures);
      } else if (key !== 'slug') {
        existingProduct[key] = value;
        console.log(`✅ Updated ${key}:`, value);
      }
    }
  }

  if (req.body.name && req.body.name !== existingProduct.name) {
    existingProduct.name = req.body.name;
    console.log('✅ Updated name to:', req.body.name);
  }

  if (isNaN(existingProduct.stock) || existingProduct.stock === undefined || existingProduct.stock === null) {
    console.log('⚠️ Stock was NaN/null, setting to 0');
    existingProduct.stock = 0;
  }

  if (isNaN(existingProduct.basePrice) || existingProduct.basePrice === undefined) {
    console.log('⚠️ basePrice was NaN, setting to 0');
    existingProduct.basePrice = 0;
  }

  console.log('💾 Saving product with stock:', existingProduct.stock);
  const updatedProduct = await existingProduct.save();

  console.log('✅ Product updated successfully:', {
    id: updatedProduct._id,
    name: updatedProduct.name,
    stock: updatedProduct.stock,
    sizes: updatedProduct.sizes,
    variantSizes: updatedProduct.variants?.map(v => v.sizes) || [],
    mainImagesCount: updatedProduct.images?.length || 0,
    variantImages: updatedProduct.variants?.map(v => v.images?.length || 0) || [],
    imagesChanged: imagesChanged,
    hasOffer: updatedProduct.hasOffer,
    basePrice: updatedProduct.basePrice,
    imageUrls: updatedProduct.images?.map(img => img.image)
  });

  reply.status(200).send({
    success: true,
    message: 'Product updated successfully.',
    data: updatedProduct,
  });
};

// ============================================
// DELETE PRODUCT
// ============================================
export const deleteProduct = async (req, reply) => {
  const id = req.params.id?.trim();

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError('Invalid product ID.', {
      field: 'id',
      received: id
    });
  }

  const product = await Product.findById(id);
  if (!product) {
    throw new NotFoundError('Product', { id });
  }

  let deletedCount = 0;

  if (product.images && product.images.length > 0) {
    for (const img of product.images) {
      const result = await deleteImageFile(img.image);
      if (result) deletedCount++;
    }
    console.log(`🗑️ Deleted ${product.images.length} main images from R2/upload folder`);
  }

  if (product.variants && product.variants.length > 0) {
    let variantImageCount = 0;
    for (const variant of product.variants) {
      if (variant.images && variant.images.length > 0) {
        for (const img of variant.images) {
          const result = await deleteImageFile(img.image);
          if (result) variantImageCount++;
        }
      }
    }
    deletedCount += variantImageCount;
    console.log(`🗑️ Deleted ${variantImageCount} variant images from R2/upload folder`);
  }

  if (product.ogImage) {
    const result = await deleteImageFile(product.ogImage);
    if (result) {
      deletedCount++;
      console.log('🗑️ Deleted OG image from R2/upload folder');
    }
  }

  await Product.findByIdAndDelete(id);

  console.log(`✅ Total deleted: ${deletedCount} image files`);
  console.log(`✅ Product deleted from database: ${id}`);

  reply.status(200).send({
    success: true,
    message: `Product deleted successfully. Removed ${deletedCount} image files from server.`,
    deletedImages: deletedCount
  });
};

// ============================================
// UPLOAD VARIANT IMAGES
// ============================================
export const uploadVariantImages = async (req, reply) => {
  const { productId, variantIndex } = req.params;

  if (!req.files || req.files.length === 0) {
    throw new ValidationError('No images uploaded', {
      field: 'files'
    });
  }

  const product = await Product.findById(productId);
  if (!product) {
    throw new NotFoundError('Product', { id: productId });
  }

  const index = parseInt(variantIndex);
  if (index < 0 || index >= product.variants.length) {
    throw new ValidationError('Invalid variant index', {
      variantIndex: index,
      totalVariants: product.variants.length
    });
  }

  const newImages = req.files.map(file => ({
    image: file.url  // Use R2 URL
  }));

  if (!product.variants[index].images) {
    product.variants[index].images = [];
  }

  product.variants[index].images.push(...newImages);
  await product.save();

  reply.status(200).send({
    success: true,
    message: 'Variant images uploaded successfully',
    data: product.variants[index]
  });
};

// ============================================
// GET ALL PRODUCTS
// ============================================
export const getAllProducts = async (req, reply) => {
  const {
    category,
    categorySlug,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    hasOffer
  } = req.query;

  let filter = {};

  if (hasOffer !== undefined && hasOffer !== '') {
    if (hasOffer === 'true' || hasOffer === true) {
      filter.hasOffer = true;
      console.log('🎯 Filtering products with offers only');
    } else if (hasOffer === 'false' || hasOffer === false) {
      filter.hasOffer = false;
      console.log('🎯 Filtering products without offers');
    }
  }

  const categoryFilter = categorySlug || category;

  if (categoryFilter && categoryFilter !== 'undefined' && categoryFilter !== 'all') {
    if (mongoose.Types.ObjectId.isValid(categoryFilter)) {
      filter.category = categoryFilter;
    } else {
      const categoryDoc = await Category.findOne({
        slug: categoryFilter,
        status: 'active'
      });

      if (categoryDoc) {
        filter.category = categoryDoc._id;
      } else {
        return reply.status(200).send({
          success: true,
          data: [],
          count: 0,
          message: 'No products found for this category'
        });
      }
    }
  }

  const sortConfig = {};
  switch (sortBy) {
    case 'price':
    case 'rating':
    case 'createdAt':
    case 'name':
      sortConfig[sortBy] = sortOrder === 'desc' ? -1 : 1;
      break;
    default:
      sortConfig.createdAt = -1;
  }

  console.log('🔍 Product filter:', filter);
  console.log('🔄 Sort config:', sortConfig);

  const products = await Product.find(filter)
    .populate('category', 'name slug')
    .sort(sortConfig);

  if (products.length > 0) {
    console.log('📊 Sample product fields:', Object.keys(products[0].toObject()));
    console.log('📊 Has offer:', products[0].hasOffer);
    console.log('📊 Total products found:', products.length);
  }

  reply.status(200).send({
    success: true,
    count: products.length,
    data: products,
  });
};

// ============================================
// GET PRODUCT BY ID
// ============================================
export const getProductById = async (req, reply) => {
  const id = req.params.id?.trim();

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError('Invalid product ID.', {
      field: 'id',
      received: id
    });
  }

  const product = await Product.findById(id);
  if (!product) {
    throw new NotFoundError('Product', { id });
  }

  reply.status(200).send({ success: true, data: product });
};

// ============================================
// GET PRODUCT BY SLUG
// ============================================
export const getProductBySlug = async (req, reply) => {
  const { slug } = req.params;

  const product = await Product.findOne({ slug })
    .populate('category', 'name slug');

  if (!product) {
    throw new NotFoundError('Product', { slug });
  }

  reply.status(200).send({ success: true, data: product });
};

// ============================================
// GET FEATURED PRODUCTS
// ============================================
export const getFeaturedProducts = async (req, reply) => {
  const { priceRange, category, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

  let filter = { featured: true, status: 'active' };

  if (category && category !== 'all') {
    filter.category = category;
  }

  let priceFilter = {};
  if (priceRange && priceRange !== 'all') {
    switch (priceRange) {
      case '100-200':
        priceFilter = { price: { $gte: 100, $lte: 200 } };
        break;
      case '200-300':
        priceFilter = { price: { $gte: 200, $lte: 300 } };
        break;
      case '300-400':
        priceFilter = { price: { $gte: 300, $lte: 400 } };
        break;
      case '400-500':
        priceFilter = { price: { $gte: 400, $lte: 500 } };
        break;
      case '500-600':
        priceFilter = { price: { $gte: 500, $lte: 600 } };
        break;
      case 'above-600':
        priceFilter = { price: { $gt: 600 } };
        break;
      default:
        priceFilter = {};
    }
  }

  const finalFilter = { ...filter, ...priceFilter };

  const sortConfig = {};
  sortConfig[sortBy] = sortOrder === 'desc' ? -1 : 1;

  const products = await Product.find(finalFilter)
    .populate('category', 'name slug')
    .sort(sortConfig)
    .lean();

  reply.status(200).send({
    success: true,
    count: products.length,
    data: products
  });
};

// ============================================
// GET FEATURED PRICE RANGES
// ============================================
export const getFeaturedPriceRanges = async (req, reply) => {
  const priceRanges = await Product.aggregate([
    {
      $match: {
        featured: true,
        status: 'active',
        price: { $exists: true, $ne: null }
      }
    },
    {
      $bucket: {
        groupBy: "$price",
        boundaries: [0, 100, 200, 300, 400, 500, 600, Number.MAX_SAFE_INTEGER],
        default: "above-600",
        output: {
          count: { $sum: 1 },
          minPrice: { $min: "$price" },
          maxPrice: { $max: "$price" }
        }
      }
    },
    {
      $project: {
        _id: 0,
        range: {
          $switch: {
            branches: [
              { case: { $eq: ["$_id", 0] }, then: "under-100" },
              { case: { $eq: ["$_id", 100] }, then: "100-200" },
              { case: { $eq: ["$_id", 200] }, then: "200-300" },
              { case: { $eq: ["$_id", 300] }, then: "300-400" },
              { case: { $eq: ["$_id", 400] }, then: "400-500" },
              { case: { $eq: ["$_id", 500] }, then: "500-600" },
              { case: { $eq: ["$_id", 600] }, then: "above-600" }
            ],
            default: "above-600"
          }
        },
        count: 1,
        minPrice: 1,
        maxPrice: 1
      }
    },
    {
      $match: {
        count: { $gt: 0 }
      }
    }
  ]);

  reply.status(200).send({
    success: true,
    data: priceRanges
  });
};

// ============================================
// GET FILTERED FEATURED PRODUCTS
// ============================================
export const getFilteredFeaturedProducts = async (req, reply) => {
  const {
    priceRanges,
    categories,
    minPrice,
    maxPrice,
    page = 1,
    limit = 12,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  let filter = { featured: true, status: 'active' };

  if (categories && categories !== 'all') {
    const categoryArray = Array.isArray(categories) ? categories : [categories];
    filter.category = { $in: categoryArray };
  }

  let priceFilter = {};

  if (priceRanges && priceRanges !== 'all') {
    const rangeArray = Array.isArray(priceRanges) ? priceRanges : [priceRanges];
    const rangeConditions = [];

    rangeArray.forEach(range => {
      switch (range) {
        case '100-200':
          rangeConditions.push({ price: { $gte: 100, $lte: 200 } });
          break;
        case '200-300':
          rangeConditions.push({ price: { $gte: 200, $lte: 300 } });
          break;
        case '300-400':
          rangeConditions.push({ price: { $gte: 300, $lte: 400 } });
          break;
        case '400-500':
          rangeConditions.push({ price: { $gte: 400, $lte: 500 } });
          break;
        case '500-600':
          rangeConditions.push({ price: { $gte: 500, $lte: 600 } });
          break;
        case 'above-600':
          rangeConditions.push({ price: { $gt: 600 } });
          break;
      }
    });

    if (rangeConditions.length > 0) {
      priceFilter = { $or: rangeConditions };
    }
  }

  if (minPrice || maxPrice) {
    priceFilter = {};
    if (minPrice) priceFilter.$gte = parseInt(minPrice);
    if (maxPrice) priceFilter.$lte = parseInt(maxPrice);
    priceFilter = { price: priceFilter };
  }

  const finalFilter = priceFilter ? { ...filter, ...priceFilter } : filter;

  const sortConfig = {};
  sortConfig[sortBy] = sortOrder === 'desc' ? -1 : 1;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [products, totalCount] = await Promise.all([
    Product.find(finalFilter)
      .populate('category', 'name slug')
      .sort(sortConfig)
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Product.countDocuments(finalFilter)
  ]);

  reply.status(200).send({
    success: true,
    data: products,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      totalProducts: totalCount,
      hasNext: skip + products.length < totalCount,
      hasPrev: parseInt(page) > 1
    }
  });
};

// ============================================
// SEARCH PRODUCTS
// ============================================
export const searchProducts = async (req, reply) => {
  const {
    search,
    category,
    categorySlug,
    minPrice,
    maxPrice,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    page = 1,
    limit = 12
  } = req.query;

  let filter = { status: 'active' };

  if (search && search.trim() !== '') {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }

  const categoryFilter = categorySlug || category;

  if (categoryFilter && categoryFilter !== 'all' && categoryFilter !== 'undefined') {
    if (mongoose.Types.ObjectId.isValid(categoryFilter)) {
      filter.category = categoryFilter;
    } else {
      const categoryDoc = await Category.findOne({
        slug: categoryFilter,
        status: 'active'
      });

      if (categoryDoc) {
        filter.category = categoryDoc._id;
      }
    }
  }

  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) filter.price.$gte = parseFloat(minPrice);
    if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
  }

  const sortConfig = {};
  sortConfig[sortBy] = sortOrder === 'desc' ? -1 : 1;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [products, totalCount] = await Promise.all([
    Product.find(filter)
      .populate('category', 'name slug')
      .sort(sortConfig)
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Product.countDocuments(filter)
  ]);

  reply.status(200).send({
    success: true,
    data: products,
    count: products.length,
    totalCount,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      totalProducts: totalCount,
      hasNext: skip + products.length < totalCount,
      hasPrev: parseInt(page) > 1
    }
  });
};

// ============================================
// QUICK SEARCH PRODUCTS
// ============================================
export const quickSearchProducts = async (req, reply) => {
  const { q: searchQuery, limit = 5 } = req.query;

  console.log('🔍 Quick search query:', searchQuery);

  if (!searchQuery || searchQuery.trim() === '') {
    return reply.status(200).send({
      success: true,
      data: [],
      message: 'Please enter a search term'
    });
  }

  const products = await Product.find({
    name: { $regex: searchQuery.trim(), $options: 'i' },
    status: 'active'
  })
    .select('name slug price images ogImage category featured sizes')
    .populate('category', 'name slug')
    .limit(parseInt(limit))
    .lean();

  console.log('📦 Found products:', products.length);

  const formattedProducts = products.map(product => {
    let imageUrl = null;
    if (product.images && product.images.length > 0 && product.images[0].image) {
      imageUrl = product.images[0].image;
    } else if (product.ogImage) {
      imageUrl = product.ogImage;
    }

    return {
      _id: product._id,
      name: product.name,
      slug: product.slug,
      price: product.price,
      image: imageUrl,
      category: product.category?.name || 'Uncategorized',
      featured: product.featured || false,
      sizes: product.sizes || []
    };
  });

  reply.status(200).send({
    success: true,
    data: formattedProducts,
    count: formattedProducts.length
  });
};

// ============================================
// GET OFFER PRODUCTS
// ============================================
export const getOfferProducts = async (req, reply) => {
  const {
    category,
    minDiscount = 0,
    maxDiscount = 100,
    limit = 20,
    sort = 'discount-desc'
  } = req.query;

  const filter = {
    hasOffer: true,
    discountPercentage: {
      $gte: parseFloat(minDiscount),
      $lte: parseFloat(maxDiscount)
    },
    status: 'active'
  };

  if (category && category !== 'all') {
    if (mongoose.Types.ObjectId.isValid(category)) {
      filter.category = category;
    } else {
      const categoryDoc = await Category.findOne({ slug: category, status: 'active' });
      if (categoryDoc) {
        filter.category = categoryDoc._id;
      }
    }
  }

  let sortConfig = {};
  switch (sort) {
    case 'discount-desc':
      sortConfig = { discountPercentage: -1 };
      break;
    case 'price-asc':
      sortConfig = { basePrice: 1 };
      break;
    case 'price-desc':
      sortConfig = { basePrice: -1 };
      break;
    case 'new':
      sortConfig = { createdAt: -1 };
      break;
    default:
      sortConfig = { discountPercentage: -1 };
  }

  const products = await Product.find(filter)
    .populate('category', 'name slug')
    .sort(sortConfig)
    .limit(parseInt(limit))
    .lean();

  const formattedProducts = products.map(product => ({
    ...product,
    savingsAmount: product.originalPrice - product.basePrice,
    hasOffer: true
  }));

  reply.status(200).send({
    success: true,
    count: products.length,
    data: formattedProducts
  });
};