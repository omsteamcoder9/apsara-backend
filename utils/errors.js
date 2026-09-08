// utils/errors.js
// ============================================
// PURPOSE: Define ALL error types
// USED BY: Every file that throws errors
// ============================================

/**
 * BASE ERROR - All errors extend from this
 */
export class AppError extends Error {
  constructor(message, statusCode, errorCode, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ============ CLIENT ERRORS (4xx) ============

/**
 * Validation Error - 400 Bad Request
 * Use: Missing fields, invalid format, wrong data type
 */
export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

/**
 * Authentication Error - 401 Unauthorized
 * Use: Not logged in, invalid token
 */
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required', details = null) {
    super(message, 401, 'AUTHENTICATION_ERROR', details);
  }
}

/**
 * Authorization Error - 403 Forbidden
 * Use: Logged in but wrong role/permission
 */
export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions', details = null) {
    super(message, 403, 'AUTHORIZATION_ERROR', details);
  }
}

/**
 * Not Found Error - 404 Not Found
 * Use: Resource doesn't exist
 */
export class NotFoundError extends AppError {
  constructor(resource, details = null) {
    super(`${resource} not found`, 404, 'NOT_FOUND', details);
  }
}

/**
 * Conflict Error - 409 Conflict
 * Use: Duplicate entry (plan name, email)
 */
export class ConflictError extends AppError {
  constructor(message, details = null) {
    super(message, 409, 'CONFLICT_ERROR', details);
  }
}

/**
 * Payment Required - 402 Payment Required
 * Use: No credits, insufficient balance
 */
export class PaymentRequiredError extends AppError {
  constructor(message = 'Insufficient credits', details = null) {
    super(message, 402, 'PAYMENT_REQUIRED', details);
  }
}

/**
 * Forbidden Error - 403 Forbidden
 * Use: Access denied to specific resource
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Access denied', details = null) {
    super(message, 403, 'FORBIDDEN_ERROR', details);
  }
}

/**
 * Unprocessable Entity - 422
 * Use: Business rule violation
 */
export class BusinessLogicError extends AppError {
  constructor(message, details = null) {
    super(message, 422, 'BUSINESS_LOGIC_ERROR', details);
  }
}

// ============ SERVER ERRORS (5xx) ============

/**
 * Database Error - 500
 * Use: Database operation fails
 */
export class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', details = null) {
    super(message, 500, 'DATABASE_ERROR', details);
  }
}

/**
 * Storage Error - 500
 * Use: File operations fail
 */
export class StorageError extends AppError {
  constructor(message = 'File operation failed', details = null) {
    super(message, 500, 'STORAGE_ERROR', details);
  }
}

/**
 * Optimization Error - 500
 * Use: Image processing fails
 */
export class OptimizationError extends AppError {
  constructor(message = 'Image optimization failed', details = null) {
    super(message, 500, 'OPTIMIZATION_ERROR', details);
  }
}