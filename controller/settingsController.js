// controllers/settingsController.js
import Setting from '../models/Setting.js';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import {
  ValidationError,
  NotFoundError,
  DatabaseError
} from '../utils/errors.js';

// ✅ Ensure uploads folder exists
const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ✅ Generate unique filename
const generateUniqueFilename = (originalname, fieldname) => {
  const ext = path.extname(originalname);
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 8);
  const safeFieldname = fieldname.replace(/[^a-zA-Z0-9]/g, '_');
  return `${timestamp}-${randomString}-${safeFieldname}${ext}`;
};

// ✅ Helper: Process file uploads from Fastify multipart
export const handleFileUpload = async (req, reply) => {
  try {
    // Check if request is multipart
    if (!req.isMultipart) {
      console.log('📁 Request is not multipart, skipping file upload');
      return;
    }

    const files = {};
    const parts = req.parts();

    for await (const part of parts) {
      if (part.file) {
        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/gif'];
        
        if (!allowedTypes.includes(part.mimetype)) {
          console.warn(`⚠️ Skipping unsupported file type: ${part.mimetype}`);
          continue;
        }

        // Check file size (5MB limit)
        if (part.file.bytesRead > 5 * 1024 * 1024) {
          console.warn(`⚠️ File too large: ${part.filename}`);
          continue;
        }

        const filename = generateUniqueFilename(part.filename, part.fieldname);
        const filePath = path.join(uploadDir, filename);

        console.log(`📥 Saving file: ${part.filename} as ${filename}`);

        // Save file using buffer
        const buffer = await part.toBuffer();
        fs.writeFileSync(filePath, buffer);

        // Get file stats
        const stats = fs.statSync(filePath);

        // Store file info
        if (!files[part.fieldname]) {
          files[part.fieldname] = [];
        }

        files[part.fieldname].push({
          fieldname: part.fieldname,
          originalname: part.filename,
          filename: filename,
          path: filePath,
          mimetype: part.mimetype,
          size: stats.size
        });

        console.log(`✅ File saved: ${filename} (${(stats.size / 1024).toFixed(2)}KB)`);
      } else {
        // Text field - already in req.body
        console.log(`📝 Field: ${part.fieldname} = ${part.value}`);
      }
    }

    req.files = files;
    console.log('📁 Processed files:', Object.keys(files));
    
  } catch (error) {
    console.error('❌ Error processing files:', error);
    // Don't throw - allow the request to continue with text fields
  }
};

// @desc    Get all settings
// @route   GET /api/admin/settings
// @access  Private/Admin
export const getSettings = async (req, reply) => {
  const settings = await Setting.getSettings();
  
  reply.status(200).send({
    success: true,
    data: settings
  });
};

