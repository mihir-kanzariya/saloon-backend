import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest } from '../types';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { isWasabiConfigured, createPresignedUploadUrl, createPresignedReadUrl, getWasabiPublicUrl, extractKeyFromUrl, deleteFromWasabi } from '../services/wasabi';

export class UploadController {
  /**
   * POST /uploads/presigned-url
   * Body: { folder: string, fileName: string, contentType: string }
   * Returns: { uploadUrl, publicUrl, key }
   */
  static async getPresignedUrl(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!isWasabiConfigured()) {
        throw ApiError.badRequest('File storage is not configured');
      }

      const { folder, fileName, contentType, file_size } = req.body;
      if (!folder || !fileName || !contentType) {
        throw ApiError.badRequest('folder, fileName and contentType are required');
      }

      // B.4: Validate file size (max 5MB)
      const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes
      if (file_size !== undefined) {
        const size = Number(file_size);
        if (isNaN(size) || size <= 0) {
          throw ApiError.badRequest('file_size must be a positive number');
        }
        if (size > MAX_FILE_SIZE) {
          throw ApiError.badRequest(`File size exceeds the 5MB limit`);
        }
      }

      // B.4: Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(contentType)) {
        throw ApiError.badRequest(`File type not allowed. Allowed: ${allowedTypes.join(', ')}`);
      }

      // B.4: Validate file extension matches content type
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp'];
      if (!allowedExtensions.includes(ext)) {
        throw ApiError.badRequest(`File extension not allowed. Allowed: ${allowedExtensions.join(', ')}`);
      }

      // B.4: Sanitize folder path — prevent directory traversal
      const sanitizedFolder = folder.replace(/[^a-zA-Z0-9_-]/g, '');
      if (!sanitizedFolder) {
        throw ApiError.badRequest('Invalid folder name');
      }

      const key = `${sanitizedFolder}/${uuidv4()}.${ext}`;

      const uploadUrl = await createPresignedUploadUrl(key, contentType);
      // publicUrl goes through our backend redirect which generates a presigned read URL
      const publicUrl = `${req.protocol}://${req.get('host')}/api/v1/uploads/file/${key}`;

      ApiResponse.success(res, {
        data: { uploadUrl, publicUrl, key },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /uploads/file/*
   * Generates a presigned read URL and 302-redirects.
   * No auth required — the presigned URL itself is the auth.
   */
  static async getFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!isWasabiConfigured()) {
        throw ApiError.badRequest('File storage is not configured');
      }

      const rawKey = req.params.key; // named wildcard param
      const key = Array.isArray(rawKey) ? rawKey.join('/') : rawKey;
      if (!key) throw ApiError.badRequest('File key is required');

      const signedUrl = await createPresignedReadUrl(key, 3600);
      res.redirect(302, signedUrl);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /uploads/read-url
   * Query: { key: string } OR { url: string }
   * Returns a presigned read URL without redirect (for programmatic use).
   */
  static async getReadUrl(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!isWasabiConfigured()) {
        throw ApiError.badRequest('File storage is not configured');
      }

      const rawKey = (req.query.key || req.query.url || '') as string;
      if (!rawKey) throw ApiError.badRequest('key or url query param is required');

      const key = extractKeyFromUrl(rawKey);
      const signedUrl = await createPresignedReadUrl(key, 3600);

      ApiResponse.success(res, { data: { url: signedUrl } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /uploads
   * Body: { url: string }
   */
  static async deleteFile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!isWasabiConfigured()) {
        throw ApiError.badRequest('File storage is not configured');
      }

      const { url } = req.body;
      if (!url) throw ApiError.badRequest('url is required');

      await deleteFromWasabi(url);
      ApiResponse.success(res, { message: 'File deleted' });
    } catch (error) {
      next(error);
    }
  }
}
