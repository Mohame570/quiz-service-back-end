import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';

type JwtPayload = {
  sub: string;
  email: string;
  role: string;
  tokenVersion?: number;
};

/**
 * JwtAuthGuard
 * -------------------------
 * Verifies JWT tokens, ensures the user is active, and verifies that the token's
 * version matches the current user tokenVersion. If a password reset has occurred,
 * older sessions are immediately rejected.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const authHeader = request.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid Authorization format');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get<string>('jwt.secret'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, isActive: true, tokenVersion: true },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('User account is inactive or not found');
      }

      if (
        payload.tokenVersion !== undefined &&
        payload.tokenVersion !== user.tokenVersion
      ) {
        throw new UnauthorizedException('Session has expired. Please sign in again.');
      }

      request.user = payload;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
