import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';

export const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction): Response => {
  // Always log errors
  if (process.env.NODE_ENV === 'development') {
    console.error('Error:', err);
  } else {
    console.error(`[${new Date().toISOString()}] Error: ${err.message}`);
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
  }

  // Operational errors
  if (err instanceof ApiError) {
    return ApiResponse.error(res, {
      message: err.message,
      statusCode: err.statusCode,
      errors: err.errors,
    });
  }

  // Sequelize validation errors
  if (err.name === 'SequelizeValidationError') {
    const errors = err.errors.map((e: any) => ({ field: e.path, message: e.message }));
    return ApiResponse.validationError(res, errors);
  }

  // Sequelize unique constraint
  if (err.name === 'SequelizeUniqueConstraintError') {
    const field = err.errors?.[0]?.path || 'unknown';
    return ApiResponse.error(res, { message: `${field} already exists`, statusCode: 409 });
  }

  // Sequelize FK constraint
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return ApiResponse.error(res, { message: 'Referenced resource does not exist', statusCode: 400 });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return ApiResponse.unauthorized(res, 'Invalid token');
  }
  if (err.name === 'TokenExpiredError') {
    return ApiResponse.unauthorized(res, 'Token expired');
  }

  // Multer
  if (err.code === 'LIMIT_FILE_SIZE') {
    return ApiResponse.error(res, { message: 'File too large', statusCode: 413 });
  }

  return ApiResponse.error(res, {
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    statusCode: 500,
  });
};
