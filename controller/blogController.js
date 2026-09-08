// controllers/blogController.js
import Blog from '../models/Blog.js';
import { smartSizeOptimization } from '../middleware/uploadMiddleware.js';
import { 
  ValidationError, 
  NotFoundError, 
  AuthorizationError, 
  ConflictError,
  DatabaseError 
} from '../utils/errors.js';

// Apply optimization middleware for blog images
export const uploadBlogImage = smartSizeOptimization(50); // Target 50KB for blog images

/**
 * @desc    Create a new blog post
 * @route   POST /api/blogs
 * @access  Private/Admin
 */
export const createBlog = async (req, reply) => {
  const {
    title,
    description,
    content,
    imageAlt,
    excerpt,
    category,
    tags,
    status,
    // SEO fields
    metaTitle,
    metaDescription,
    metaKeywords,
    canonicalUrl,
    ogTitle,
    ogDescription
  } = req.body;

  // Check if file was uploaded
  if (!req.files || req.files.length === 0) {
    throw new ValidationError('Please upload at least a blog image', {
      field: 'image',
      required: true
    });
  }

  // Find images by field names
  const blogImage = req.files.find(file => file.fieldname === 'image');
  const ogImageFile = req.files.find(file => file.fieldname === 'ogImage');

  if (!blogImage) {
    throw new ValidationError('Blog image is required (field name: "image")', {
      field: 'image',
      required: true
    });
  }

  // Parse metaKeywords if it's a string
  let parsedMetaKeywords = [];
  if (metaKeywords) {
    if (typeof metaKeywords === 'string') {
      parsedMetaKeywords = metaKeywords.split(',').map(kw => kw.trim()).filter(kw => kw);
    } else if (Array.isArray(metaKeywords)) {
      parsedMetaKeywords = metaKeywords;
    }
  }

  // Parse tags if it's a string
  let parsedTags = [];
  if (tags) {
    if (typeof tags === 'string') {
      parsedTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag);
    } else if (Array.isArray(tags)) {
      parsedTags = tags;
    }
  }

  // Create blog post - store filenames only
  const blog = await Blog.create({
    title,
    description,
    content,
    image: blogImage.filename,
    imageAlt: imageAlt || title,
    excerpt: excerpt || description.substring(0, 250) + '...',
    author: req.user._id,
    authorName: req.user.name || req.user.username,
    category,
    tags: parsedTags,
    status: status || 'draft',
    // SEO fields
    metaTitle: metaTitle || '',
    metaDescription: metaDescription || '',
    metaKeywords: parsedMetaKeywords,
    canonicalUrl: canonicalUrl || '',
    ogTitle: ogTitle || '',
    ogDescription: ogDescription || '',
    ogImage: ogImageFile ? ogImageFile.filename : blogImage.filename // Use separate ogImage if uploaded, otherwise use blog image
  });

  reply.status(201).send({
    success: true,
    message: 'Blog post created successfully',
    data: blog
  });
};

/**
 * @desc    Update a blog post
 * @route   PUT /api/blogs/:id
 * @access  Private/Admin
 */
export const updateBlog = async (req, reply) => {
  const { id } = req.params;
  
  const {
    title,
    description,
    content,
    imageAlt,
    excerpt,
    category,
    tags,
    status,
    // SEO fields
    metaTitle,
    metaDescription,
    metaKeywords,
    canonicalUrl,
    ogTitle,
    ogDescription
  } = req.body;

  // Find blog
  const blog = await Blog.findById(id);
  if (!blog) {
    throw new NotFoundError('Blog post', { id });
  }

  // Check authorization
  if (blog.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    throw new AuthorizationError('Not authorized to update this blog', {
      userId: req.user._id,
      blogAuthor: blog.author,
      userRole: req.user.role
    });
  }

  // Handle image updates if files are uploaded
  let imageUpdate = {};
  
  if (req.files && req.files.length > 0) {
    // Find images by field names
    const blogImage = req.files.find(file => file.fieldname === 'image');
    const ogImageFile = req.files.find(file => file.fieldname === 'ogImage');
    
    if (blogImage) {
      imageUpdate.image = blogImage.filename;
      // If ogImage not uploaded separately, update it to new blog image
      if (!ogImageFile) {
        imageUpdate.ogImage = blogImage.filename;
      }
    }
    
    if (ogImageFile) {
      imageUpdate.ogImage = ogImageFile.filename;
    }
  }

  // Parse metaKeywords
  let parsedMetaKeywords = blog.metaKeywords;
  if (metaKeywords !== undefined) {
    if (typeof metaKeywords === 'string') {
      parsedMetaKeywords = metaKeywords.split(',').map(kw => kw.trim()).filter(kw => kw);
    } else if (Array.isArray(metaKeywords)) {
      parsedMetaKeywords = metaKeywords;
    }
  }

  // Parse tags
  let parsedTags = blog.tags;
  if (tags !== undefined) {
    if (typeof tags === 'string') {
      parsedTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag);
    } else if (Array.isArray(tags)) {
      parsedTags = tags;
    }
  }

  // Update blog
  const updatedBlog = await Blog.findByIdAndUpdate(
    id,
    {
      title,
      description,
      content,
      imageAlt: imageAlt || blog.imageAlt,
      excerpt,
      category,
      tags: parsedTags,
      status,
      // SEO fields
      metaTitle: metaTitle || blog.metaTitle,
      metaDescription: metaDescription || blog.metaDescription,
      metaKeywords: parsedMetaKeywords,
      canonicalUrl: canonicalUrl || blog.canonicalUrl,
      ogTitle: ogTitle || blog.ogTitle,
      ogDescription: ogDescription || blog.ogDescription,
      ...imageUpdate
    },
    { new: true, runValidators: true }
  );

  reply.status(200).send({
    success: true,
    message: 'Blog post updated successfully',
    data: updatedBlog
  });
};

