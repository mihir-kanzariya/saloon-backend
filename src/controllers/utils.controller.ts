import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';

export class UtilsController {
  // GET /utils/ifsc/:code
  static async lookupIFSC(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const code = req.params.code as string;
      if (!code || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(code.toUpperCase())) {
        throw ApiError.badRequest('Invalid IFSC code format');
      }
      const response = await axios.get(`https://ifsc.razorpay.com/${code.toUpperCase()}`);
      ApiResponse.success(res, { data: { bank: response.data.BANK, branch: response.data.BRANCH, city: response.data.CITY, state: response.data.STATE, ifsc: code.toUpperCase() } });
    } catch (error: any) {
      if (error.response?.status === 404) throw ApiError.notFound('IFSC code not found');
      if (error instanceof ApiError) throw error;
      next(error);
    }
  }
}
