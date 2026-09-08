import {
  createBlog,
  getAllBlogs,
  getBlogBySlug,
  updateBlog,
  deleteBlog,
  toggleLike,
  getBlogCategories,
  getBlogTags,
  getRelatedBlogs,
  uploadBlogImage,
  getBlogById
} from '../controller/blogController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import upload from '../middleware/uploadMiddleware.js';

export default async function blogRoutes(fastify, opts) {
  // ===================== PUBLIC ROUTES =====================
  fastify.get('/', getAllBlogs);
  fastify.get('/categories', getBlogCategories);
  fastify.get('/tags', getBlogTags);
  fastify.get('/:slug', getBlogBySlug);
  fastify.get('/:id/related', getRelatedBlogs);
  fastify.get('/id/:id', getBlogById);

  // ===================== PROTECTED ROUTES (Logged-in users) =====================
  // Like/Unlike - Requires authentication only
  fastify.post('/:id/like', { preHandler: [protect] }, toggleLike);

  // ===================== ADMIN/AUTHOR ROUTES =====================
  // Create blog - Accept ANY field name for image
  fastify.post(
    '/',
    {
      preHandler: [
        protect,
        authorize('admin', 'author'),
        async (req, reply) => {
          // Process files from multer
          return new Promise((resolve, reject) => {
            upload.any()(req, reply.raw, (err) => {
              if (err) {
                reject(err);
                return;
              }
              
              console.log('📁 Files received:', req.files);
              
              // Find the first image file
              if (req.files && req.files.length > 0) {
                // Take the first file regardless of field name
                req.file = req.files[0];
                console.log(`✅ Using file: ${req.file.originalname} (field: ${req.file.fieldname})`);
              }
              
              resolve();
            });
          });
        },
        uploadBlogImage
      ]
    },
    createBlog
  );

  // Update blog - Accept ANY field name for image
  fastify.put(
    '/:id',
    {
      preHandler: [
        protect,
        authorize('admin', 'author'),
        async (req, reply) => {
          // Process files from multer
          return new Promise((resolve, reject) => {
            upload.any()(req, reply.raw, (err) => {
              if (err) {
                reject(err);
                return;
              }
              
              // Find the first image file
              if (req.files && req.files.length > 0) {
                req.file = req.files[0];
              }
              
              resolve();
            });
          });
        },
        uploadBlogImage
      ]
    },
    updateBlog
  );

  // Delete blog
  fastify.delete('/:id', { preHandler: [protect, authorize('admin', 'author')] }, deleteBlog);
}