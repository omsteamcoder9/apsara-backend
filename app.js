// ✅ 1. LOAD .env FIRST - BEFORE ANYTHING ELSE
import dotenv from "dotenv";
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

console.log("Loaded MONGO_URI:", process.env.MONGO_URI);
console.log("🔑 GEMINI_API_KEY exists:", !!process.env.GEMINI_API_KEY);
console.log("📦 R2 Configuration:");
console.log("   R2_ACCOUNT_ID:", process.env.R2_ACCOUNT_ID ? "✅ Set" : "❌ Missing");
console.log("   R2_BUCKET_NAME:", process.env.R2_BUCKET_NAME ? "✅ Set" : "❌ Missing");
console.log("   R2_ENDPOINT:", process.env.R2_ENDPOINT ? "✅ Set" : "❌ Missing");

// ✅ 2. NOW import everything else
import fastify from 'fastify';
import mongoose from 'mongoose';
import cors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';

// ============ IMPORT ROUTES ============
import authRoutes from './routes/auth.js';
import userRoutes from './routes/user.js';
import adminRoutes from './routes/admin.js';
import productRoutes from './routes/productRoutes.js';
import cartRoutes from './routes/cartRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import emailRoutes from './routes/emailRoutes.js';
import shippingRoutes from './routes/shippingRoutes.js';
import statsRoutes from './routes/statsRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import blogRoutes from './routes/blogRoutes.js';
import backupRoutes from './routes/backupRoutes.js'; // ✅ ADD THIS

// ============ IMPORT ERROR HANDLER ============
import { errorHandler } from './middleware/errorHandler.js';

// -------------------------------
// 🚀 Create Fastify App
// -------------------------------
const app = fastify({
  logger: true
});

// ============ ✅ REGISTER GLOBAL ERROR HANDLER ============
app.setErrorHandler(errorHandler);

// ============ CORS Configuration ============
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
  : [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
      'http://localhost:5174'
    ];

console.log("✅ Allowed Origins:", allowedOrigins);

await app.register(cors, {
  origin: function (origin, callback) {
    if (!origin) {
      console.log("⚠️  No origin header - allowing request");
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      console.log(`✅ Allowed CORS for: ${origin}`);
      return callback(null, true);
    } else if (origin.endsWith('localhost:5174') || origin.endsWith('localhost:5173')) {
      console.log(`✅ Allowed CORS for localhost variation: ${origin}`);
      return callback(null, true);
    } else {
      console.log(`❌ BLOCKED CORS: ${origin}`);
      return callback(new Error(`CORS NOT ALLOWED: ${origin}`), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'X-Total-Count'],
  maxAge: 86400
});

// ============ REGISTER MULTIPART PLUGIN ============
await app.register(fastifyMultipart, {
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  attachFieldsToBody: true,
});

await app.register(import('@fastify/formbody'));

// ============ Static files ============
await app.register(import('@fastify/static'), {
  root: path.join(__dirname, 'uploads'),
  prefix: '/uploads',
});

// ============ Routes ============
await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(userRoutes, { prefix: '/api/users' });
await app.register(adminRoutes, { prefix: '/api/admin' });
await app.register(productRoutes, { prefix: '/api/products' });
await app.register(cartRoutes, { prefix: '/api/cart' });
await app.register(orderRoutes, { prefix: '/api/orders' });
await app.register(paymentRoutes, { prefix: '/api/payments' });
await app.register(emailRoutes, { prefix: '/api/email' });
await app.register(shippingRoutes, { prefix: '/api/shipping' });
await app.register(statsRoutes, { prefix: '/api/stats' });
await app.register(contactRoutes, { prefix: '/api/contacts' });
await app.register(categoryRoutes, { prefix: '/api/categories' });
await app.register(settingsRoutes, { prefix: '/api/settings' });
await app.register(settingsRoutes, { prefix: '/api/admin/settings' });
await app.register(blogRoutes, { prefix: '/api/blogs' });
await app.register(backupRoutes, { prefix: '/api' }); // ✅ ADD THIS

app.get('/', async (req, reply) => {
  reply.send({ message: 'E-commerce backend running' });
});

// -------------------------------
// 🟢 MongoDB Setup
// -------------------------------
const MONGO_URI = process.env.MONGO_URI;
global.JWT_SECRET = process.env.JWT_SECRET;

if (!MONGO_URI) {
  console.error("❌ ERROR: MONGO_URI is missing. Check your .env file!");
  process.exit(1);
}

if (!/^mongodb(\+srv)?:\/\//.test(MONGO_URI)) {
  console.error("❌ ERROR: Invalid MONGO_URI format. Must start with mongodb:// or mongodb+srv://");
  console.error("Received:", MONGO_URI);
  process.exit(1);
}

export const initDB = async () => {
  try {
    if (mongoose.connection.readyState === 1) return mongoose;

    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB connected to", MONGO_URI);
    return mongoose;
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  }
};

// -------------------------------
// 🚀 Start Server
// -------------------------------
const PORT = process.env.PORT || 5002;

const startServer = async () => {
  await initDB();

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📦 R2 Bucket: ${process.env.R2_BUCKET_NAME}`);
    console.log(`🔗 R2 Public URL: ${process.env.R2_PUBLIC_URL}`);
    console.log(`💾 Backup System: Email (Permanent Storage - No Expiry)`);
  } catch (err) {
    console.error("❌ Server error:", err);
    process.exit(1);
  }
};

startServer();

export default app;