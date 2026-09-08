// controllers/cartController.js
import Cart from '../models/cartModel.js';
import Product from '../models/productModel.js';
import mongoose from 'mongoose';
import {
  ValidationError,
  NotFoundError,
  DatabaseError,
  ConflictError
} from '../utils/errors.js';

// Helper function to get price for a specific size
const getSizePrice = (sizes, selectedSize, defaultPrice) => {
  if (!sizes || sizes.length === 0) return defaultPrice;
  
  const sizeData = sizes.find(s => s.size === selectedSize);
  if (sizeData && sizeData.price !== null && sizeData.price !== undefined) {
    return sizeData.price;
  }
  return defaultPrice;
};

// Add to Cart with variant support - INCLUDING SIZE-SPECIFIC PRICING
export const addToCart = async (req, reply) => {
  const { productId, quantity = 1, variantId, selectedSize } = req.body;
  const userId = req.user._id;

  console.log('🛒 Backend - addToCart request:', {
    userId,
    productId,
    quantity,
    variantId,
    selectedSize,
    body: req.body
  });

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    console.error('❌ Invalid product ID:', productId);
    throw new ValidationError('Invalid product ID', { productId });
  }

  const product = await Product.findById(productId);
  if (!product) {
    console.error('❌ Product not found:', productId);
    throw new NotFoundError('Product', { productId });
  }

  console.log('✅ Product found:', {
    name: product.name,
    basePrice: product.basePrice,
    variants: product.variants?.length || 0,
    sizes: product.sizes || []
  });

  let selectedPrice = product.basePrice;
  let availableStock = product.stock;
  let selectedVariant = null;
  let variantName = '';
  let variantImages = [];
  let variantSizes = [];
  let selectedSizePrice = null;

  if (variantId) {
    // Variant product flow
    selectedVariant = product.variants?.find(v => 
      v._id?.toString() === variantId || v.variantName === variantId
    );
    
    if (!selectedVariant) {
      console.error('❌ Variant not found:', variantId);
      throw new NotFoundError('Variant', { variantId });
    }
    
    // Get variant sizes with prices
    variantSizes = selectedVariant.sizes || [];
    
    // Get price for selected size
    if (selectedSize && variantSizes.length > 0) {
      selectedPrice = getSizePrice(variantSizes, selectedSize, selectedVariant.price);
      selectedSizePrice = selectedPrice !== selectedVariant.price ? selectedPrice : null;
    } else {
      selectedPrice = selectedVariant.price;
      selectedSizePrice = null;
    }
    
    availableStock = selectedVariant.stock;
    variantName = selectedVariant.variantName;
    
    // Extract variant images
    if (selectedVariant.images && selectedVariant.images.length > 0) {
      variantImages = selectedVariant.images.map(img => img.image);
      console.log('📸 Storing variant images:', variantImages);
    }
    
    // Validate if selected size is available
    if (selectedSize && variantSizes.length > 0) {
      const sizeExists = variantSizes.some(s => s.size === selectedSize);
      if (!sizeExists) {
        console.warn('⚠️ Selected size not available for this variant:', {
          selectedSize,
          availableSizes: variantSizes.map(s => s.size)
        });
        throw new ValidationError('Selected size is not available for this variant', {
          selectedSize,
          availableSizes: variantSizes.map(s => s.size)
        });
      }
    }
    
    console.log('🎯 Selected variant:', {
      variantName,
      price: selectedPrice,
      stock: availableStock,
      images: variantImages.length,
      sizes: variantSizes,
      selectedSize: selectedSize || 'Not specified',
      selectedSizePrice: selectedSizePrice
    });
  } else {
    // Simple product with sizes
    if (selectedSize && product.sizes && product.sizes.length > 0) {
      const sizeExists = product.sizes.some(s => s.size === selectedSize);
      if (!sizeExists) {
        console.warn('⚠️ Selected size not available for this product:', {
          selectedSize,
          availableSizes: product.sizes.map(s => s.size)
        });
        throw new ValidationError('Selected size is not available for this product', {
          selectedSize,
          availableSizes: product.sizes.map(s => s.size)
        });
      }
      
      // Get price for selected size
      selectedPrice = getSizePrice(product.sizes, selectedSize, product.basePrice);
      selectedSizePrice = selectedPrice !== product.basePrice ? selectedPrice : null;
      
      console.log('📏 Selected size for simple product:', {
        selectedSize,
        price: selectedPrice,
        basePrice: product.basePrice,
        selectedSizePrice
      });
    }
    
    variantSizes = product.sizes || [];
  }

  console.log('📦 Stock & price check:', {
    price: selectedPrice,
    availableStock,
    requestedQuantity: quantity,
    selectedSize: selectedSize || 'N/A',
    selectedSizePrice
  });

  if (availableStock < quantity) {
    console.error('❌ Insufficient stock:', { availableStock, quantity });
    throw new ValidationError('Insufficient stock', {
      availableStock,
      requestedQuantity: quantity
    });
  }

  let cart = await Cart.findOne({ user: userId });
  console.log('🛍️ Existing cart:', cart ? 'Found' : 'Not found');

  if (!cart) {
    cart = new Cart({
      user: userId,
      items: [],
      totalItems: 0,
      totalPrice: 0
    });
    console.log('🆕 Created new cart');
  }

  // Check for existing item (same product, variant, and size)
  const existingItemIndex = cart.items.findIndex(item => {
    const sameProduct = item.product.toString() === productId;
    const sameVariant = item.variantId === (selectedVariant?._id?.toString() || variantId || '');
    const sameSize = item.selectedSize === (selectedSize || '');
    return sameProduct && sameVariant && sameSize;
  });

  console.log('🔍 Checking existing items:', {
    totalItems: cart.items.length,
    existingItemIndex,
    searchCriteria: { productId, variantId, selectedSize: selectedSize || '' }
  });

  if (existingItemIndex > -1) {
    const newQuantity = quantity;
    
    if (availableStock < newQuantity) {
      throw new ValidationError('Insufficient stock for requested quantity', {
        availableStock,
        requestedQuantity: newQuantity
      });
    }
    
    // Update existing item with all variant data including size-specific pricing
    cart.items[existingItemIndex].quantity = newQuantity;
    cart.items[existingItemIndex].price = selectedPrice;
    cart.items[existingItemIndex].variantName = variantName;
    cart.items[existingItemIndex].variantImages = variantImages;
    cart.items[existingItemIndex].variantSizes = variantSizes;
    cart.items[existingItemIndex].selectedSize = selectedSize || '';
    cart.items[existingItemIndex].selectedSizePrice = selectedSizePrice;
    
    console.log('📈 Updated existing item:', {
      quantity: newQuantity,
      price: selectedPrice,
      selectedSize: selectedSize || '',
      selectedSizePrice
    });
  } else {
    // Add new item with all variant data including size-specific pricing
    cart.items.push({
      product: productId,
      quantity,
      price: selectedPrice,
      variantId: selectedVariant?._id?.toString() || variantId || '',
      variantName,
      variantImages,
      variantSizes: variantSizes,
      selectedSize: selectedSize || '',
      selectedSizePrice: selectedSizePrice,
      selectedColor: ''
    });
    console.log('➕ Added new item to cart:', {
      product: productId,
      quantity,
      price: selectedPrice,
      variantId,
      variantName,
      variantImagesCount: variantImages.length,
      variantSizes: variantSizes,
      selectedSize: selectedSize || '',
      selectedSizePrice
    });
  }

  // RECALCULATE TOTALS
  cart.totalItems = cart.items.reduce((total, item) => total + item.quantity, 0);
  cart.totalPrice = cart.items.reduce((total, item) => {
    return total + (item.price * item.quantity);
  }, 0);

  console.log('🧮 Cart totals recalculated:', {
    totalItems: cart.totalItems,
    totalPrice: cart.totalPrice,
    breakdown: cart.items.map(item => 
      `${item.quantity} × ₹${item.price} = ₹${item.quantity * item.price} (Size: ${item.selectedSize || 'N/A'}, Size Price: ${item.selectedSizePrice || 'Default'})`
    )
  });

  await cart.save();
  console.log('💾 Cart saved with updated totals');

  await cart.populate('items.product', 'name basePrice images slug stock seller variants sizes');
  console.log('✅ Cart populated with product details');

  reply.status(200).send(cart);
};

