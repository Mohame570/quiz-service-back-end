import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * EmailVerifiedGuard
 * -------------------------
 * This guard ensures the authenticated user has a verified email address.
 * It reads the user ID from `request.user` (set by JwtAuthGuard),
 * checks the database, and blocks access if the email is not verified.
 * Only verified users are allowed to proceed to protected routes.
 */

@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Get request object
    const request = context.switchToHttp().getRequest();

    // 2. Extract user from JWT (set by AuthGuard later)
    const userId = request.user?.sub;

    // 3. If no user → block access
    if (!userId) {
      throw new ForbiddenException('User not authenticated');
    }

    // 4. Fetch user from database
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        emailVerified: true,
      },
    });

    // 5. If user not found or not verified → block
    if (!user || !user.emailVerified) {
      throw new ForbiddenException('Email not verified');
    }

    // 6. Allow request to continue
    return true;
  }
}