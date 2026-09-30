import {
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { SettingsService } from '../services/settings.service';
import { UpdateSettingsDto } from '../dto/update-settings.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.gaurd';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../../generated/prisma/enums';
import { OrganizationSettings } from '../../../generated/prisma/client';

@Controller('admin/settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /**
   * GET /api/admin/settings
   * Retrieve institutional defaults
   */
  @Get()
  async getSettings(): Promise<OrganizationSettings> {
    return this.settingsService.getSettings();
  }

  /**
   * PATCH /api/admin/settings
   * Update institutional defaults
   */
  @Patch()
  async updateSettings(
    @Body() dto: UpdateSettingsDto,
  ): Promise<OrganizationSettings> {
    return this.settingsService.updateSettings(dto);
  }
}

@Controller('settings')
export class SettingsPublicController {
  constructor(private readonly settingsService: SettingsService) {}

  /**
   * GET /api/settings/public
   * Unauthenticated endpoint for public settings (e.g. timezone label)
   */
  @Get('public')
  async getPublicSettings(): Promise<Pick<OrganizationSettings, 'organizationName' | 'timezoneLabel'>> {
    return this.settingsService.getPublicSettings();
  }
}