// Get Cart
export const getCart = async (req, reply) => {
  const userId = req.user._id;

  const cart = await Cart.findOne({ user: userId })
    .populate('items.product', 'name basePrice images slug stock seller variants sizes');

  if (!cart) {
    return reply.status(200).send({
      _id: 'empty-cart',
      user: userId,
      items: [],
      totalPrice: 0,
      totalItems: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  reply.status(200).send(cart);
};

// Update Cart Item Quantity
export const updateCartItem = async (req, reply) => {
  const { itemId } = req.params;
  const { quantity } = req.body;
  const userId = req.user._id;

  if (!quantity || quantity < 1) {
    throw new ValidationError('Quantity must be at least 1', {
      field: 'quantity',
      minValue: 1,
      received: quantity
    });
  }

  const cart = await Cart.findOne({ user: userId });
  if (!cart) {
    throw new NotFoundError('Cart', { userId });
  }

  const cartItem = cart.items.id(itemId);
  if (!cartItem) {
    throw new NotFoundError('Cart item', { itemId });
  }

  // Check stock based on variant
  const product = await Product.findById(cartItem.product);
  let availableStock = product.stock;
  
  if (cartItem.variantId) {
    const variant = product.variants?.find(v => 
      v._id?.toString() === cartItem.variantId || v.variantName === cartItem.variantId
    );
    if (variant) {
      availableStock = variant.stock;
    }
  }

  if (availableStock < quantity) {
    throw new ValidationError('Insufficient stock', {
      availableStock,
      requestedQuantity: quantity
    });
  }

  cartItem.quantity = quantity;
  await cart.save();
  
  await cart.populate('items.product', 'name basePrice images slug seller stock variants sizes');

  reply.status(200).send(cart);
};

// Remove Item from Cart
export const removeFromCart = async (req, reply) => {
  const { itemId } = req.params;
  const userId = req.user._id;

  const cart = await Cart.findOne({ user: userId });
  if (!cart) {
    throw new NotFoundError('Cart', { userId });
  }

  const cartItem = cart.items.id(itemId);
  if (!cartItem) {
    throw new NotFoundError('Cart item', { itemId });
  }

  cart.items.pull(itemId);
  
  cart.totalItems = cart.items.reduce((total, item) => total + item.quantity, 0);
  cart.totalPrice = cart.items.reduce((total, item) => {
    return total + (item.price * item.quantity);
  }, 0);

  await cart.save();
  
  await cart.populate('items.product', 'name basePrice images slug seller stock variants sizes');

  reply.status(200).send(cart);
};

// Clear Cart
export const clearCart = async (req, reply) => {
  const userId = req.user._id;

  const cart = await Cart.findOne({ user: userId });
  if (!cart) {
    throw new NotFoundError('Cart', { userId });
  }

  cart.items = [];
  cart.totalItems = 0;
  cart.totalPrice = 0;
  await cart.save();

  reply.status(200).send({  
    success: true,
    message: 'Cart cleared successfully',
    data: cart
  });
};