// @desc    Update settings (with file upload support)
// @route   PUT /api/admin/settings
// @access  Private/Admin
export const updateSettings = async (req, reply) => {
  // Get text fields from req.body
  const {
    razorpayEnabled,
    razorpayKeyId,
    razorpayKeySecret,
    cashOnDeliveryEnabled,
    
    // BUSINESS INFORMATION
    gstinNumber,
    
    // BANK ACCOUNT DETAILS
    bankName,
    accountHolderName,
    accountNumber,
    accountType,
    bankBranch,
    ifscCode,
    swiftCode,
    bankAddress,
    micrCode,
    upiId,
    
    // NEW DIGITAL PAYMENT FIELDS
    phonePeNumber,
    googlePayNumber,
    
    contactNumber,
    whatsappNumber,
    callNumber,
    contactEmail,
    companyAddress,
    siteName,
    siteTitle,
    siteDescription,
    footerText,
    footerLinks,
    facebookUrl,
    twitterUrl,
    instagramUrl,
    youtubeUrl,
    linkedinUrl,
    maintenanceMode,
    metaKeywords,
    googleAnalyticsId,
    
    // SCRIPT TAGS SECTION
    headerScripts,
    bodyScripts,
    footerScripts,
    
    // Shipping fields
    shippingInfo,
    orderProcessingTime,
    standardShippingDelivery,
    standardShippingCost,
    standardFreeShippingThreshold,
    expressShippingDelivery,
    expressShippingCost,
    expressFreeShippingThreshold,
    overnightShippingDelivery,
    overnightShippingCost,
    internationalShippingDelivery,
    internationalShippingNote,
    
    // Returns & Refunds Policy fields
    returnsPolicyTitle,
    returnsPolicyDescription,
    returnProcessSteps,
    returnTimeframe,
    returnConditions,
    customerShippingResponsibility,
    nonReturnableItems,
    defectiveItemsNote,
    refundProcessingTime,
    refundNote,
    refundAmountFormula,
    refundAmountDescription,
    exchangePolicy,
    
    // Privacy Policy fields
    privacyPolicyTitle,
    privacyPolicyLastUpdated,
    privacyPolicyEffectiveImmediately,
    privacyPolicyIntroduction,
    dataWeCollect,
    howWeUseInformation,
    privacyIntroductionSection,
    informationWeCollectSection,
    howWeUseInformationSection,
    dataSecuritySection,
    dataProtectionRightsSection,
    contactUsSection,
    dataProtectionRightsList,
    securityMeasuresSection,
    
    // Terms of Service fields
    termsOfServiceTitle,
    termsOfServiceLastUpdated,
    termsImportantNotice,
    termsUserRequirements,
    termsSections,
    termsIntellectualProperty,
    termsLimitationLiability,
    termsChangesNotice,
    termsContactInfo
  } = req.body;

  console.log('Received data:', req.body);
  console.log('Received files:', req.files);

  // Find existing settings or create new
  let settings = await Setting.findOne();
  
  if (!settings) {
    settings = new Setting();
  }

  // Update all text fields
  if (typeof razorpayEnabled !== 'undefined') {
    settings.razorpayEnabled = razorpayEnabled;
  }
  
  if (razorpayKeyId !== undefined) {
    settings.razorpayKeyId = razorpayKeyId;
  }
  
  if (razorpayKeySecret !== undefined) {
    settings.razorpayKeySecret = razorpayKeySecret;
  }
  
  if (typeof cashOnDeliveryEnabled !== 'undefined') {
    settings.cashOnDeliveryEnabled = cashOnDeliveryEnabled;
  }
  
  // Update BUSINESS INFORMATION
  if (gstinNumber !== undefined) settings.gstinNumber = gstinNumber;
  
  // Update BANK ACCOUNT DETAILS
  if (bankName !== undefined) settings.bankName = bankName;
  if (accountHolderName !== undefined) settings.accountHolderName = accountHolderName;
  if (accountNumber !== undefined) settings.accountNumber = accountNumber;
  if (accountType !== undefined) settings.accountType = accountType;
  if (bankBranch !== undefined) settings.bankBranch = bankBranch;
  if (ifscCode !== undefined) settings.ifscCode = ifscCode;
  if (swiftCode !== undefined) settings.swiftCode = swiftCode;
  if (bankAddress !== undefined) settings.bankAddress = bankAddress;
  if (micrCode !== undefined) settings.micrCode = micrCode;
  if (upiId !== undefined) settings.upiId = upiId;
  
  // UPDATE NEW DIGITAL PAYMENT FIELDS
  if (phonePeNumber !== undefined) settings.phonePeNumber = phonePeNumber;
  if (googlePayNumber !== undefined) settings.googlePayNumber = googlePayNumber;
  
  // Handle QR code file uploads
  if (req.files) {
    // PhonePe QR Code
    if (req.files.phonePeQrImage && req.files.phonePeQrImage[0]) {
      const phonePeFile = req.files.phonePeQrImage[0];
      settings.phonePeQrImage = phonePeFile.filename;
      console.log('PhonePe QR uploaded:', phonePeFile.filename);
    }
    
    // Google Pay QR Code
    if (req.files.googlePayQrImage && req.files.googlePayQrImage[0]) {
      const googlePayFile = req.files.googlePayQrImage[0];
      settings.googlePayQrImage = googlePayFile.filename;
      console.log('Google Pay QR uploaded:', googlePayFile.filename);
    }
  }
  
  // Also handle if QR image paths are sent as text (for deleting/replacing)
  if (req.body.phonePeQrImage !== undefined && !req.files?.phonePeQrImage) {
    settings.phonePeQrImage = req.body.phonePeQrImage;
  }
  
  if (req.body.googlePayQrImage !== undefined && !req.files?.googlePayQrImage) {
    settings.googlePayQrImage = req.body.googlePayQrImage;
  }
  
  // Update contact fields
  if (contactNumber !== undefined) settings.contactNumber = contactNumber;
  if (whatsappNumber !== undefined) settings.whatsappNumber = whatsappNumber;
  if (callNumber !== undefined) settings.callNumber = callNumber;
  if (contactEmail !== undefined) settings.contactEmail = contactEmail;
  if (companyAddress !== undefined) settings.companyAddress = companyAddress;
  if (siteName !== undefined) settings.siteName = siteName;
  if (siteTitle !== undefined) settings.siteTitle = siteTitle;
  if (siteDescription !== undefined) settings.siteDescription = siteDescription;
  if (footerText !== undefined) settings.footerText = footerText;
  if (footerLinks !== undefined) settings.footerLinks = footerLinks;
  if (facebookUrl !== undefined) settings.facebookUrl = facebookUrl;
  if (twitterUrl !== undefined) settings.twitterUrl = twitterUrl;
  if (instagramUrl !== undefined) settings.instagramUrl = instagramUrl;
  if (youtubeUrl !== undefined) settings.youtubeUrl = youtubeUrl; 
  if (linkedinUrl !== undefined) settings.linkedinUrl = linkedinUrl;
  
  if (typeof maintenanceMode !== 'undefined') {
    settings.maintenanceMode = maintenanceMode;
  }
  
  if (metaKeywords !== undefined) settings.metaKeywords = metaKeywords;
  if (googleAnalyticsId !== undefined) settings.googleAnalyticsId = googleAnalyticsId;
  
  // Update SCRIPT TAGS SECTION
  if (headerScripts !== undefined) settings.headerScripts = headerScripts;
  if (bodyScripts !== undefined) settings.bodyScripts = bodyScripts;
  if (footerScripts !== undefined) settings.footerScripts = footerScripts;
  
  // Update shipping fields
  if (shippingInfo !== undefined) settings.shippingInfo = shippingInfo;
  if (orderProcessingTime !== undefined) settings.orderProcessingTime = orderProcessingTime;
  if (standardShippingDelivery !== undefined) settings.standardShippingDelivery = standardShippingDelivery;
  if (standardShippingCost !== undefined) settings.standardShippingCost = standardShippingCost;
  if (standardFreeShippingThreshold !== undefined) settings.standardFreeShippingThreshold = standardFreeShippingThreshold;
  if (expressShippingDelivery !== undefined) settings.expressShippingDelivery = expressShippingDelivery;
  if (expressShippingCost !== undefined) settings.expressShippingCost = expressShippingCost;
  if (expressFreeShippingThreshold !== undefined) settings.expressFreeShippingThreshold = expressFreeShippingThreshold;
  if (overnightShippingDelivery !== undefined) settings.overnightShippingDelivery = overnightShippingDelivery;
  if (overnightShippingCost !== undefined) settings.overnightShippingCost = overnightShippingCost;
  if (internationalShippingDelivery !== undefined) settings.internationalShippingDelivery = internationalShippingDelivery;
  if (internationalShippingNote !== undefined) settings.internationalShippingNote = internationalShippingNote;
  
  // Update returns policy fields
  if (returnsPolicyTitle !== undefined) settings.returnsPolicyTitle = returnsPolicyTitle;
  if (returnsPolicyDescription !== undefined) settings.returnsPolicyDescription = returnsPolicyDescription;
  if (returnProcessSteps !== undefined) settings.returnProcessSteps = returnProcessSteps;
  if (returnTimeframe !== undefined) settings.returnTimeframe = returnTimeframe;
  if (returnConditions !== undefined) settings.returnConditions = returnConditions;
  if (customerShippingResponsibility !== undefined) settings.customerShippingResponsibility = customerShippingResponsibility;
  if (nonReturnableItems !== undefined) settings.nonReturnableItems = nonReturnableItems;
  if (defectiveItemsNote !== undefined) settings.defectiveItemsNote = defectiveItemsNote;
  if (refundProcessingTime !== undefined) settings.refundProcessingTime = refundProcessingTime;
  if (refundNote !== undefined) settings.refundNote = refundNote;
  if (refundAmountFormula !== undefined) settings.refundAmountFormula = refundAmountFormula;
  if (refundAmountDescription !== undefined) settings.refundAmountDescription = refundAmountDescription;
  if (exchangePolicy !== undefined) settings.exchangePolicy = exchangePolicy;
  
  // Update privacy policy fields
  if (privacyPolicyTitle !== undefined) settings.privacyPolicyTitle = privacyPolicyTitle;
  if (privacyPolicyLastUpdated !== undefined) settings.privacyPolicyLastUpdated = privacyPolicyLastUpdated;
  if (typeof privacyPolicyEffectiveImmediately !== 'undefined') {
    settings.privacyPolicyEffectiveImmediately = privacyPolicyEffectiveImmediately;
  }
  if (privacyPolicyIntroduction !== undefined) settings.privacyPolicyIntroduction = privacyPolicyIntroduction;
  if (dataWeCollect !== undefined) settings.dataWeCollect = dataWeCollect;
  if (howWeUseInformation !== undefined) settings.howWeUseInformation = howWeUseInformation;
  if (privacyIntroductionSection !== undefined) settings.privacyIntroductionSection = privacyIntroductionSection;
  if (informationWeCollectSection !== undefined) settings.informationWeCollectSection = informationWeCollectSection;
  if (howWeUseInformationSection !== undefined) settings.howWeUseInformationSection = howWeUseInformationSection;
  if (dataSecuritySection !== undefined) settings.dataSecuritySection = dataSecuritySection;
  if (dataProtectionRightsSection !== undefined) settings.dataProtectionRightsSection = dataProtectionRightsSection;
  if (contactUsSection !== undefined) settings.contactUsSection = contactUsSection;
  if (dataProtectionRightsList !== undefined) settings.dataProtectionRightsList = dataProtectionRightsList;
  if (securityMeasuresSection !== undefined) settings.securityMeasuresSection = securityMeasuresSection;
  
  // Update terms of service fields
  if (termsOfServiceTitle !== undefined) settings.termsOfServiceTitle = termsOfServiceTitle;
  if (termsOfServiceLastUpdated !== undefined) settings.termsOfServiceLastUpdated = termsOfServiceLastUpdated;
  if (termsImportantNotice !== undefined) settings.termsImportantNotice = termsImportantNotice;
  if (termsUserRequirements !== undefined) settings.termsUserRequirements = termsUserRequirements;
  if (termsSections !== undefined) settings.termsSections = termsSections;
  if (termsIntellectualProperty !== undefined) settings.termsIntellectualProperty = termsIntellectualProperty;
  if (termsLimitationLiability !== undefined) settings.termsLimitationLiability = termsLimitationLiability;
  if (termsChangesNotice !== undefined) settings.termsChangesNotice = termsChangesNotice;
  if (termsContactInfo !== undefined) settings.termsContactInfo = termsContactInfo;
  
  // Track who updated
  if (req.user && req.user._id) {
    settings.updatedBy = req.user._id;
  }
  settings.updatedAt = Date.now();

  console.log('Saving settings:', settings);
  
  await settings.save();

  reply.status(200).send({
    success: true,
    message: 'Settings updated successfully',
    data: settings
  });
};

