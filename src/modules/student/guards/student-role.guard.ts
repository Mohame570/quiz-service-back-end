import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { UserRole } from '../../../generated/prisma/client';

@Injectable()
export class StudentRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const role = request.user?.role as UserRole | undefined;

    if (role !== UserRole.STUDENT) {
      throw new ForbiddenException('Student role required.');
    }

    return true;
  }
}
