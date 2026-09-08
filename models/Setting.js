
// models/Setting.js
import mongoose from 'mongoose';

const settingSchema = new mongoose.Schema({
  // Payment Settings
  razorpayEnabled: {
    type: Boolean,
    default: false
  },
  razorpayKeyId: {
    type: String,
    default: ''
  },
  razorpayKeySecret: {
    type: String,
    default: ''
  },
  cashOnDeliveryEnabled: {
    type: Boolean,
    default: true
  },
  
  // BUSINESS INFORMATION
  gstinNumber: {
    type: String,
    default: ''
  },
  
  // BANK ACCOUNT DETAILS
  bankName: {
    type: String,
    default: ''
  },
  accountHolderName: {
    type: String,
    default: ''
  },
  accountNumber: {
    type: String,
    default: ''
  },
  accountType: {
    type: String,
    default: 'Savings'
  },
  bankBranch: {
    type: String,
    default: ''
  },
  ifscCode: {
    type: String,
    default: ''
  },
  swiftCode: {
    type: String,
    default: ''
  },
  bankAddress: {
    type: String,
    default: ''
  },
  micrCode: {
    type: String,
    default: ''
  },
  upiId: {
    type: String,
    default: ''
  },
  
  // NEW DIGITAL PAYMENT FIELDS - ADDED
  phonePeNumber: {
    type: String,
    default: ''
  },
  googlePayNumber: {
    type: String,
    default: ''
  },
  phonePeQrImage: {
    type: String,
    default: ''
  },
  googlePayQrImage: {
    type: String,
    default: ''
  },
  
  // Contact & Company Info
  contactNumber: {
    type: String,
    default: '+91 1234567890'
  },
  whatsappNumber: {
    type: String,
    default: '+91 1234567890'
  },
  callNumber: {
    type: String,
    default: '+91 1234567890'
  },
  contactEmail: {
    type: String,
    default: 'contact@example.com'
  },
  companyAddress: {
    type: String,
    default: '123 Street, City, Country'
  },
  
  // Site Settings
  siteName: {
    type: String,
    default: 'My E-commerce Store'
  },
  siteTitle: {
    type: String,
    default: 'Best Online Shopping Store'
  },
  siteDescription: {
    type: String,
    default: 'Your one-stop shop for everything'
  },
  
  // Footer Settings
  footerText: {
    type: String,
    default: '© 2024 My Store. All rights reserved.'
  },
  footerLinks: [{
    name: String,
    url: String
  }],
  
  // Social Media
  facebookUrl: {
    type: String,
    default: ''
  },
  twitterUrl: {
    type: String,
    default: ''
  },
  instagramUrl: {
    type: String,
    default: ''
  },
    youtubeUrl: {
    type: String,
    default: ''
  },
  linkedinUrl: {
    type: String,
    default: ''
  },
  
  // Maintenance Mode
  maintenanceMode: {
    type: Boolean,
    default: false
  },
  
  // SEO Settings
  metaKeywords: [String],
  googleAnalyticsId: {
    type: String,
    default: ''
  },

  // SCRIPT TAGS SECTION
  headerScripts: {
    type: String,
    default: ''
  },
  bodyScripts: {
    type: String,
    default: ''
  },
  footerScripts: {
    type: String,
    default: ''
  },

  // SHIPPING SETTINGS
  shippingInfo: {
    type: String,
    default: 'Learn about our shipping policies, delivery times, and tracking information'
  },
  
  orderProcessingTime: {
    type: String,
    default: 'All orders are processed within 1-2 business days after payment confirmation. Orders placed on weekends or holidays will be processed on the next business day.'
  },
  
  standardShippingDelivery: {
    type: String,
    default: '5-7 business days'
  },
  standardShippingCost: {
    type: String,
    default: '₹4.99'
  },
  standardFreeShippingThreshold: {
    type: String,
    default: '₹50'
  },
  
  expressShippingDelivery: {
    type: String,
    default: '2-3 business days'
  },
  expressShippingCost: {
    type: String,
    default: '₹9.99'
  },
  expressFreeShippingThreshold: {
    type: String,
    default: '₹100'
  },
  
  overnightShippingDelivery: {
    type: String,
    default: '1 business day'
  },
  overnightShippingCost: {
    type: String,
    default: '₹19.99'
  },
  
  internationalShippingDelivery: {
    type: String,
    default: '10-15 business days'
  },
  internationalShippingNote: {
    type: String,
    default: 'International shipping costs vary by destination. You\'ll see the exact shipping cost at checkout.'
  },

  // RETURNS & REFUNDS POLICY SETTINGS
  returnsPolicyTitle: {
    type: String,
    default: 'Returns & Refunds Policy'
  },
  
  returnsPolicyDescription: {
    type: String,
    default: 'We want you to be completely satisfied with your purchase. Here\'s everything you need to know about returns and refunds.'
  },
  
  returnProcessSteps: [{
    title: String,
    description: String
  }],
  
  returnTimeframe: {
    type: String,
    default: '30 days from the delivery date'
  },
  
  returnConditions: [String],
  
  customerShippingResponsibility: {
    type: String,
    default: 'Return shipping costs are the responsibility of the customer, unless the return is due to our error (wrong item shipped, defective item, etc.).'
  },
  
  nonReturnableItems: [String],
  
  defectiveItemsNote: {
    type: String,
    default: 'If you receive a defective or damaged item, please contact us immediately. We will arrange for a replacement or refund, and cover all return shipping costs.'
  },
  
  refundProcessingTime: {
    type: String,
    default: '5-10 business days'
  },
  
  refundNote: {
    type: String,
    default: 'It may take additional time for the refund to appear on your credit card statement, depending on your bank\'s processing time.'
  },
  
  refundAmountFormula: {
    type: String,
    default: 'Refund Amount = Item Price - Shipping Costs'
  },
  
  refundAmountDescription: {
    type: String,
    default: 'You will receive a full refund for the item price, minus any shipping costs. Original shipping fees are non-refundable.'
  },
  
  exchangePolicy: {
    type: String,
    default: 'We currently do not offer direct exchanges. To exchange an item, please return the original item for a refund and place a new order for the desired item.'
  },

  // PRIVACY POLICY SETTINGS
  privacyPolicyTitle: {
    type: String,
    default: 'Privacy Policy'
  },
  
  privacyPolicyLastUpdated: {
    type: String,
    default: '2026'
  },
  
  privacyPolicyEffectiveImmediately: {
    type: Boolean,
    default: true
  },
  
  privacyPolicyIntroduction: {
    type: String,
    default: 'We value your privacy and are committed to protecting your personal information. This policy explains how we collect, use, and safeguard your data.'
  },
  
  dataWeCollect: [String],
  
  howWeUseInformation: [String],
  
  privacyIntroductionSection: {
    type: String,
    default: 'Welcome to our website. We are committed to protecting your personal information and your right to privacy. If you have any questions or concerns about this privacy notice, or our practices with regards to your personal information, please contact us at the email provided in our contact information.'
  },
  
  informationWeCollectSection: {
    type: String,
    default: 'We collect personal information that you voluntarily provide to us when you register on our website, place an order, subscribe to our newsletter, contact us with inquiries, or participate in promotions or surveys. The personal information we collect may include your name, email address, phone number, shipping address, and payment information.'
  },
  
  howWeUseInformationSection: {
    type: String,
    default: 'We use the information we collect for various purposes, including to process and fulfill your orders, send you order confirmations and updates, respond to your inquiries and provide customer support, send you marketing communications (with your consent), improve our website and services, and prevent fraud and enhance security.'
  },
  
  dataSecuritySection: {
    type: String,
    default: 'We have implemented appropriate technical and organizational security measures designed to protect the security of any personal information we process. However, please also remember that we cannot guarantee that the internet itself is 100% secure.'
  },
  
  dataProtectionRightsSection: {
    type: String,
    default: 'Depending on your location, you may have rights regarding your personal data including: the right to access your personal data, the right to rectification of inaccurate data, the right to erasure of your data, the right to restrict processing, the right to data portability, and the right to object to processing.'
  },
  
  contactUsSection: {
    type: String,
    default: 'If you have questions or comments about this policy, you may contact us at the email or phone number provided in our website footer.'
  },
  
  dataProtectionRightsList: [String],
  
  securityMeasuresSection: {
    type: String,
    default: 'We implement industry-standard security measures to protect your personal information, including encryption, secure servers, and regular security audits. While we strive to protect your personal information, no method of transmission over the Internet is 100% secure.'
  },

  // TERMS OF SERVICE SETTINGS
  termsOfServiceTitle: {
    type: String,
    default: 'Terms of Service'
  },
  
  termsOfServiceLastUpdated: {
    type: String,
    default: '2026'
  },
  
  termsImportantNotice: {
    type: String,
    default: 'These Terms of Service govern your use of our website and services. By using our website, you acknowledge that you have read, understood, and agree to be bound by these terms.'
  },
  
  termsUserRequirements: [String],
  
  termsSections: [{
    number: Number,
    title: String,
    content: String
  }],
  
  termsIntellectualProperty: {
    type: String,
    default: 'All content on this Website, including text, graphics, logos, images, and software, is the property of our company or its content suppliers and is protected by copyright and other intellectual property laws.'
  },
  
  termsLimitationLiability: {
    type: String,
    default: 'To the maximum extent permitted by law, we shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of or inability to use the Website.'
  },
  
  termsChangesNotice: {
    type: String,
    default: 'We reserve the right to modify these terms at any time. We will notify users of any material changes by posting the new Terms of Service on this page and updating the "Last updated" date.'
  },
  
  termsContactInfo: {
    type: String,
    default: 'Questions about the Terms of Service should be sent to us at the contact information provided in our website footer.'
  },
  
  // Last Updated
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Ensure only one settings document exists
settingSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    // Create default settings if none exist
    settings = await this.create({});
    
    // Set default return process steps
    settings.returnProcessSteps = [
      {
        title: 'Initiate Return',
        description: 'Contact our customer service within 30 days of delivery to request a return authorization.'
      },
      {
        title: 'Package Item',
        description: 'Package the item securely in its original packaging with all accessories and documentation.'
      },
      {
        title: 'Ship Return',
        description: 'Ship the item back to us using a trackable shipping method. Return shipping is customer\'s responsibility.'
      },
      {
        title: 'Receive Refund',
        description: 'Once we receive and inspect the item, we\'ll process your refund within 5-10 business days.'
      }
    ];
    
    // Set default return conditions
    settings.returnConditions = [
      'Items must be unworn, unused, and unwashed',
      'Original packaging must be intact',
      'All tags and labels must be attached',
      'Accessories and documentation must be included'
    ];
    
    // Set default non-returnable items
    settings.nonReturnableItems = [
      'Personalized or customized items',
      'Downloadable software products',
      'Gift cards',
      'Intimate apparel (for hygiene reasons)',
      'Items damaged due to misuse or improper care',
      'Final sale items (clearly marked as such)'
    ];
    
    // Set default privacy policy data
    settings.dataWeCollect = [
      'Name and contact details',
      'Shipping and billing addresses',
      'Payment information',
      'Order history',
      'Communication preferences',
      'Device and usage information'
    ];
    
    settings.howWeUseInformation = [
      'Order processing and fulfillment',
      'Customer support',
      'Marketing communications',
      'Website improvement',
      'Fraud prevention',
      'Legal compliance'
    ];
    
    settings.dataProtectionRightsList = [
      'Right to access',
      'Right to rectification',
      'Right to erasure',
      'Right to restrict processing',
      'Right to data portability',
      'Right to object'
    ];

    // Set default terms of service data
    settings.termsUserRequirements = [
      'You must be at least 18 years old to place an order',
      'Payment processing is handled by secure third-party providers',
      'All product images are for illustrative purposes only',
      'Shipping times are estimates and not guarantees',
      'We reserve the right to refuse service to anyone'
    ];

    settings.termsSections = [
      {
        number: 1,
        title: 'Agreement to Terms',
        content: 'By accessing and using our website, you accept and agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our Website.'
      },
      {
        number: 2,
        title: 'User Accounts',
        content: 'When you create an account with us, you must provide accurate and complete information. You are responsible for maintaining the confidentiality of your account and password and for restricting access to your account. You agree to accept responsibility for all activities that occur under your account.'
      },
      {
        number: 3,
        title: 'Product Information',
        content: 'We make every effort to display as accurately as possible the colors, features, specifications, and details of products available on the Website. However, we do not guarantee that the colors, features, specifications, and details will be completely accurate. All products are subject to availability, and we cannot guarantee that items will be in stock. We reserve the right to discontinue any products at any time.'
      },
      {
        number: 4,
        title: 'Orders and Payment',
        content: 'By placing an order through our Website, you warrant that you are legally capable of entering into binding contracts and are at least 18 years old. We accept various payment methods as indicated on the Website. All payments are processed through secure third-party payment processors. We do not store your credit card information.'
      },
      {
        number: 5,
        title: 'Shipping and Delivery',
        content: 'Shipping times and costs will vary depending on your location and the shipping method selected. Estimated delivery times are provided at checkout and are estimates only. Risk of loss and title for items purchased pass to you upon delivery of the items to the carrier. You are responsible for filing any claims with carriers for damaged and/or lost shipments.'
      },
      {
        number: 6,
        title: 'Returns and Refunds',
        content: 'Please review our Returns Policy for detailed information about returning products. Returns must be initiated within the specified return period and meet all return requirements.'
      },
      {
        number: 7,
        title: 'Intellectual Property',
        content: 'All content on this Website, including text, graphics, logos, images, and software, is the property of our company or its content suppliers and is protected by copyright and other intellectual property laws.'
      },
      {
        number: 8,
        title: 'Limitation of Liability',
        content: 'To the maximum extent permitted by law, we shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of or inability to use the Website.'
      },
      {
        number: 9,
        title: 'Changes to Terms',
        content: 'We reserve the right to modify these terms at any time. We will notify users of any material changes by posting the new Terms of Service on this page and updating the "Last updated" date.'
      },
      {
        number: 10,
        title: 'Contact Information',
        content: 'Questions about the Terms of Service should be sent to us at the contact information provided in our website footer.'
      }
    ];
    
    await settings.save();
  }
  return settings;
};