/**
 * @desc    Get all blog posts
 * @route   GET /api/blogs
 * @access  Public
 */
export const getAllBlogs = async (req, reply) => {
  const {
    page = 1,
    limit = 10,
    sort = '-createdAt'
  } = req.query;

  // Build query - NO FILTERS, GET ALL BLOGS
  const query = {}; // Empty query = get all documents

  // REMOVED ALL FILTERS:
  // - No status filter (get draft, published, archived)
  // - No category filter
  // - No tag filter
  // - No author filter
  // - No search filter

  // Execute query with pagination - GET ALL BLOGS
  const blogs = await Blog.find(query)
    .populate('author', 'name username avatar')
    .sort(sort)
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit))
    .select('-content'); // Don't send full content in list

  // Get total count for ALL blogs
  const total = await Blog.countDocuments(query);
  const totalPages = Math.ceil(total / parseInt(limit));

  reply.status(200).send({
    success: true,
    count: blogs.length,
    total,
    totalPages,
    currentPage: parseInt(page),
    data: blogs
  });
};

/**
 * @desc    Get single blog post by slug
 * @route   GET /api/blogs/:slug
 * @access  Public
 */
export const getBlogBySlug = async (req, reply) => {
  const { slug } = req.params;

  // Find blog WITHOUT populating comments
  const blog = await Blog.findOne({ slug })
    .populate('author', 'name username avatar bio');
    // REMOVED: .populate('comments', 'content author createdAt');

  if (!blog) {
    throw new NotFoundError('Blog post', { slug });
  }

  // Update views
  await Blog.findByIdAndUpdate(blog._id, { $inc: { views: 1 } });

  reply.status(200).send({
    success: true,
    data: blog
  });
};

/**
 * @desc    Get single blog post by ID
 * @route   GET /api/blogs/id/:id
 * @access  Public
 */
export const getBlogById = async (req, reply) => {
  const { id } = req.params;

  const blog = await Blog.findById(id);

  if (!blog) {
    throw new NotFoundError('Blog post', { id });
  }

  // This automatically includes virtuals
  reply.status(200).send({
    success: true,
    data: blog.toJSON() // This will include imageUrl and ogImageUrl
  });
};

/**
 * @desc    Delete blog post
 * @route   DELETE /api/blogs/:id
 * @access  Private/Admin
 */
export const deleteBlog = async (req, reply) => {
  const { id } = req.params;

  const blog = await Blog.findById(id);
  if (!blog) {
    throw new NotFoundError('Blog post', { id });
  }

  // Check authorization
  if (blog.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    throw new AuthorizationError('Not authorized to delete this blog', {
      userId: req.user._id,
      blogAuthor: blog.author,
      userRole: req.user.role
    });
  }

  await blog.deleteOne();

  reply.status(200).send({
    success: true,
    message: 'Blog post deleted successfully'
  });
};

/**
 * @desc    Like/Unlike blog post
 * @route   POST /api/blogs/:id/like
 * @access  Private
 */
export const toggleLike = async (req, reply) => {
  const { id } = req.params;
  const userId = req.user._id;

  const blog = await Blog.findById(id);
  if (!blog) {
    throw new NotFoundError('Blog post', { id });
  }

  const isLiked = blog.likes.includes(userId);

  if (isLiked) {
    // Unlike
    blog.likes = blog.likes.filter(likeId => likeId.toString() !== userId.toString());
  } else {
    // Like
    blog.likes.push(userId);
  }

  await blog.save();

  reply.status(200).send({
    success: true,
    message: isLiked ? 'Blog unliked' : 'Blog liked',
    likesCount: blog.likes.length,
    isLiked: !isLiked
  });
};

/**
 * @desc    Get blog categories
 * @route   GET /api/blogs/categories
 * @access  Public
 */
export const getBlogCategories = async (req, reply) => {
  const categories = await Blog.distinct('category', { status: 'published' });
  
  reply.status(200).send({
    success: true,
    count: categories.length,
    data: categories.filter(cat => cat).sort()
  });
};

/**
 * @desc    Get blog tags
 * @route   GET /api/blogs/tags
 * @access  Public
 */
export const getBlogTags = async (req, reply) => {
  const tags = await Blog.aggregate([
    { $match: { status: 'published' } },
    { $unwind: '$tags' },
    { $group: { _id: '$tags', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $project: { tag: '$_id', count: 1, _id: 0 } }
  ]);

  reply.status(200).send({
    success: true,
    count: tags.length,
    data: tags
  });
};

/**
 * @desc    Get related blogs
 * @route   GET /api/blogs/:id/related
 * @access  Public
 */
export const getRelatedBlogs = async (req, reply) => {
  const { id } = req.params;
  const limit = parseInt(req.query.limit) || 4;

  const blog = await Blog.findById(id);
  if (!blog) {
    throw new NotFoundError('Blog post', { id });
  }

  // Always get 4 latest blogs (excluding current)
  const relatedBlogs = await Blog.find({
    _id: { $ne: id }
  })
  .limit(limit)
  .select('title slug image description excerpt publishedAt readTime views')
  .sort({ createdAt: -1 });

  reply.status(200).send({
    success: true,
    count: relatedBlogs.length,
    data: relatedBlogs
  });
};