// @desc    Get public settings (for frontend)
// @route   GET /api/settings/public
// @access  Public
export const getPublicSettings = async (req, reply) => {
  const publicSettings = await Setting.getPublicSettings();
  
  reply.status(200).send({
    success: true,
    data: publicSettings
  });
};

// @desc    Delete QR code
// @route   DELETE /api/admin/settings/qr-code/:type
// @access  Private/Admin
export const deleteQrCode = async (req, reply) => {
  const { type } = req.params; // 'phonePeQrImage' or 'googlePayQrImage'
  
  const settings = await Setting.findOne();
  if (!settings) {
    throw new NotFoundError('Settings', { message: 'Settings not found' });
  }
  
  // Delete the file from uploads directory
  if (settings[type]) {
    const filePath = path.join(uploadDir, settings[type]);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    // Clear the field in database
    settings[type] = '';
    await settings.save();
  }
  
  reply.status(200).send({
    success: true,
    message: `${type.replace('QrImage', '')} QR code deleted successfully`
  });
};

// @desc    Upload QR code
// @route   POST /api/admin/settings/qr-code/:type
// @access  Private/Admin
export const uploadQrCode = async (req, reply) => {
  const { type } = req.params; // 'phonePeQrImage' or 'googlePayQrImage'
  
  if (!req.files || !req.files[type]) {
    throw new ValidationError('No file uploaded', {
      field: type,
      required: true
    });
  }
  
  const settings = await Setting.findOne();
  if (!settings) {
    throw new NotFoundError('Settings', { message: 'Settings not found' });
  }
  
  // Delete old file if exists
  if (settings[type]) {
    const oldFilePath = path.join(uploadDir, settings[type]);
    if (fs.existsSync(oldFilePath)) {
      fs.unlinkSync(oldFilePath);
    }
  }
  
  // Save new file
  const file = req.files[type][0];
  settings[type] = file.filename;
  
  // Track who updated
  if (req.user && req.user._id) {
    settings.updatedBy = req.user._id;
  }
  settings.updatedAt = Date.now();
  
  await settings.save();
  
  reply.status(200).send({
    success: true,
    message: `${type.replace('QrImage', '')} QR code uploaded successfully`,
    data: {
      [type]: file.filename
    }
  });
};