// Add a method to get only public settings (without sensitive data)
settingSchema.statics.getPublicSettings = async function() {
  const settings = await this.getSettings();
  
  // Return only public fields
  return {
    razorpayEnabled: settings.razorpayEnabled,
    razorpayKeyId: settings.razorpayKeyId,
    cashOnDeliveryEnabled: settings.cashOnDeliveryEnabled,
    
    // BUSINESS INFORMATION
    gstinNumber: settings.gstinNumber,
    
   
    
    // NEW DIGITAL PAYMENT FIELDS - ADDED
    phonePeNumber: settings.phonePeNumber,
    googlePayNumber: settings.googlePayNumber,

    
    // Contact & Company Info
    contactNumber: settings.contactNumber,
    whatsappNumber: settings.whatsappNumber,
    callNumber: settings.callNumber,
    contactEmail: settings.contactEmail,
    companyAddress: settings.companyAddress,
    
    // Site Settings
    siteName: settings.siteName,
    siteTitle: settings.siteTitle,
    siteDescription: settings.siteDescription,
    
    // Footer Settings
    footerText: settings.footerText,
    footerLinks: settings.footerLinks,
    
    // Social Media
    facebookUrl: settings.facebookUrl,
    twitterUrl: settings.twitterUrl,
    instagramUrl: settings.instagramUrl,
      youtubeUrl: settings.youtubeUrl,
    linkedinUrl: settings.linkedinUrl,
    
    // Maintenance Mode
    maintenanceMode: settings.maintenanceMode,
    
    // SEO Settings
    metaKeywords: settings.metaKeywords,
    googleAnalyticsId: settings.googleAnalyticsId,
    
    // SCRIPT TAGS SECTION
    headerScripts: settings.headerScripts,
    bodyScripts: settings.bodyScripts,
    footerScripts: settings.footerScripts,
    
    // Shipping fields
    shippingInfo: settings.shippingInfo,
    orderProcessingTime: settings.orderProcessingTime,
    standardShippingDelivery: settings.standardShippingDelivery,
    standardShippingCost: settings.standardShippingCost,
    standardFreeShippingThreshold: settings.standardFreeShippingThreshold,
    expressShippingDelivery: settings.expressShippingDelivery,
    expressShippingCost: settings.expressShippingCost,
    expressFreeShippingThreshold: settings.expressFreeShippingThreshold,
    overnightShippingDelivery: settings.overnightShippingDelivery,
    overnightShippingCost: settings.overnightShippingCost,
    internationalShippingDelivery: settings.internationalShippingDelivery,
    internationalShippingNote: settings.internationalShippingNote,
    
    // Returns & Refunds Policy fields
    returnsPolicyTitle: settings.returnsPolicyTitle,
    returnsPolicyDescription: settings.returnsPolicyDescription,
    returnProcessSteps: settings.returnProcessSteps,
    returnTimeframe: settings.returnTimeframe,
    returnConditions: settings.returnConditions,
    customerShippingResponsibility: settings.customerShippingResponsibility,
    nonReturnableItems: settings.nonReturnableItems,
    defectiveItemsNote: settings.defectiveItemsNote,
    refundProcessingTime: settings.refundProcessingTime,
    refundNote: settings.refundNote,
    refundAmountFormula: settings.refundAmountFormula,
    refundAmountDescription: settings.refundAmountDescription,
    exchangePolicy: settings.exchangePolicy,
    
    // Privacy Policy fields
    privacyPolicyTitle: settings.privacyPolicyTitle,
    privacyPolicyLastUpdated: settings.privacyPolicyLastUpdated,
    privacyPolicyEffectiveImmediately: settings.privacyPolicyEffectiveImmediately,
    privacyPolicyIntroduction: settings.privacyPolicyIntroduction,
    dataWeCollect: settings.dataWeCollect,
    howWeUseInformation: settings.howWeUseInformation,
    privacyIntroductionSection: settings.privacyIntroductionSection,
    informationWeCollectSection: settings.informationWeCollectSection,
    howWeUseInformationSection: settings.howWeUseInformationSection,
    dataSecuritySection: settings.dataSecuritySection,
    dataProtectionRightsSection: settings.dataProtectionRightsSection,
    contactUsSection: settings.contactUsSection,
    dataProtectionRightsList: settings.dataProtectionRightsList,
    securityMeasuresSection: settings.securityMeasuresSection,
    
    // Terms of Service fields
    termsOfServiceTitle: settings.termsOfServiceTitle,
    termsOfServiceLastUpdated: settings.termsOfServiceLastUpdated,
    termsImportantNotice: settings.termsImportantNotice,
    termsUserRequirements: settings.termsUserRequirements,
    termsSections: settings.termsSections,
    termsIntellectualProperty: settings.termsIntellectualProperty,
    termsLimitationLiability: settings.termsLimitationLiability,
    termsChangesNotice: settings.termsChangesNotice,
    termsContactInfo: settings.termsContactInfo,
    
    updatedAt: settings.updatedAt
  };
};

const Setting = mongoose.model('Setting', settingSchema);

export default Setting;
