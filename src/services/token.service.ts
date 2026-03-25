import jwt from 'jsonwebtoken';
import config from '../config';

export class TokenService {
  static generateAccessToken(user: { id: string; phone: string; role: string }): string {
    return jwt.sign(
      { id: user.id, phone: user.phone, role: user.role },
      config.jwt.secret as jwt.Secret,
      { expiresIn: config.jwt.expiresIn } as any
    );
  }

  static generateRefreshToken(user: { id: string }): string {
    return jwt.sign(
      { id: user.id },
      config.jwt.refreshSecret as jwt.Secret,
      { expiresIn: config.jwt.refreshExpiresIn } as any
    );
  }

  static generateTokens(user: { id: string; phone: string; role: string }): { accessToken: string; refreshToken: string } {
    return {
      accessToken: TokenService.generateAccessToken(user),
      refreshToken: TokenService.generateRefreshToken(user),
    };
  }

  static verifyRefreshToken(token: string): any {
    return jwt.verify(token, config.jwt.refreshSecret as jwt.Secret);
  }
}
