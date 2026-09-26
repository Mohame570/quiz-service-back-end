import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Prisma, UserRole } from '../../../generated/prisma/client';
import { UsersQueryDto } from '../dto/users-query.dto';
import { UsersListResponseDto, UserListItem } from '../dto/users-list-response.dto';

const USER_SELECT_FIELDS = {
  id: true,
  email: true,
  name: true,
  role: true,
  emailVerified: true,
  isActive: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List users with optional search, role filter, status filter, and pagination
   */
  async findAll(queryDto: UsersQueryDto): Promise<UsersListResponseDto> {
    const where: Prisma.UserWhereInput = {};

    if (queryDto.search?.trim()) {
      const search = queryDto.search.trim();
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (queryDto.role) {
      where.role = queryDto.role;
    }

    if (queryDto.isActive !== undefined) {
      where.isActive = queryDto.isActive;
    }

    const page = queryDto.page ?? 1;
    const pageSize = queryDto.pageSize ?? 10;
    const skip = (page - 1) * pageSize;

    const [users, totalItems] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: USER_SELECT_FIELDS,
      }),
      this.prisma.user.count({ where }),
    ]);

    const totalPages = Math.ceil(totalItems / pageSize) || 1;

    return {
      users,
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  /**
   * Deactivate or reactivate an account.
   * Rules:
   * 1. Target user must exist.
   * 2. Self-deactivation is forbidden.
   * 3. Only student accounts can be deactivated/reactivated.
   */
  async updateStatus(
    id: string,
    isActive: boolean,
    requestingUserId?: string,
  ): Promise<UserListItem> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT_FIELDS,
    });

    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found`);
    }

    if (requestingUserId && id === requestingUserId && !isActive) {
      throw new BadRequestException('You cannot deactivate your own account');
    }

    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenException(
        'Admin accounts cannot be deactivated or reactivated. Only student accounts can have their status changed.',
      );
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { isActive },
      select: USER_SELECT_FIELDS,
    });

    return updatedUser;
  }

  /**
   * List recent sign-in events with user identity and timestamps.
   */
  async getSignInActivity(params: { page?: number; pageSize?: number }): Promise<{
    items: {
      id: string;
      userId: string;
      userEmail: string;
      userName: string | null;
      userRole: UserRole;
      ipAddress: string | null;
      userAgent: string | null;
      signedInAt: Date;
    }[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, params.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const [activities, total] = await this.prisma.$transaction([
      this.prisma.signInActivity.findMany({
        skip,
        take: pageSize,
        orderBy: { signedInAt: 'desc' },
        include: {
          user: {
            select: {
              email: true,
              name: true,
              role: true,
            },
          },
        },
      }),
      this.prisma.signInActivity.count(),
    ]);

    const items = activities.map((activity) => ({
      id: activity.id,
      userId: activity.userId,
      userEmail: activity.user.email,
      userName: activity.user.name,
      userRole: activity.user.role,
      ipAddress: activity.ipAddress,
      userAgent: activity.userAgent,
      signedInAt: activity.signedInAt,
    }));

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }
}
