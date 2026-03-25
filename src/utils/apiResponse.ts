import { Response } from 'express';

interface SuccessOptions {
  data?: any;
  message?: string;
  statusCode?: number;
  meta?: any;
}

interface ErrorOptions {
  message?: string;
  statusCode?: number;
  errors?: any;
}

interface PaginatedOptions {
  data: any;
  page: number | string;
  limit: number | string;
  total: number;
  message?: string;
}

export class ApiResponse {
  static success(res: Response, options: SuccessOptions): Response {
    const { data = null, message = 'Success', statusCode = 200, meta = null } = options;
    const response: any = { success: true, message, data };
    if (meta) response.meta = meta;
    return res.status(statusCode).json(response);
  }

  static created(res: Response, options: { data?: any; message?: string }): Response {
    return ApiResponse.success(res, { ...options, statusCode: 201, message: options.message || 'Created successfully' });
  }

  static error(res: Response, options: ErrorOptions): Response {
    const { message = 'Something went wrong', statusCode = 500, errors = null } = options;
    const response: any = { success: false, message };
    if (errors) response.errors = errors;
    return res.status(statusCode).json(response);
  }

  static validationError(res: Response, errors: any): Response {
    return ApiResponse.error(res, { message: 'Validation failed', statusCode: 422, errors });
  }

  static notFound(res: Response, message = 'Resource not found'): Response {
    return ApiResponse.error(res, { message, statusCode: 404 });
  }

  static unauthorized(res: Response, message = 'Unauthorized'): Response {
    return ApiResponse.error(res, { message, statusCode: 401 });
  }

  static forbidden(res: Response, message = 'Forbidden'): Response {
    return ApiResponse.error(res, { message, statusCode: 403 });
  }

  static paginated(res: Response, options: PaginatedOptions): Response {
    const { data, page, limit, total, message = 'Success' } = options;
    return ApiResponse.success(res, {
      data,
      message,
      meta: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  }
}
