import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '../auth/auth.module';
import { NotificationsController } from './controllers/notifications.controller';
import { NotificationsAdminController } from './controllers/notifications-admin.controller';
import {
  NOTIFICATION_SERVICE,
} from './services/notification-service.interface';
import { MailTransportService } from './services/mail-transport.service';
import { NotificationService } from './services/notification.service';

@Module({
  imports: [forwardRef(() => AuthModule), ConfigModule],
  controllers: [NotificationsController, NotificationsAdminController],
  providers: [
    MailTransportService,
    NotificationService,
    {
      provide: NOTIFICATION_SERVICE,
      useExisting: NotificationService,
    },
  ],
  exports: [NotificationService, NOTIFICATION_SERVICE, MailTransportService],
})
export class NotificationsModule {}
