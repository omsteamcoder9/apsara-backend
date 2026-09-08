// middleware/errorHandler.js
// ============================================
// PURPOSE: Catch and handle ALL errors
// REGISTERED IN: app.js
// ============================================

import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  PaymentRequiredError,
  ForbiddenError,
  DatabaseError,
  StorageError,
  OptimizationError,
  BusinessLogicError
} from '../utils/errors.js';

/**
 * Global Error Handler
 * Catches ALL errors from controllers, middleware, services
 */
export async function errorHandler(error, request, reply) {
  // ============ GENERATE REQUEST ID ============
  const requestId = request.id || 
                    request.headers['x-request-id'] || 
                    generateRequestId();
  
  // ============ GET USER CONTEXT ============
  const userId = request.user?.userId || request.user?.id || 'anonymous';
  const userRole = request.user?.role || 'unknown';
  const route = `${request.method} ${request.routeOptions?.url || request.url}`;
  
  // ============ DEFAULT VALUES ============
  let statusCode = 500;
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected error occurred. Please try again.';
  let details = null;
  let stack = null;

  // ==========================================
  // 1. CHECK: Is it our custom error?
  // ==========================================
  if (error instanceof AppError) {
    statusCode = error.statusCode || 500;
    errorCode = error.errorCode || 'APP_ERROR';
    message = error.message;
    details = error.details;
    stack = error.stack;
  }

  // ==========================================
  // 2. CHECK: Mongoose Validation Error
  // ==========================================
  else if (error.name === 'ValidationError' || error.name === 'ValidatorError') {
    statusCode = 400;
    errorCode = 'MONGOOSE_VALIDATION_ERROR';
    message = 'Validation failed';
    details = Object.values(error.errors).map(err => ({
      field: err.path,
      message: err.message
    }));
    stack = error.stack;
  }

  // ==========================================
  // 3. CHECK: Mongoose Duplicate Key Error
  // ==========================================
  else if (error.code === 11000) {
    statusCode = 409;
    errorCode = 'DUPLICATE_KEY_ERROR';
    const field = Object.keys(error.keyPattern || {})[0];
    message = `${field} already exists`;
    details = { field, value: error.keyValue?.[field] };
    stack = error.stack;
  }

  // ==========================================
  // 4. CHECK: Mongoose Cast Error (Invalid ID)
  // ==========================================
  else if (error.name === 'CastError') {
    statusCode = 400;
    errorCode = 'INVALID_ID_ERROR';
    message = `Invalid ${error.path}: ${error.value}`;
    details = { field: error.path, value: error.value };
    stack = error.stack;
  }

  // ==========================================
  // 5. CHECK: JWT Errors
  // ==========================================
  else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorCode = 'INVALID_TOKEN';
    message = 'Invalid authentication token';
    stack = error.stack;
  }
  else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    errorCode = 'TOKEN_EXPIRED';
    message = 'Authentication token expired';
    stack = error.stack;
  }

  // ==========================================
  // 6. CHECK: Rate Limiting
  // ==========================================
  else if (error.statusCode === 429) {
    statusCode = 429;
    errorCode = 'RATE_LIMIT_EXCEEDED';
    message = 'Too many requests. Please try again later.';
    stack = error.stack;
  }

  // ==========================================
  // 7. CHECK: Fastify Validation Error
  // ==========================================
  else if (error.validation) {
    statusCode = 400;
    errorCode = 'FASTIFY_VALIDATION_ERROR';
    message = 'Request validation failed';
    details = error.validation;
    stack = error.stack;
  }

  // ==========================================
  // 8. CHECK: System Errors (File, Network, etc.)
  // ==========================================
  else if (error.code === 'ENOENT') {
    statusCode = 500;
    errorCode = 'FILE_NOT_FOUND';
    message = 'File not found';
    stack = error.stack;
  }
  else if (error.code === 'EACCES') {
    statusCode = 500;
    errorCode = 'PERMISSION_DENIED';
    message = 'Permission denied';
    stack = error.stack;
  }
  else if (error.code === 'ENOSPC') {
    statusCode = 500;
    errorCode = 'DISK_FULL';
    message = 'No space left on device';
    stack = error.stack;
  }
  else if (error.code === 'ECONNREFUSED') {
    statusCode = 500;
    errorCode = 'CONNECTION_REFUSED';
    message = 'Connection refused';
    stack = error.stack;
  }
  else if (error.code === 'ETIMEDOUT') {
    statusCode = 500;
    errorCode = 'OPERATION_TIMEOUT';
    message = 'Operation timed out';
    stack = error.stack;
  }

  // ==========================================
  // 9. CHECK: Runtime JavaScript Errors
  // ==========================================
  else if (error.name === 'SyntaxError') {
    statusCode = 500;
    errorCode = 'SYNTAX_ERROR';
    message = 'Syntax error in code';
    stack = error.stack;
  }
  else if (error.name === 'ReferenceError') {
    statusCode = 500;
    errorCode = 'REFERENCE_ERROR';
    message = 'Reference error in code';
    stack = error.stack;
  }
  else if (error.name === 'TypeError') {
    statusCode = 500;
    errorCode = 'TYPE_ERROR';
    message = 'Type error in code';
    stack = error.stack;
  }

  // ==========================================
  // 10. ANY OTHER UNEXPECTED ERROR
  // ==========================================
  else {
    statusCode = 500;
    errorCode = 'INTERNAL_SERVER_ERROR';
    message = process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred. Please try again.'
      : error.message || 'Unknown error';
    details = process.env.NODE_ENV === 'production' ? null : {
      name: error.name,
      ...(error.details || {})
    };
    stack = error.stack;
  }

  // ==========================================
  // LOGGING
  // ==========================================
  const logEntry = {
    timestamp: new Date().toISOString(),
    requestId,
    userId,
    userRole,
    route,
    method: request.method,
    url: request.url,
    statusCode,
    errorCode,
    message,
    details,
    stack: process.env.NODE_ENV === 'development' ? stack : undefined,
    ip: request.ip || request.headers['x-forwarded-for'] || 'unknown',
    userAgent: request.headers['user-agent'] || 'unknown'
  };

  // Log based on severity
  if (statusCode >= 500) {
    console.error('❌ [ERROR]', JSON.stringify(logEntry, null, 2));
  } else if (statusCode >= 400) {
    console.warn('⚠️ [WARNING]', JSON.stringify(logEntry, null, 2));
  } else {
    console.log('📝 [INFO]', JSON.stringify(logEntry, null, 2));
  }

  // ==========================================
  // CLEANUP: Delete uploaded files on error
  // ==========================================
  if (request.uploadedFiles && request.uploadedFiles.length > 0) {
    console.log(`🧹 [CLEANUP] Removing ${request.uploadedFiles.length} uploaded files`);
    for (const file of request.uploadedFiles) {
      try {
        const fs = await import('fs');
        if (file.path && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
          console.log(`🗑️ [CLEANUP] Removed: ${file.path}`);
        }
        if (file.optimizedPath && fs.existsSync(file.optimizedPath)) {
          fs.unlinkSync(file.optimizedPath);
          console.log(`🗑️ [CLEANUP] Removed optimized: ${file.optimizedPath}`);
        }
      } catch (cleanupError) {
        console.warn(`⚠️ [CLEANUP] Could not remove: ${file.path}`, cleanupError.message);
      }
    }
    request.uploadedFiles = [];
  }

  // ==========================================
  // SEND RESPONSE TO CLIENT
  // ==========================================
  const response = {
    success: false,
    status: 'error',
    errorCode,
    message,
    timestamp: new Date().toISOString(),
    requestId
  };

  // Add details if available
  if (details) {
    response.details = details;
  }

  // Add stack trace in development only
  if (process.env.NODE_ENV === 'development' && stack) {
    response.stack = stack;
  }

  return reply.status(statusCode).send(response);
}

// ==========================================
// HELPER: Generate Request ID
// ==========================================
function generateRequestId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 7);
  return `${timestamp}-${random}`;
}