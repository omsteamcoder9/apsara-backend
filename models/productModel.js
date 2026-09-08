// models/productModel.js
import mongoose from 'mongoose';
import slugify from 'slugify';

const productSchema = new mongoose.Schema({
    // ✅ Auto Increment Serial No
    sNo: {
        type: Number,
        unique: true,
        index: true
    },

    // ✅ Basic Info
    name: {
        type: String,
        required: [true, 'Please enter product name'],
        trim: true
    },
    slug: {
        type: String,
        unique: true,
        sparse: true,
        
    },
    basePrice: {
        type: Number,
        required: [true, 'Please enter base price']
    },
    // ✅ NEW OFFER FIELDS
    originalPrice: {
        type: Number
    },
    discountPercentage: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    hasOffer: {
        type: Boolean,
        default: false
    },
    description: {
        type: String,
        required: [true, 'Please enter product description'],
        maxlength: 5000
    },

    // ✅ Category
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: [true, 'Please select a category']
    },

    // ✅ Sizes for Simple Products with Price (Supports both letter and numeric sizes)
    sizes: [
        {
            size: {
                type: String,
                required: true,
                trim: true
                // Removed enum to support both 'M' and '28', '30', etc.
            },
            price: {
                type: Number,
                default: null // null means use basePrice
            }
        }
    ],

    // ✅ Product Variants with Size-Specific Pricing
    variants: [
        {
            variantName: {
                type: String,
                required: true,
                trim: true
            },
            variantSlug: {
                type: String,
                trim: true
            },
            price: {
                type: Number,
                required: true
            },
            originalPrice: {
                type: Number
            },
            description: {
                type: String,
                trim: true
            },
            // ✅ Sizes for Variant with Price (Supports both letter and numeric sizes)
            sizes: [
                {
                    size: {
                        type: String,
                        required: true,
                        trim: true
                        // Removed enum to support both 'M' and '28', '30', etc.
                    },
                    price: {
                        type: Number,
                        default: null // null means use variant.price
                    }
                }
            ],
            stock: {
                type: Number,
                required: true,
                default: 0
            },
            images: [
                {
                    image: {
                        type: String,
                        required: true
                    }
                }
            ],
            sku: {
                type: String,
                trim: true
            },
            isDefault: {
                type: Boolean,
                default: false
            },
            status: {
                type: String,
                enum: ['active', 'inactive', 'out-of-stock'],
                default: 'active'
            },
            discountPercentage: {
                type: Number,
                default: 0
            },
            features: [String]
        }
    ],

    // ✅ Original Specifications
    specifications: [
        {
            key: {
                type: String,
                required: true
            },
            value: {
                type: String,
                required: true
            }
        }
    ],
    
    keyFeatures: [
        {
            type: String,
            trim: true
        }
    ],

    // ✅ Ratings & Reviews
    rating: {
        type: Number,
        default: 0
    },
    numberOfReviews: {
        type: Number,
        default: 0
    },

    // ✅ Main Product Images
    images: [
        {
            image: {
                type: String,
                required: true
            }
        }
    ],

    // ✅ Seller Info
    seller: {
        type: String,
        required: [true, 'Please enter seller name']
    },

    // ✅ Total Stock
    stock: {
        type: Number,
        required: [true, 'Please enter stock quantity']
    },

    // ✅ SEO Fields
    metaTitle: { type: String, maxlength: 100 },
    metaDescription: { type: String, maxlength: 160 },
    metaKeywords: { type: [String] },
    canonicalUrl: { type: String },
    ogTitle: { type: String, maxlength: 100},
    ogDescription: { type: String },
    ogImage: { type: String },

    // ✅ Product Status
    status: {
        type: String,
        enum: ['active', 'inactive', 'out-of-stock'],
        default: 'active'
    },

    // ✅ Featured Product
    featured: {
        type: Boolean,
        default: false
    },

    createdAt: {
        type: Date,
        default: Date.now
    }
});

// ✅ SINGLE pre('save') - WITHOUT next parameter
productSchema.pre('save', async function() {
    console.log('🔵 Running pre-save middleware for product:', this.name);
    
    // 1. Generate main product slug
    if (this.isModified('name')) {
        let baseSlug = slugify(this.name, { lower: true, strict: true });
        
        // ✅ TRUNCATE SLUG TO 100 CHARACTERS
        if (baseSlug.length > 100) {
            baseSlug = baseSlug.substring(0, 100);
        }
        
        let slug = baseSlug;
        let counter = 1;
        let slugExists = true;
        
        while (slugExists) {
            const existingProduct = await this.constructor.findOne({ slug });
            if (!existingProduct || existingProduct._id.equals(this._id)) {
                slugExists = false;
            } else {
                slug = `${baseSlug}-${counter}`;
                counter++;
            }
        }
        this.slug = slug;
        console.log('✅ Slug generated:', this.slug);
    }

    // 2. Generate variant slugs
    if (this.variants && this.variants.length > 0) {
        this.variants.forEach((variant, index) => {
            if (!variant.variantSlug) {
                let variantSlug = slugify(`${this.name} ${variant.variantName}`, { 
                    lower: true, 
                    strict: true 
                });
                // ✅ TRUNCATE VARIANT SLUG
                if (variantSlug.length > 100) {
                    variantSlug = variantSlug.substring(0, 100);
                }
                variant.variantSlug = `${variantSlug}-${index + 1}`;
            }
        });
        console.log('✅ Variant slugs generated');
    }

    // 3. Calculate total stock from variants
    if (this.variants && this.variants.length > 0) {
        const totalStock = this.variants.reduce((sum, variant) => sum + (variant.stock || 0), 0);
        this.stock = totalStock;
        console.log('✅ Total stock calculated:', this.stock);
    }

    // 4. Auto Increment S.No
    if (this.isNew) {
        try {
            const lastProduct = await this.constructor
                .findOne({}, {}, { sort: { sNo: -1 } });
            this.sNo = lastProduct ? lastProduct.sNo + 1 : 1;
            console.log('✅ S.No assigned:', this.sNo);
        } catch (err) {
            this.sNo = Date.now();
            console.log('⚠️ S.No fallback:', this.sNo);
        }
    }
});

// ✅ Indexes
productSchema.index({ category: 1, status: 1 });
productSchema.index({ featured: 1 });
productSchema.index({ 'variants.sku': 1 });
productSchema.index({ 'sizes.size': 1 });

export default mongoose.model('Product', productSchema);