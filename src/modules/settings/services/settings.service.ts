import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { UpdateSettingsDto } from '../dto/update-settings.dto';
import { OrganizationSettings } from '../../../generated/prisma/client';

export const DEFAULT_SETTINGS = {
  id: 'default',
  organizationName: 'PitIQ',
  timezoneLabel: 'UTC',
  defaultPassThreshold: 50,
  defaultDurationMinutes: 60,
  integrityReviewThreshold: 3,
};

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves the current organization settings.
   * If not yet created, upserts the default singleton record.
   */
  async getSettings(): Promise<OrganizationSettings> {
    return this.prisma.organizationSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: { ...DEFAULT_SETTINGS },
    });
  }

  /**
   * Partially updates organization settings.
   * Upserts the singleton record with incoming changes.
   */
  async updateSettings(dto: UpdateSettingsDto): Promise<OrganizationSettings> {
    return this.prisma.organizationSettings.upsert({
      where: { id: 'default' },
      update: { ...dto },
      create: {
        ...DEFAULT_SETTINGS,
        ...dto,
      },
    });
  }

  /**
   * Returns public-safe settings (organization name and timezone label)
   * for unauthenticated or student-facing components.
   */
  async getPublicSettings(): Promise<Pick<OrganizationSettings, 'organizationName' | 'timezoneLabel'>> {
    const settings = await this.getSettings();
    return {
      organizationName: settings.organizationName,
      timezoneLabel: settings.timezoneLabel,
    };
  }
}
