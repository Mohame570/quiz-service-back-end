import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/client';

export const ROLES_KEY = 'roles';

// Usage on a controller method:
//   @Roles(UserRole.ADMIN)
//   @UseGuards(JwtAuthGuard, RolesGuard)
//   adminOnlyEndpoint() {}
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles)