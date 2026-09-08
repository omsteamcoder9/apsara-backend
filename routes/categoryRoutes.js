// routes/categoryRoutes.js
import {
    createCategory,
    getAllCategories,
    getCategoryById,
    updateCategory,
    deleteCategory,
    getCategoriesTree,
    getCategoryProducts,
    getActiveCategories,
    generateDescriptionWithGemini,
    generateImageWithPollinations  // ✅ Import image generator
} from '../controller/categoryController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

export default async function categoryRoutes(fastify, opts) {
    console.log('🔵 Registering category routes...');

    fastify.get('/', { handler: getAllCategories });
    fastify.get('/tree', { handler: getCategoriesTree });
    fastify.get('/active', { handler: getActiveCategories });
    fastify.get('/:id', { handler: getCategoryById });
    fastify.get('/:id/products', { handler: getCategoryProducts });

    // ✅ POST - Working with Fastify multipart
    fastify.post('/', {
        preValidation: [protect, authorize('admin')],
        handler: async (req, reply) => {
            try {
                const fields = {};
                let uploadedFile = null;
                
                // ✅ Extract values from field objects
                for (const key of Object.keys(req.body || {})) {
                    const field = req.body[key];
                    if (field && typeof field === 'object' && field.value !== undefined) {
                        fields[key] = field.value;
                    } else if (field !== undefined && field !== null) {
                        fields[key] = field;
                    }
                }
                
                // ✅ Get file from req.body.image
                if (req.body && req.body.image && req.body.image.file) {
                    uploadedFile = req.body.image;
                }
                
                req.body = fields;
                req.uploadedFile = uploadedFile;
                
                return createCategory(req, reply);
            } catch (error) {
                console.error('❌ Handler error:', error);
                return reply.status(500).send({
                    success: false,
                    message: error.message || 'Server error'
                });
            }
        }
    });

    // ✅ Generate preview content (no database save)
    fastify.post('/generate-preview', {
        preValidation: [protect, authorize('admin')],
        handler: async (req, reply) => {
            try {
                const { name } = req.body;
                
                if (!name || !name.trim()) {
                    return reply.status(400).send({
                        success: false,
                        message: 'Category name is required'
                    });
                }
                
                console.log(`🔄 Generating preview for: ${name.trim()}`);
                
                // Generate content using Gemini
                const generated = await generateDescriptionWithGemini(name.trim());
                
                return reply.status(200).send({
                    success: true,
                    data: generated
                });
            } catch (error) {
                console.error('❌ Preview generation error:', error);
                return reply.status(500).send({
                    success: false,
                    message: error.message || 'Failed to generate preview'
                });
            }
        }
    });

    // ✅ Generate image preview (no database save) - UPDATED for R2
    fastify.post('/generate-image-preview', {
        preValidation: [protect, authorize('admin')],
        handler: async (req, reply) => {
            try {
                const { name } = req.body;
                
                if (!name || !name.trim()) {
                    return reply.status(400).send({
                        success: false,
                        message: 'Category name is required'
                    });
                }
                
                console.log(`🖼️ Generating image preview for: ${name.trim()}`);
                
                // Generate image using Pollinations (now returns R2 URL)
                const imagePath = await generateImageWithPollinations(name.trim());
                
                if (!imagePath) {
                    return reply.status(500).send({
                        success: false,
                        message: 'Failed to generate image'
                    });
                }
                
                // Return the R2 URL directly (it's already a full URL)
                return reply.status(200).send({
                    success: true,
                    data: {
                        imagePath: imagePath,
                        imageUrl: imagePath // R2 URL is already complete
                    }
                });
            } catch (error) {
                console.error('❌ Image generation error:', error);
                return reply.status(500).send({
                    success: false,
                    message: error.message || 'Failed to generate image'
                });
            }
        }
    });

    fastify.put('/:id', {
        preValidation: [protect, authorize('admin')],
        handler: async (req, reply) => {
            try {
                const fields = {};
                let uploadedFile = null;
                
                for (const key of Object.keys(req.body || {})) {
                    const field = req.body[key];
                    if (field && typeof field === 'object' && field.value !== undefined) {
                        fields[key] = field.value;
                    } else if (field !== undefined && field !== null) {
                        fields[key] = field;
                    }
                }
                
                if (req.body && req.body.image && req.body.image.file) {
                    uploadedFile = req.body.image;
                }
                
                req.body = fields;
                req.uploadedFile = uploadedFile;
                
                return updateCategory(req, reply);
            } catch (error) {
                console.error('❌ Handler error:', error);
                return reply.status(500).send({
                    success: false,
                    message: error.message || 'Server error'
                });
            }
        }
    });

    fastify.delete('/:id', {
        preValidation: [protect, authorize('admin')]
    }, deleteCategory);

    console.log('✅ Category routes registered');
}