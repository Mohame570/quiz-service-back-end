import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { UsersService } from '../services/users.service';
import { UsersQueryDto } from '../dto/users-query.dto';
import { UpdateUserStatusDto } from '../dto/update-user-status.dto';
import { UsersListResponseDto, UserListItem } from '../dto/users-list-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.gaurd';
import { UserRole } from '../../../generated/prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /api/admin/users
   * Returns a paginated list of users with search and filter capabilities
   */
  @Get()
  async findAll(@Query() query: UsersQueryDto): Promise<UsersListResponseDto> {
    return this.usersService.findAll(query);
  }

  /**
   * GET /api/admin/users/sign-in-activity
   * Returns recent sign-in events with user identity and timestamps
   */
  @Get('sign-in-activity')
  async getSignInActivity(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.usersService.getSignInActivity({
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
    });
  }

  /**
   * PATCH /api/admin/users/:id/status
   * Activate or deactivate a user account (students only, self-deactivation prevented)
   */
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateUserStatusDto,
    @Request() req: { user?: { sub: string } },
  ): Promise<UserListItem> {
    const requestingUserId = req.user?.sub;
    return this.usersService.updateStatus(id, body.isActive, requestingUserId);
  }
}
