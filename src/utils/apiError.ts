export class ApiError extends Error {
  statusCode: number;
  errors: any;
  isOperational: boolean;

  constructor(statusCode: number, message: string, errors: any = null) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad request', errors: any = null): ApiError {
    return new ApiError(400, message, errors);
  }

  static unauthorized(message = 'Unauthorized'): ApiError {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Forbidden'): ApiError {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found'): ApiError {
    return new ApiError(404, message);
  }

  static conflict(message = 'Resource already exists'): ApiError {
    return new ApiError(409, message);
  }

  static validationError(message = 'Validation failed', errors: any = null): ApiError {
    return new ApiError(422, message, errors);
  }

  static internal(message = 'Internal server error'): ApiError {
    return new ApiError(500, message);
  }

  static tooManyRequests(message = 'Too many requests'): ApiError {
    return new ApiError(429, message);
  }
}
